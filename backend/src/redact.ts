const secretKeys = /token|password|secret|credential|pin|card|api.?key/i;
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key])=>!secretKeys.test(key)).map(([key,item])=>[key,redact(item)]));
  return typeof value === 'string' && /(?:sk-[A-Za-z0-9_-]{16,}|\d{12,19})/.test(value) ? '[REDACTED]' : value;
}
export function safeError(error:unknown) { return redact(error instanceof Error ? {name:error.name,message:error.message} : {message:String(error)}); }

