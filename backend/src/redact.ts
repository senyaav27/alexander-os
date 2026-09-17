const secretKeys = /token|password|secret|credential|pin|card|api.?key/i;
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key])=>!secretKeys.test(key)).map(([key,item])=>[key,redact(item)]));
  return typeof value === 'string' && /(?:sk-[A-Za-z0-9_-]{16,}|\d{12,19}|\d{6,12}:[A-Za-z0-9_-]{20,}|Bearer\s+\S+|postgres(?:ql)?:\/\/)/i.test(value) ? '[REDACTED]' : value;
}
// Exception messages can contain request bodies, credentials and database values.
export function safeError(_error:unknown) { return {message:'operation_failed'}; }
