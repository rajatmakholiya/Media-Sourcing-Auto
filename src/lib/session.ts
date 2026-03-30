// src/lib/session.ts
// Client-side session ID — persisted in localStorage so it survives page refreshes
// Each browser tab/user gets a unique session ID

const SESSION_KEY = "scriptvideo_session_id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";

  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// Reset session (e.g. "Start fresh" button)
export function resetSession(): string {
  const id = crypto.randomUUID();
  if (typeof window !== "undefined") {
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}
