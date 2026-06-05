"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useHudStore } from "@/lib/state/hudStore";
import { ZIP_MODES } from "@/lib/constants";
import { useEmitEvent } from "@/lib/events/hooks";
import { RealtimeWebRTCClientImpl, type RealtimeWebRTCClient } from "@/lib/openai/realtime_webrtc";
import type { ZipEvent } from "@/lib/events/types";
import { usePanelContext } from "./usePanelContext";
import { analyzeAudioBuffer } from "@/lib/voice/audioTelemetry";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export function useRealtime() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const { state, setMode, setActiveTool } = useHudStore();
  const emit = useEmitEvent();
  const contextData = usePanelContext();
  
  const clientRef = useRef<RealtimeWebRTCClient | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const conversationHistoryRef = useRef<ConversationMessage[]>([]);
  const isSpeakingRef = useRef(false);
  const currentTranscriptRef = useRef("");
  const audioTelemetryCleanupRef = useRef<(() => void) | null>(null);
  const currentSpeechMessageIdRef = useRef<string | null>(null);
  const pendingConfirmationRef = useRef<{
    tool: string;
    input: unknown;
    message: string;
    originalTranscript: string;
    conversationHistory: ConversationMessage[];
  } | null>(null);

  // Map Realtime states to Zip states
  const mapRealtimeState = useCallback((realtimeState: "connecting" | "connected" | "disconnected" | "error") => {
    switch (realtimeState) {
      case "connecting":
        setMode(ZIP_MODES.WAKE_LISTEN);
        break;
      case "connected":
        setMode(ZIP_MODES.LISTENING);
        break;
      case "disconnected":
        setMode(ZIP_MODES.IDLE);
        break;
      case "error":
        setMode(ZIP_MODES.ERROR);
        break;
    }
  }, [setMode]);

  // Fallback TTS
  const speakWithFallback = useCallback(async (text: string) => {
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error("TTS request failed");
      }

      const data = await response.json();
      const audioData = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));

      // Play audio
      if (audioContextRef.current) {
        const audioBuffer = await audioContextRef.current.decodeAudioData(audioData.buffer);
        
        // Generate message ID for this speech segment
        const messageId = `tts-fallback-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const traceId = sessionIdRef.current || undefined;
        currentSpeechMessageIdRef.current = messageId;

        // Emit speech.start event
        emit({
          type: "speech.start",
          source: "tts",
          messageId,
          traceId,
          startedAt: Date.now(),
        });

        // Start audio telemetry
        if (audioTelemetryCleanupRef.current) {
          audioTelemetryCleanupRef.current();
        }
        
        audioTelemetryCleanupRef.current = analyzeAudioBuffer(
          audioBuffer,
          audioContextRef.current,
          {
            onLevel: (level: number) => {
              emit({
                type: "speech.level",
                level,
                at: performance.now(),
              });
            },
          }
        );

        // Create source for playback (separate from telemetry)
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);

        setMode(ZIP_MODES.SPEAKING);
        isSpeakingRef.current = true;

        source.onended = () => {
          // Cleanup telemetry
          if (audioTelemetryCleanupRef.current) {
            audioTelemetryCleanupRef.current();
            audioTelemetryCleanupRef.current = null;
          }

          // Emit speech.end event
          emit({
            type: "speech.end",
            source: "tts",
            messageId,
            traceId,
            endedAt: Date.now(),
          });

          setMode(ZIP_MODES.IDLE);
          isSpeakingRef.current = false;
          currentSpeechMessageIdRef.current = null;
        };
      }
    } catch (err) {
      console.error("TTS fallback error:", err);
      setMode(ZIP_MODES.ERROR);
    }
  }, [setMode, emit]);

  // Bridge integration: call orchestrator and handle response
  const callBridge = useCallback(async (userTranscript: string) => {
    if (!sessionIdRef.current) return;

    setMode(ZIP_MODES.THINKING);

    try {
      // Check if we have a pending confirmation and user said yes/no
      if (pendingConfirmationRef.current) {
        const transcriptLower = userTranscript.toLowerCase().trim();
        const isYes = /^(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed)$/i.test(transcriptLower);
        const isNo = /^(no|nope|nah|cancel|cancelled|abort)$/i.test(transcriptLower);

        if (isYes || isNo) {
          // Resubmit with confirmation
          const response = await fetch("/api/realtime/bridge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: sessionIdRef.current,
              userTranscript: pendingConfirmationRef.current.originalTranscript,
              conversationSnapshot: pendingConfirmationRef.current.conversationHistory,
              source: "voice",
              confirmation: {
                tool: pendingConfirmationRef.current.tool,
                input: pendingConfirmationRef.current.input,
                confirmed: isYes,
              },
            }),
          });

          if (!response.ok) {
            throw new Error("Bridge confirmation request failed");
          }

          const data = await response.json();

          // Clear pending confirmation
          pendingConfirmationRef.current = null;

          // Add confirmation response to history
          conversationHistoryRef.current.push({ role: "user", content: userTranscript });

          // Dispatch events from bridge
          if (data.events && Array.isArray(data.events)) {
            for (const event of data.events) {
              emit(event as ZipEvent);
              
              // Handle tool running state
              if (event.type === "tool.card") {
                setMode(ZIP_MODES.TOOL_RUNNING);
                setActiveTool(event.toolType);
              }
            }
          }

          // Add assistant response to history
          conversationHistoryRef.current.push({ role: "assistant", content: data.assistantText });

          // Send assistant text to Realtime for speech generation
          if (clientRef.current && connected && !useFallback) {
            clientRef.current.sendMessage(data.assistantText);
            setMode(ZIP_MODES.SPEAKING);
            isSpeakingRef.current = true;
          } else if (useFallback) {
            // Use TTS fallback
            await speakWithFallback(data.assistantText);
          }

          return;
        } else {
          // User didn't say yes/no, clear pending confirmation and continue normally
          pendingConfirmationRef.current = null;
        }
      }

      // Normal request
      const response = await fetch("/api/realtime/bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          userTranscript,
          conversationSnapshot: conversationHistoryRef.current,
          source: "voice",
        }),
      });

      if (!response.ok) {
        throw new Error("Bridge request failed");
      }

      const data = await response.json();

      // Dispatch events from bridge
      if (data.events && Array.isArray(data.events)) {
        for (const event of data.events) {
          emit(event as ZipEvent);
          
          // Handle tool running state
          if (event.type === "tool.card") {
            setMode(ZIP_MODES.TOOL_RUNNING);
            setActiveTool(event.toolType);
          }
        }
      }

      // Add to conversation history
      conversationHistoryRef.current.push({ role: "user", content: userTranscript });
      conversationHistoryRef.current.push({ role: "assistant", content: data.assistantText });

      // Send assistant text to Realtime for speech generation
      if (clientRef.current && connected && !useFallback) {
        clientRef.current.sendMessage(data.assistantText);
        setMode(ZIP_MODES.SPEAKING);
        isSpeakingRef.current = true;
      } else if (useFallback) {
        // Use TTS fallback
        await speakWithFallback(data.assistantText);
      }

      // Handle confirmation requirement
      if (data.requiresConfirmation) {
        // Store pending confirmation for next user turn
        pendingConfirmationRef.current = {
          tool: data.requiresConfirmation.tool,
          input: data.requiresConfirmation.input,
          message: data.requiresConfirmation.message,
          originalTranscript: userTranscript,
          conversationHistory: [...conversationHistoryRef.current],
        };
        // The assistantText already contains the yes/no question
        // Wait for next user turn to handle confirmation
      } else {
        // Clear any pending confirmation if response doesn't require it
        pendingConfirmationRef.current = null;
      }
    } catch (err) {
      console.error("Bridge error:", err);
      setMode(ZIP_MODES.ERROR);
      emit({
        type: "toast",
        level: "error",
        text: "Failed to process voice request",
        ts: Date.now(),
      });
      // Clear pending confirmation on error
      pendingConfirmationRef.current = null;
    }
  }, [emit, setMode, setActiveTool, connected, useFallback, speakWithFallback]);

  // Fallback STT
  const transcribeWithFallback = useCallback(async (audioBlob: Blob): Promise<string> => {
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");

      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("STT request failed");
      }

      const data = await response.json();
      return data.transcript;
    } catch (err) {
      console.error("STT fallback error:", err);
      throw err;
    }
  }, []);

  // Barge-in detection: monitor mic level while speaking
  const setupBargeInDetection = useCallback(() => {
    if (!mediaStreamRef.current || !audioContextRef.current) return;

    const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
    const analyser = audioContextRef.current.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let checkInterval: NodeJS.Timeout | null = null;

    const checkAudioLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      
      // If user is speaking while assistant is speaking, interrupt
      if (average > 30 && isSpeakingRef.current && clientRef.current) {
        // Stop audio telemetry
        if (audioTelemetryCleanupRef.current) {
          audioTelemetryCleanupRef.current();
          audioTelemetryCleanupRef.current = null;
        }

        // Emit speech.end event for interrupted speech
        if (currentSpeechMessageIdRef.current) {
          emit({
            type: "speech.end",
            source: "realtime",
            messageId: currentSpeechMessageIdRef.current,
            traceId: sessionIdRef.current || undefined,
            endedAt: Date.now(),
          });
          currentSpeechMessageIdRef.current = null;
        }

        clientRef.current.interrupt();
        setMode(ZIP_MODES.LISTENING);
        isSpeakingRef.current = false;
      }
    };

    checkInterval = setInterval(checkAudioLevel, 100);

    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
    };
  }, [setMode, emit]);

  const connect = useCallback(async () => {
    try {
      // Get session from server
      const response = await fetch("/api/realtime/token");
      if (!response.ok) {
        throw new Error("Failed to get Realtime session");
      }

      const sessionInfo = await response.json();
      sessionIdRef.current = sessionInfo.sessionId;

      // Try to connect with Realtime WebRTC
      try {
        const client = new RealtimeWebRTCClientImpl();
        clientRef.current = client;

        // Set up state change handler
        client.onStateChange((realtimeState) => {
          mapRealtimeState(realtimeState);
          setConnected(realtimeState === "connected");
          if (realtimeState === "error") {
            setError("Realtime connection error");
          }
        });

        // Set up transcript handler (for final transcripts)
        client.onTranscript((transcript, isFinal) => {
          if (isFinal && transcript.trim()) {
            currentTranscriptRef.current = transcript;
            // Call bridge when turn ends
            callBridge(transcript);
          }
        });

        // Set up message handler (for text responses)
        client.onMessage((message) => {
          emit({
            type: "chat.message",
            id: `msg-${Date.now()}`,
            role: "assistant",
            text: message,
            ts: Date.now(),
          });
        });

        // Set up tool call handler
        client.onToolCall((tool, args) => {
          setMode(ZIP_MODES.TOOL_RUNNING);
          setActiveTool(tool);
        });

        // Set up audio handler (for playback)
        client.onAudio((audioData) => {
          if (audioContextRef.current) {
            // Decode and play audio
            audioContextRef.current.decodeAudioData(audioData).then((audioBuffer) => {
              // Generate message ID for this speech segment
              const messageId = `realtime-${Date.now()}-${Math.random().toString(36).substring(7)}`;
              const traceId = sessionIdRef.current || undefined;
              currentSpeechMessageIdRef.current = messageId;

              // Emit speech.start event
              emit({
                type: "speech.start",
                source: "realtime",
                messageId,
                traceId,
                startedAt: Date.now(),
              });

              // Start audio telemetry
              if (audioTelemetryCleanupRef.current) {
                audioTelemetryCleanupRef.current();
              }
              
              if (audioContextRef.current) {
                audioTelemetryCleanupRef.current = analyzeAudioBuffer(
                  audioBuffer,
                  audioContextRef.current,
                  {
                    onLevel: (level: number) => {
                      emit({
                        type: "speech.level",
                        level,
                        at: performance.now(),
                      });
                    },
                  }
                );

                // Create source for playback (separate from telemetry)
                const source = audioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContextRef.current.destination);
                source.start(0);
                setMode(ZIP_MODES.SPEAKING);
                isSpeakingRef.current = true;

                source.onended = () => {
                  // Cleanup telemetry
                  if (audioTelemetryCleanupRef.current) {
                    audioTelemetryCleanupRef.current();
                    audioTelemetryCleanupRef.current = null;
                  }

                  // Emit speech.end event
                  emit({
                    type: "speech.end",
                    source: "realtime",
                    messageId,
                    traceId,
                    endedAt: Date.now(),
                  });

                  setMode(ZIP_MODES.IDLE);
                  isSpeakingRef.current = false;
                  currentSpeechMessageIdRef.current = null;
                };
              }
            }).catch((err) => {
              console.error("Audio decode error:", err);
            });
          }
        });

        // Connect with ephemeral key if available
        await client.connect(sessionInfo.sessionId, sessionInfo.ephemeralKey);
        setUseFallback(false);

        // Set up microphone capture
        if (state.micEnabled && navigator.mediaDevices) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            // Create audio context for processing
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = audioContext;

            // Set up audio processing for Realtime
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);

            processor.onaudioprocess = (e) => {
              if (state.micEnabled && connected && !isSpeakingRef.current) {
                const inputData = e.inputBuffer.getChannelData(0);
                const buffer = new ArrayBuffer(inputData.length * 2);
                const view = new DataView(buffer);
                
                for (let i = 0; i < inputData.length; i++) {
                  const s = Math.max(-1, Math.min(1, inputData[i]));
                  view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                }
                
                client.sendAudio(buffer);
              }
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            // Set up barge-in detection
            setupBargeInDetection();
          } catch (err) {
            console.error("Failed to access microphone:", err);
            setError("Microphone access denied");
          }
        }

        setError(null);
      } catch (realtimeError) {
        console.warn("Realtime connection failed, using fallback:", realtimeError);
        setUseFallback(true);
        
        // Set up fallback mode
        if (state.micEnabled && navigator.mediaDevices) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            // Create MediaRecorder for fallback
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType: "audio/webm",
            });
            mediaRecorderRef.current = mediaRecorder;

            let audioChunks: Blob[] = [];

            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                audioChunks.push(event.data);
              }
            };

            mediaRecorder.onstop = async () => {
              const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
              audioChunks = [];

              try {
                setMode(ZIP_MODES.THINKING);
                const transcript = await transcribeWithFallback(audioBlob);
                
                // Emit user message
                emit({
                  type: "chat.message",
                  id: `msg-${Date.now()}`,
                  role: "user",
                  text: transcript,
                  ts: Date.now(),
                });

                // Call bridge
                await callBridge(transcript);
              } catch (err) {
                console.error("Fallback transcription error:", err);
                setMode(ZIP_MODES.ERROR);
              }
            };

            setMode(ZIP_MODES.LISTENING);
          } catch (err) {
            console.error("Failed to access microphone for fallback:", err);
            setError("Microphone access denied");
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      setMode(ZIP_MODES.ERROR);
      emit({
        type: "toast",
        level: "error",
        text: `Voice connection failed: ${errorMessage}`,
        ts: Date.now(),
      });
    }
  }, [setMode, emit, state.micEnabled, connected, setActiveTool, mapRealtimeState, callBridge, transcribeWithFallback, setupBargeInDetection]);

  const disconnect = useCallback(() => {
    // Cleanup audio telemetry
    if (audioTelemetryCleanupRef.current) {
      audioTelemetryCleanupRef.current();
      audioTelemetryCleanupRef.current = null;
    }

    // Emit speech.end if still speaking
    if (currentSpeechMessageIdRef.current) {
      emit({
        type: "speech.end",
        source: "realtime",
        messageId: currentSpeechMessageIdRef.current,
        traceId: sessionIdRef.current || undefined,
        endedAt: Date.now(),
      });
      currentSpeechMessageIdRef.current = null;
    }

    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setConnected(false);
    setUseFallback(false);
    setMode(ZIP_MODES.IDLE);
    sessionIdRef.current = null;
  }, [setMode, emit]);

  // Handle mic button toggle
  useEffect(() => {
    if (state.micEnabled) {
      if (!connected && !useFallback) {
        connect();
      } else if (useFallback && mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
        // Start recording in fallback mode
        mediaRecorderRef.current.start();
        setMode(ZIP_MODES.LISTENING);
      }
    } else {
      if (useFallback && mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        // Stop recording and process
        mediaRecorderRef.current.stop();
      }
      disconnect();
    }
  }, [state.micEnabled, connected, useFallback, connect, disconnect, setMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connected,
    error,
    useFallback,
    connect,
    disconnect,
  };
}
