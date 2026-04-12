const VISITOR_KEY = 'sg_copilot_visitor_id';
const ACTIVE_SESSION_KEY = 'sg_copilot_active_session_id';

function fallbackVisitorId(): string {
  return `visitor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateCopilotVisitorId(): string {
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID?.() ?? fallbackVisitorId();
  window.localStorage.setItem(VISITOR_KEY, next);
  return next;
}

export function getStoredActiveCopilotSessionId(): string | null {
  return window.localStorage.getItem(ACTIVE_SESSION_KEY);
}

export function setStoredActiveCopilotSessionId(sessionId: string | null) {
  if (sessionId) {
    window.localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    return;
  }
  window.localStorage.removeItem(ACTIVE_SESSION_KEY);
}
