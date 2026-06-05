"use client";

import { useState, useEffect, useRef } from "react";
import { useEventBus } from "@/lib/events/hooks";
import { useChat } from "@/hooks/useChat";
import { useTTS } from "@/hooks/useTTS";
import type { ZipEvent } from "@/lib/events/types";
import ChatBubble from "./ChatBubble";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
}

export default function ChatStream() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage, loading } = useChat();
  const { speak, isPlaying, currentMessageId } = useTTS();

  const streamingMessageIdRef = useRef<string | null>(null);

  useEventBus((event: ZipEvent) => {
    if (event.type === "chat.clear") {
      // Clear all messages and streaming state
      setMessages([]);
      streamingMessageIdRef.current = null;
      return;
    }
    
    if (event.type === "chat.message") {
      // Clear streaming ID when a new user message arrives (new conversation turn)
      if (event.role === "user") {
        streamingMessageIdRef.current = null;
      }
      
      // Also clear streaming ID when assistant message is finalized
      if (event.role === "assistant" && event.text) {
        if (streamingMessageIdRef.current === event.id) {
          streamingMessageIdRef.current = null;
        }
      }
      
      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === event.id);
        
        if (existingIndex >= 0) {
          // Update existing message
          const updated = [...prev];
          updated[existingIndex] = {
            id: event.id,
            role: event.role,
            text: event.text,
            ts: event.ts,
          };
          
          // Clear streaming ID if this is the final assistant message
          if (event.role === "assistant" && event.text && streamingMessageIdRef.current === event.id) {
            streamingMessageIdRef.current = null;
          }
          
          return updated;
        }
        
        // Add new message
        // Don't set streaming ID here - it will be set by brain.stream events
        return [
          ...prev,
          {
            id: event.id,
            role: event.role,
            text: event.text,
            ts: event.ts,
          },
        ];
      });
    } else if (event.type === "brain.stream") {
      // Only process if there's actual delta content
      if (!event.delta || event.delta.trim() === "") {
        return;
      }
      
      setMessages((prev) => {
        const updated = [...prev];
        
        // If this delta has a messageId, use it (first delta of a new message)
        if (event.messageId) {
          streamingMessageIdRef.current = event.messageId;
          // Check if message already exists
          const existingIndex = updated.findIndex((m) => m.id === event.messageId);
          if (existingIndex === -1) {
            // Create new message with first delta
            updated.push({
              id: event.messageId!,
              role: "assistant",
              text: event.delta,
              ts: Date.now(),
            });
          } else {
            // Update existing message
            updated[existingIndex] = {
              ...updated[existingIndex],
              text: updated[existingIndex].text + event.delta,
            };
          }
          return updated;
        }
        
        // Update existing streaming message (subsequent deltas without messageId)
        const targetId = streamingMessageIdRef.current;
        if (!targetId) {
          // No streaming message ID set - create a new one (fallback)
          const newId = `stream-${Date.now()}`;
          streamingMessageIdRef.current = newId;
          updated.push({
            id: newId,
            role: "assistant",
            text: event.delta,
            ts: Date.now(),
          });
          return updated;
        }
        
        const targetIndex = updated.findIndex((m) => m.id === targetId && m.role === "assistant");
        
        if (targetIndex >= 0) {
          // Append delta to existing text
          updated[targetIndex] = {
            ...updated[targetIndex],
            text: updated[targetIndex].text + event.delta,
          };
        } else {
          // Message not found - create new one (shouldn't happen, but handle gracefully)
          updated.push({
            id: targetId,
            role: "assistant",
            text: event.delta,
            ts: Date.now(),
          });
        }
        
        return updated;
      });
    }
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-text-muted text-sm mt-8">
            No messages yet. Start a conversation.
          </div>
        ) : (
          messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              message={msg}
              onSpeak={speak}
              isPlaying={isPlaying && currentMessageId === msg.id}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 bg-panel-surface-2 border border-border rounded-md text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-cyan/50"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="px-4 py-2 bg-accent-cyan/20 border border-accent-cyan/40 text-accent-cyan rounded-md hover:bg-accent-cyan/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

