import { api, resetCsrf } from '../api.js';
import { icon, esc, toast, busy, formData, countryOptions, $ } from '../ui.js';

function frame(el, state, { title, sub, body, sideTitle, sideText }) {
  el.innerHTML = `<div class="auth">
    <aside class="auth-side"><span class="eyebrow" data-u="u-0c6158">${esc(state.settings.siteName)}</span>
      <div><h2>${sideTitle}</h2><p>${sideText}</p></div><span class="muted" data-u="u-b5f840">Secure session. Passwords are never shown or stored in your browser.</span><div class="orb"></div></aside>
    <div class="auth-main"><div class="auth-card stagger"><h1>${title}</h1><p class="sub">${sub}</p>${body}</div></div></div>`;
}

const strength = pw => {
  let s = 0; if (pw.length >= 12) s++; if (pw.length >= 16) s++; if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
};
function wireMeter(form) {
  const pw = form.querySelector('input[name=password]'), m = form.querySelector('.meter i');
  if (!pw || !m) return;
  pw.addEventListener('input', () => {
    const s = strength(pw.value);
    m.style.width = `${(s / 5) * 100}%`;
    m.style.background = pw.value.length < 12 ? 'var(--rose)' : s >= 4 ? 'var(--teal)' : 'var(--amber)';
  });
}
const pwField = (label = 'Password', name = 'password', ac = 'new-password') => `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="password" minlength="12" maxlength="128" required autocomplete="${ac}"><div class="meter" aria-hidden="true"><i></i></div><span class="hint">At least 12 characters. A short sentence works well.</span></div>`;
const showErr = (form, msg) => { const b = form.querySelector('.form-error'); b.hidden = !msg; b.textContent = msg || ''; };
const safeNext = n => (n && n.startsWith('/') && !n.startsWith('//') ? n : null);

export function login(el, { state, query, navigate }) {
  document.title = `Sign in | ${state.settings.siteName}`;
  frame(el, state, {
    title: 'Welcome back', sub: 'Sign in to your wallet and orders.', sideTitle: 'Every order, accounted for.', sideText: 'Pick up where you left off: live statuses, wallet history and refunds in one ledger.',
    body: `<form novalidate><div class="form-error" hidden></div>
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password"></div>
      <div class="row" data-u="u-931c58"><a href="/forgot-password" data-u="u-bfc824">Forgot password?</a></div>
      <button class="btn block signal" data-busy="Signing in">Sign in ${icon('arrow')}</button></form>
      ${state.settings.registrationOpen !== false ? '<p class="alt">New here? <a href="/register">Create an account</a></p>' : ''}`,
  });
  const f = $('form', el);
  f.onsubmit = e => {
    e.preventDefault();
    const d = formData(f);
    if (!d.email || !d.password) return showErr(f, 'Enter your email and password.');
    busy(f.querySelector('button'), async () => {
      try {
        const r = await api('/auth/login', { method: 'POST', body: { email: d.email, password: d.password } });
        resetCsrf(); state.user = r.user; toast(`Signed in as ${r.user.name}`);
        const admin = r.user.role !== 'user';
        navigate(safeNext(query.get('next')) || (admin ? '/admin' : '/dashboard'), true);
      } catch (err) { showErr(f, err.status === 503 ? 'Accounts are not available until setup is complete.' : err.message); }
    });
  };
}

export function register(el, { state, navigate }) {
  document.title = `Create account | ${state.settings.siteName}`;
  if (state.settings.registrationOpen === false) {
    frame(el, state, { title: 'Registration closed', sub: 'New sign ups are paused right now.', sideTitle: 'Back soon.', sideText: 'The owner has temporarily closed registration.', body: '<a class="btn block" href="/login">Sign in instead</a>' });
    return;
  }
  frame(el, state, {
    title: 'Create your account', sub: 'One wallet for every service. Takes a minute.', sideTitle: 'Kenya pays by M-Pesa. The world pays by card.', sideText: 'Your country decides your payment rail, so choose it carefully. It locks after your first payment or order.',
    body: `<form novalidate><div class="form-error" hidden></div>
      <div class="field"><label for="name">Full name</label><input id="name" name="name" required maxlength="80" autocomplete="name"></div>
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email"></div>
      <div class="field"><label for="country">Country</label><select id="country" name="country">${countryOptions('KE')}</select><span class="hint" id="rail">Kenya: wallet top ups via M-Pesa.</span></div>
      ${pwField()}
      <button class="btn block signal" data-busy="Creating account">Create account ${icon('arrow')}</button></form>
      <p class="alt">Already registered? <a href="/login">Sign in</a></p>`,
  });
  const f = $('form', el);
  wireMeter(f);
  f.country.onchange = () => { $('#rail', el).textContent = f.country.value === 'KE' ? 'Kenya: wallet top ups via M-Pesa.' : 'Outside Kenya: wallet top ups via hosted card checkout.'; };
  f.onsubmit = e => {
    e.preventDefault();
    const d = formData(f);
    if (!d.name) return showErr(f, 'Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(d.email)) return showErr(f, 'Enter a valid email address.');
    if (d.password.length < 12 || d.password.length > 128) return showErr(f, 'Password must be 12 to 128 characters.');
    busy(f.querySelector('button'), async () => {
      try {
        const r = await api('/auth/register', { method: 'POST', body: { name: d.name, email: d.email, password: d.password, country: d.country } });
        resetCsrf(); state.user = r.user;
        toast(r.user.role === 'super_admin' ? 'Account created. You are the owner of this panel.' : 'Account created. Welcome aboard.');
        navigate(r.user.role === 'super_admin' ? '/admin/settings' : '/dashboard', true);
      } catch (err) { showErr(f, err.status === 503 ? 'Registration opens once the database is configured.' : err.message); }
    });
  };
}

export function forgot(el, { state }) {
  document.title = `Reset password | ${state.settings.siteName}`;
  frame(el, state, {
    title: 'Forgot password', sub: 'We will email a reset link if the address has an account.', sideTitle: 'Locked out happens.', sideText: 'Reset links are single use and expire quickly.',
    body: `<form novalidate><div class="form-error" hidden></div><div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email"></div>
      <button class="btn block signal" data-busy="Sending">Send reset link</button></form><p class="alt"><a href="/login">Back to sign in</a></p>`,
  });
  const f = $('form', el);
  f.onsubmit = e => {
    e.preventDefault();
    const d = formData(f);
    if (!/^\S+@\S+\.\S+$/.test(d.email)) return showErr(f, 'Enter a valid email address.');
    busy(f.querySelector('button'), async () => {
      try {
        const r = await api('/auth/forgot', { method: 'POST', body: { email: d.email } });
        f.outerHTML = `<div class="note ok">${icon('mail')}<span>${esc(r.message || 'If that email is registered, a reset link is on its way.')}</span></div>`;
      } catch (err) { showErr(f, err.message); }
    });
  };
}

export function reset(el, { state, query, navigate }) {
  document.title = `Choose a new password | ${state.settings.siteName}`;
  const token = query.get('token');
  frame(el, state, {
    title: 'New password', sub: token ? 'Choose a strong password you have not used here before.' : 'This reset link is missing its token.', sideTitle: 'Fresh start.', sideText: 'After resetting, sign in with your new password.',
    body: token ? `<form novalidate><div class="form-error" hidden></div>${pwField('New password')}
      <div class="field"><label for="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" required autocomplete="new-password"></div>
      <button class="btn block signal" data-busy="Saving">Set new password</button></form>` : '<a class="btn block" href="/forgot-password">Request a new link</a>',
  });
  const f = $('form', el);
  if (!f) return;
  wireMeter(f);
  f.onsubmit = e => {
    e.preventDefault();
    const d = formData(f);
    if (d.password.length < 12 || d.password.length > 128) return showErr(f, 'Password must be 12 to 128 characters.');
    if (d.password !== d.confirm) return showErr(f, 'Passwords do not match.');
    busy(f.querySelector('button'), async () => {
      try {
        const r = await api('/auth/reset', { method: 'POST', body: { token, password: d.password } });
        toast(r.message || 'Password updated. Sign in with your new password.');
        navigate('/login', true);
      } catch (err) { showErr(f, err.message); }
    });
  };
}
