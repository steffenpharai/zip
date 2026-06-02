/**
 * Session Store - In-memory session management for Realtime connections
 * 
 * Stores session mappings for bridge endpoint validation
 */

// In-memory session store: sessionId -> { createdAt, expiresAt, clientSecret }
const sessionStore = new Map<
  string,
  { createdAt: number; expiresAt: number; clientSecret?: string }
>();

// Cleanup expired sessions every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessionStore.entries()) {
      if (session.expiresAt < now) {
        sessionStore.delete(sessionId);
      }
    }
  }, 5 * 60 * 1000);
}

export function getSession(sessionId: string): { createdAt: number; expiresAt: number; clientSecret?: string } | undefined {
  return sessionStore.get(sessionId);
}

export function setSession(
  sessionId: string,
  session: { createdAt: number; expiresAt: number; clientSecret?: string }
): void {
  sessionStore.set(sessionId, session);
}

export function deleteSession(sessionId: string): void {
  sessionStore.delete(sessionId);
}

