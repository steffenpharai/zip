/**
 * TTS Hook - Text-to-Speech playback for assistant messages
 */

import { useState, useCallback, useRef } from "react";
import { useEmitEvent } from "@/lib/events/hooks";
import { analyzeAudioElement } from "@/lib/voice/audioTelemetry";

export function useTTS() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioTelemetryCleanupRef = useRef<(() => void) | null>(null);
  const emit = useEmitEvent();

  const speak = useCallback(async (text: string, messageId: string) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      // Cleanup telemetry for previous audio
      if (audioTelemetryCleanupRef.current) {
        audioTelemetryCleanupRef.current();
        audioTelemetryCleanupRef.current = null;
      }

      // Emit speech.end for previous audio if it was playing
      if (isPlaying && currentMessageId) {
        emit({
          type: "speech.end",
          source: "tts",
          messageId: currentMessageId,
          endedAt: Date.now(),
        });
      }

      audioRef.current.pause();
      audioRef.current = null;
    }

    // If clicking the same message, stop it
    if (isPlaying && currentMessageId === messageId) {
      setIsPlaying(false);
      setCurrentMessageId(null);
      return;
    }

    try {
      setIsPlaying(true);
      setCurrentMessageId(messageId);

      // Call TTS endpoint
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

      // Create audio element and play
      const audioBlob = new Blob([audioData], { type: `audio/${data.format}` });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Emit speech.start event
      emit({
        type: "speech.start",
        source: "tts",
        messageId,
        startedAt: Date.now(),
      });

      // Start audio telemetry
      audioTelemetryCleanupRef.current = analyzeAudioElement(audio, {
        onLevel: (level: number) => {
          emit({
            type: "speech.level",
            level,
            at: performance.now(),
          });
        },
      });

      audio.onended = () => {
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
          endedAt: Date.now(),
        });

        setIsPlaying(false);
        setCurrentMessageId(null);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      audio.onerror = () => {
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
          endedAt: Date.now(),
        });

        setIsPlaying(false);
        setCurrentMessageId(null);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
    } catch (error) {
      console.error("TTS error:", error);
      setIsPlaying(false);
      setCurrentMessageId(null);
    }
  }, [isPlaying, currentMessageId, emit]);

  const stop = useCallback(() => {
    // Cleanup telemetry
    if (audioTelemetryCleanupRef.current) {
      audioTelemetryCleanupRef.current();
      audioTelemetryCleanupRef.current = null;
    }

    // Emit speech.end event if currently playing
    if (isPlaying && currentMessageId) {
      emit({
        type: "speech.end",
        source: "tts",
        messageId: currentMessageId,
        endedAt: Date.now(),
      });
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setCurrentMessageId(null);
  }, [isPlaying, currentMessageId, emit]);

  return {
    speak,
    stop,
    isPlaying,
    currentMessageId,
  };
}

