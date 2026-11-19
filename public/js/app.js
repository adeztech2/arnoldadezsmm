import { api, resetCsrf } from './api.js';
import { icon, esc, initials, money, toast } from './ui.js';
import * as pub from './pages/public.js';
import * as auth from './pages/auth.js';
import * as cust from './pages/customer.js';
import * as admin from './pages/admin.js';

const DEFAULT_SETTINGS = { siteName: 'ADEZ SMM', tagline: 'Social growth services with orders you can actually follow.', iconUrl: '', supportEmail: '', walletCurrency: 'KES', paystackCurrency: 'KES', minDeposit: 10000, announcement: '', registrationOpen: true, maintenance: false, configured: false };

export const state = { settings: { ...DEFAULT_SETTINGS }, user: null };

const routes = [
  ['/', pub.landing, 'public'],
  ['/services', pub.catalog, 'public'],
  ['/login', auth.login, 'auth'],
  ['/register', auth.register, 'auth'],
  ['/forgot-password', auth.forgot, 'auth'],
  ['/reset-password', auth.reset, 'auth'],
  ['/dashboard', cust.dashboard, 'user'],
  ['/new-order', cust.newOrder, 'user'],
  ['/bulk-orders', cust.bulkOrders, 'user'],
  ['/orders', cust.orders, 'user'],
  ['/orders/:id', cust.orderDetail, 'user'],
  ['/wallet', cust.wallet, 'user'],
  ['/account', cust.account, 'user'],
  ['/admin', admin.summary, 'admin'],
  ['/admin/services', admin.services, 'admin'],
  ['/admin/orders', admin.orders, 'admin'],
  ['/admin/payments', admin.payments, 'admin'],
  ['/admin/users', admin.users, 'admin'],
  ['/admin/settings', admin.settings, 'admin'],
  ['/admin/audit', admin.audit, 'admin'],
];

function match(path) {
  const clean = path.replace(/\/+$/, '') || '/';
  for (const [pattern, fn, kind] of routes) {
    const pp = pattern.split('/'), cp = clean.split('/');
    if (pp.length !== cp.length) continue;
    const params = {};
    if (pp.every((seg, i) => seg.startsWith(':') ? (params[seg.slice(1)] = decodeURIComponent(cp[i]), true) : seg === cp[i])) return { fn, kind, params, pattern };
  }
  return null;
}

export function navigate(to, replace = false) {
  if (replace) history.replaceState({}, '', to); else history.pushState({}, '', to);
  render();
}

export async function refreshUser() {
  try { const r = await api('/auth/me'); state.user = r.user || null; } catch { state.user = null; }
  return state.user;
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  resetCsrf(); state.user = null; toast('Signed out'); navigate('/');
}

const isAdmin = u => u && (u.role === 'admin' || u.role === 'super_admin');

function brand() {
  const s = state.settings;
  return `<a href="/" class="brand"><img src="${esc(s.iconUrl || '/assets/logo-mark.svg')}" alt="" class="brand-img"><span>${esc(s.siteName || 'ADEZ SMM')}</span></a>`;
}

function banners() {
  const s = state.settings;
  let h = '';
  if (s.maintenance) h += `<div class="banner warn">Maintenance mode is on. New orders and payments may be paused.</div>`;
  if (s.announcement) h += `<div class="banner">${esc(s.announcement)}</div>`;
  return h;
}

function publicShell(path) {
  const u = state.user;
  const on = p => path === p ? 'on' : '';
  return `${banners()}<header class="pub-head"><div class="in">${brand()}<nav class="pub-nav" aria-label="Main">
    <a class="lnk hide-s ${on('/')}" href="/">Overview</a><a class="lnk ${on('/services')}" href="/services">Services</a>
    ${u ? `<a class="btn sm" href="${isAdmin(u) ? '/admin' : '/dashboard'}">Open dashboard</a>` :
      `<a class="lnk ${on('/login')}" href="/login">Sign in</a>${state.settings.registrationOpen !== false ? '<a class="btn sm signal" href="/register">Create account</a>' : ''}`}
  </nav></div></header><main id="main"></main>`;
}

function appShell(path) {
  const u = state.user;
  const nav = (href, ic, label) => `<a class="nav ${path === href || (href !== '/admin' && href !== '/dashboard' && path.startsWith(href + '/')) ? 'on' : ''}" href="${href}">${icon(ic)}<span>${label}</span></a>`;
  return `${banners()}<div class="shell">
  <aside class="side" id="side" aria-label="Sidebar">${brand()}
    <div class="grp">Workspace</div>
    ${nav('/dashboard', 'home', 'Dashboard')}${nav('/new-order', 'plus', 'New order')}${nav('/bulk-orders', 'layers', 'Bulk orders')}${nav('/orders', 'list', 'Orders')}${nav('/wallet', 'wallet', 'Wallet')}${nav('/services', 'grid', 'Service catalog')}${nav('/account', 'user', 'Account')}
    ${isAdmin(u) ? `<div class="grp">Owner console</div>${nav('/admin', 'chart', 'Overview')}${nav('/admin/services', 'tag', 'Pricing')}${nav('/admin/orders', 'file', 'All orders')}${nav('/admin/payments', 'card', 'Payments')}${nav('/admin/users', 'users', 'Users')}${nav('/admin/settings', 'settings', 'Settings')}${nav('/admin/audit', 'shield', 'Audit log')}` : ''}
    <div class="me"><div class="avatar">${esc(initials(u.name))}</div><div class="who"><b>${esc(u.name)}</b><span>${money(u.balance, state.settings.walletCurrency)}</span></div>
    <button class="iconbtn" data-logout aria-label="Sign out" title="Sign out">${icon('logout')}</button></div>
  </aside>
  <div><div class="topbar"><button class="iconbtn" data-menu aria-label="Open menu">${icon('menu')}</button>${brand()}</div>
  <main id="main" class="main"></main></div></div>`;
}

let renderSeq = 0;
export async function render() {
  const seq = ++renderSeq;
  const url = new URL(location.href);
  const path = url.pathname;
  const m = match(path);
  const app = document.getElementById('app');
  document.querySelectorAll('.scrim').forEach(s => s.remove());
  if (!m) {
    app.innerHTML = publicShell(path);
    document.getElementById('main').innerHTML = `<div class="wrap" data-u="u-bcd19a"><div class="card" data-u="u-0318d9"><div class="empty"><div class="glyph">${icon('globe')}</div><h3>Page not found</h3><p>That address does not exist here.</p><a class="btn" href="/">Back to overview</a></div></div></div>`;
    document.title = 'Not found | ' + state.settings.siteName;
    return;
  }
  if ((m.kind === 'user' || m.kind === 'admin') && !state.user) return navigate('/login?next=' + encodeURIComponent(path + url.search), true);
  if (m.kind === 'admin' && !isAdmin(state.user)) { toast('That area is for owners and admins.', 'error'); return navigate('/dashboard', true); }
  if (m.kind === 'auth' && state.user && path !== '/reset-password') return navigate(isAdmin(state.user) ? '/admin' : '/dashboard', true);

  const useApp = state.user && (m.kind === 'user' || m.kind === 'admin' || (m.kind === 'public' && path === '/services'));
  app.innerHTML = useApp ? appShell(path) : publicShell(path);
  const el = document.getElementById('main');
  document.querySelectorAll('img.brand-img').forEach(i => i.addEventListener('error', () => { i.src = '/assets/logo-mark.svg'; }, { once: true }));
  window.scrollTo(0, 0);
  try {
    await m.fn(el, { params: m.params, query: url.searchParams, state, navigate, refreshUser, isStale: () => seq !== renderSeq, rerenderShell });
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="card"><div class="empty"><div class="glyph">${icon('alert')}</div><h3>Something broke</h3><p>${esc(e.message)}</p></div></div>`;
  }
}

function rerenderShell() {
  const who = document.querySelector('.me .who span');
  if (who && state.user) who.textContent = money(state.user.balance, state.settings.walletCurrency);
}

document.addEventListener('click', e => {
  const a = e.target.closest('a[href]');
  if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !a.target && !a.hasAttribute('download')) {
    const href = a.getAttribute('href');
    if (href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/smm-api')) { e.preventDefault(); navigate(href); return; }
  }
  if (e.target.closest('[data-logout]')) logout();
  if (e.target.closest('[data-menu]')) {
    document.getElementById('side').classList.add('open');
    const s = document.createElement('div'); s.className = 'scrim'; s.onclick = () => { document.getElementById('side').classList.remove('open'); s.remove(); };
    document.body.appendChild(s);
  }
});
window.addEventListener('popstate', render);

(async function boot() {
  try {
    const s = await api('/public/settings');
    state.settings = { ...DEFAULT_SETTINGS, ...s };
  } catch { state.settings = { ...DEFAULT_SETTINGS, configured: false }; }
  await refreshUser();
  render();
})();
