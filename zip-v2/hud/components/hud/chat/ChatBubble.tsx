"use client";

interface ChatBubbleProps {
  message: {
    id: string;
    role: "user" | "assistant";
    text: string;
    ts: number;
  };
  onSpeak: (text: string, messageId: string) => void;
  isPlaying: boolean;
}

export default function ChatBubble({ message, onSpeak, isPlaying }: ChatBubbleProps) {
  const isUser = message.role === "user";

  const handleSpeak = () => {
    if (!isUser) {
      onSpeak(message.text, message.id);
    }
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} items-start gap-2`}>
      {!isUser && (
        <button
          onClick={handleSpeak}
          className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md border transition-colors ${
            isPlaying
              ? "bg-accent-cyan/30 border-accent-cyan/60 text-accent-cyan"
              : "bg-panel-surface-2 border-border text-text-muted hover:text-text-primary hover:border-accent-cyan/40"
          }`}
          aria-label={isPlaying ? "Stop speaking" : "Play message"}
          title={isPlaying ? "Stop speaking" : "Play message"}
        >
          {isPlaying ? (
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
      )}
      <div
        className={`max-w-[80%] px-3 py-2 rounded-md ${
          isUser
            ? "bg-accent-cyan/20 border border-accent-cyan/40 text-accent-cyan"
            : "bg-panel-surface-2 border border-border text-text-primary"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
      </div>
    </div>
  );
}

