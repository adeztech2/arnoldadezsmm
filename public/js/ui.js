const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M6 6V5a2 2 0 012-2h9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 15c2 .6 3.2 2.2 3.8 5"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9-9-9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  refresh: '<path d="M21 12a9 9 0 01-15.5 6.3L3 16"/><path d="M3 12a9 9 0 0115.5-6.3L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  play: '<path d="M7 4l13 8-13 8V4z"/>',
  file: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z"/><path d="M14 3v6h6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
  rotate: '<path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.info}</svg>`;
}

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function money(minor, currency = 'KES') {
  const n = Number(minor || 0) / 100;
  try { return new Intl.NumberFormat('en-KE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}
export function major(n, currency = 'KES', digits = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '';
  try { return new Intl.NumberFormat('en-KE', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 4) }).format(Number(n)); }
  catch { return `${currency} ${Number(n).toFixed(digits)}`; }
}
export function num(n) { return new Intl.NumberFormat('en-KE').format(Number(n || 0)); }
export function date(v, withTime = true) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
}
export function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase(); }

const STATUS = {
  Completed: 'ok', completed: 'ok', Partial: 'run', Pending: 'run', pending: 'run', Processing: 'run', 'In progress': 'run',
  Submitting: 'run', initializing: 'run', 'Submission uncertain': 'sig', review: 'sig', Canceled: 'bad', Failed: 'bad', failed: 'bad',
};
export function badge(status) { return `<span class="badge ${STATUS[status] || ''}">${esc(status)}</span>`; }

export function toast(msg, type = 'ok') {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, type === 'error' ? 6000 : 3800);
}

export function skeleton(rows = 4, h = 18) {
  return `<div class="card" aria-busy="true" aria-label="Loading">${Array.from({ length: rows }, (_, i) => `<div class="sk sh${h} sw${i % 3}${i ? ' mt14' : ''}"></div>`).join('')}</div>`;
}
export function statSkeleton(n = 4) {
  return `<div class="stats">${Array.from({ length: n }, () => '<div class="stat"><div class="sk" data-u="u-249280"></div><div class="sk" data-u="u-4cbfb2"></div></div>').join('')}</div>`;
}

export function empty({ glyph = 'list', title, text = '', action = '' }) {
  return `<div class="empty"><div class="glyph">${icon(glyph)}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}

export function errorState(el, err, retry) {
  if (err && err.status === 503) {
    el.innerHTML = `<div class="card">${empty({ glyph: 'database', title: 'Setup in progress', text: 'The database or provider settings are not configured yet. Once the owner finishes setup, live data will appear here.' })}</div>`;
    return;
  }
  el.innerHTML = `<div class="card">${empty({ glyph: 'alert', title: 'Could not load this view', text: err?.message || 'Something went wrong.', action: '<button class="btn ghost" data-retry>' + icon('refresh') + 'Try again</button>' })}</div>`;
  const b = el.querySelector('[data-retry]');
  if (b && retry) b.onclick = retry;
}

export async function busy(btn, fn) {
  if (btn.disabled) return;
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${esc(btn.dataset.busy || 'Working')}`;
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = html; }
}

export function modal(html, onMount) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const prev = document.activeElement;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); prev && prev.focus && prev.focus(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  document.body.appendChild(bg);
  bg.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  const f = bg.querySelector('input,select,textarea,button:not([data-close])');
  f && f.focus();
  onMount && onMount(bg.querySelector('.modal'), close);
  return close;
}

export function confirmDialog({ title, text, confirm = 'Confirm', danger = false }) {
  return new Promise(res => {
    let done = false;
    const close = modal(`<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><div class="actions"><button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'signal'}" data-ok>${esc(confirm)}</button></div>`, (m, c) => {
      m.querySelector('[data-ok]').onclick = () => { done = true; c(); res(true); };
    });
    const obs = new MutationObserver(() => { if (!document.querySelector('.modal-bg')) { obs.disconnect(); if (!done) res(false); } });
    obs.observe(document.body, { childList: true });
    void close;
  });
}

export function pager(page, pages, total) {
  if (!pages || pages <= 1) return total ? `<div class="pager">${num(total)} total</div>` : '';
  return `<div class="pager"><span>Page ${page} of ${pages} &middot; ${num(total)} total</span>
  <button class="btn ghost sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon('back')}Prev</button>
  <button class="btn ghost sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next${icon('arrow')}</button></div>`;
}

export function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}

export function reveal(root = document) {
  const els = $$('.rv', root);
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  els.forEach(e => io.observe(e));
}

export const COUNTRIES = [
  ['KE', 'Kenya'], ['UG', 'Uganda'], ['TZ', 'Tanzania'], ['RW', 'Rwanda'], ['ET', 'Ethiopia'], ['NG', 'Nigeria'], ['GH', 'Ghana'], ['ZA', 'South Africa'],
  ['EG', 'Egypt'], ['MA', 'Morocco'], ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['DE', 'Germany'], ['FR', 'France'],
  ['NL', 'Netherlands'], ['ES', 'Spain'], ['IT', 'Italy'], ['SE', 'Sweden'], ['AE', 'United Arab Emirates'], ['SA', 'Saudi Arabia'], ['IN', 'India'], ['PK', 'Pakistan'],
  ['PH', 'Philippines'], ['ID', 'Indonesia'], ['MY', 'Malaysia'], ['SG', 'Singapore'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['BR', 'Brazil'], ['MX', 'Mexico'],
];
export function countryOptions(sel) {
  const has = COUNTRIES.some(c => c[0] === sel);
  return (sel && !has ? `<option value="${esc(sel)}" selected>${esc(sel)}</option>` : '') +
    COUNTRIES.map(([c, n]) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${n}</option>`).join('');
}
export function countryName(c) { const f = COUNTRIES.find(x => x[0] === c); return f ? f[1] : c; }
