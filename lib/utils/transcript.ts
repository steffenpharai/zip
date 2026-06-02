import type { ZipEvent } from "@/lib/events/types";

export function extractConversation(events: ZipEvent[]): {
  json: string;
  text: string;
} {
  const messages = events
    .filter((e) => e.type === "chat.message")
    .map((e) => {
      if (e.type === "chat.message") {
        return {
          id: e.id,
          role: e.role,
          text: e.text,
          timestamp: new Date(e.ts).toISOString(),
        };
      }
      return null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const json = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      messages,
    },
    null,
    2
  );

  const text = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
    .join("\n\n");

  return { json, text };
}

export function downloadTranscript(json: string, text: string): void {
  // Download JSON
  const jsonBlob = new Blob([json], { type: "application/json" });
  const jsonUrl = URL.createObjectURL(jsonBlob);
  const jsonLink = document.createElement("a");
  jsonLink.href = jsonUrl;
  jsonLink.download = `transcript-${Date.now()}.json`;
  document.body.appendChild(jsonLink);
  jsonLink.click();
  document.body.removeChild(jsonLink);
  URL.revokeObjectURL(jsonUrl);

  // Download TXT
  const txtBlob = new Blob([text], { type: "text/plain" });
  const txtUrl = URL.createObjectURL(txtBlob);
  const txtLink = document.createElement("a");
  txtLink.href = txtUrl;
  txtLink.download = `transcript-${Date.now()}.txt`;
  document.body.appendChild(txtLink);
  txtLink.click();
  document.body.removeChild(txtLink);
  URL.revokeObjectURL(txtUrl);
}

