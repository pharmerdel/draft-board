export function timerRemainingMs(draft, now = Date.now()) {
  if (!draft?.timerEnabled || draft.timerStartedAt == null) return null;
  const durationMs = (draft.timerDuration ?? 90) * 1000;
  return Math.max(0, draft.timerStartedAt + durationMs - now);
}

export function resumedTimerStartedAt(draft, now = Date.now()) {
  if (!draft?.timerEnabled || draft.pausedTimerRemainingMs == null) return null;
  const durationMs = (draft.timerDuration ?? 90) * 1000;
  const remainingMs = Math.max(0, Math.min(durationMs, draft.pausedTimerRemainingMs));
  return now - (durationMs - remainingMs);
}
