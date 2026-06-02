/**
 * Derive related URLs from the zip-brain WebSocket URL.
 *
 * The HUD's primary handle is `ws://<host>:<port>/ws`. From that we can
 * compute the matching HTTP base (`http://<host>:<port>`) for the camera
 * stream, /health, /cam/list, etc.
 */

export function brainHttpBase(wsUrl: string): string {
  // ws://...  → http://...
  // wss://... → https://...
  const httpish = wsUrl.replace(/^ws(s?):\/\//i, "http$1://");
  // Drop the trailing /ws (or /ws/) path.
  return httpish.replace(/\/ws\/?$/i, "");
}

export function camStreamUrl(wsUrl: string, name: string): string {
  return `${brainHttpBase(wsUrl)}/cam/${encodeURIComponent(name)}`;
}
