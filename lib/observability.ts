// Central error/event capture. Emits ONE structured JSON line per event so a log
// pipeline can alert on it, and provides a single seam to forward to a real
// monitor (Sentry/Datadog) once its DSN is configured — no business data in the
// payload beyond the caller-supplied context, which callers must keep non-sensitive.

type Level = "error" | "warn" | "info";

function emit(level: Level, message: string, context: Record<string, unknown>): void {
  const line = JSON.stringify({ level, message, ...context, at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  // Forwarding hook: when process.env.SENTRY_DSN (or equivalent) is set and the
  // SDK is added, forward here. Kept dependency-free until that decision is made.
}

export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  const e = err instanceof Error ? err : new Error(String(err));
  emit("error", e.message, { ...context, stack: e.stack });
}

export function captureWarning(message: string, context: Record<string, unknown> = {}): void {
  emit("warn", message, context);
}

export function logEvent(message: string, context: Record<string, unknown> = {}): void {
  emit("info", message, context);
}
