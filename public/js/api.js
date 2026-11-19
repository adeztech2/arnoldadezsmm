let csrf = null;

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export function resetCsrf() { csrf = null; }

async function getCsrf() {
  if (!csrf) {
    const r = await fetch('/smm-api/auth/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!r.ok) throw new ApiError(r.status === 503 ? 'Service is not configured yet.' : 'Could not start a secure session.', r.status);
    csrf = (await r.json()).csrfToken;
  }
  return csrf;
}

export async function api(path, { method = 'GET', body } = {}, retried = false) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-Token'] = await getCsrf();
  }
  let r;
  try {
    r = await fetch('/smm-api' + path, { method, headers, credentials: 'same-origin', body: method !== 'GET' ? JSON.stringify(body || {}) : undefined });
  } catch {
    throw new ApiError('Network error. Check your connection and try again.', 0);
  }
  let data = null;
  try { data = await r.json(); } catch { /* non-JSON */ }
  if (!r.ok) {
    const msg = data && data.error ? data.error : `Request failed (${r.status})`;
    if (r.status === 403 && /csrf/i.test(msg) && !retried && method !== 'GET') {
      csrf = null;
      return api(path, { method, body }, true);
    }
    throw new ApiError(msg, r.status);
  }
  return data || {};
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
