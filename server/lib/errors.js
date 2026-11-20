export class AppError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.status = status;
    this.uncertain = options.uncertain || false;
  }
}
export const fail = (status, message) => { throw new AppError(status, message); };
export function text(value, name, min = 1, max = 200) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    fail(400, `${name} must contain ${min} to ${max} characters.`);
  }
  return value.trim();
}
export function integer(value, name, min = 0, max = 1000000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(400, `${name} is invalid.`);
  return value;
}
export function positive(value, name, max = 1000000) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) fail(400, `${name} is invalid.`);
  return value;
}
export function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'A JSON object is required.');
  return value;
}
export function objectId(value) {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{24}|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(value)) fail(400, 'Invalid identifier.');
  return value;
}
export function safeUrl(value, name = 'URL') {
  const input = text(value, name, 8, 2048);
  let url;
  try { url = new URL(input); } catch { fail(400, `${name} must be a valid HTTPS URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password) fail(400, `${name} must be a valid HTTPS URL.`);
  return url.href;
}
