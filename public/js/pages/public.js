import { api } from '../api.js';
import { icon, esc, major, num, reveal, skeleton, empty, errorState, $ } from '../ui.js';

export async function landing(el, { state }) {
  const s = state.settings;
  document.title = `${s.siteName} | Social growth orders you can track`;
  const reg = s.registrationOpen !== false;
  el.innerHTML = `
  <div class="wrap">
    <section class="hero">
      <div class="stagger">
        <span class="eyebrow">Kenyan payments, global catalog</span>
        <h1>Growth orders with a <em>paper trail.</em></h1>
        <p class="lead">${esc(s.tagline || 'Order social media services from one wallet and follow every order from submission to completion, with refunds that land back in your balance.')}</p>
        <div class="row cta">
          ${reg ? `<a class="btn signal" href="/register">Create a free account ${icon('arrow')}</a>` : '<span class="tag">Registration is currently closed</span>'}
          <a class="btn ghost" href="/services">Browse the live catalog</a>
        </div>
        <p class="muted" data-u="u-f85cd1">M-Pesa top ups for Kenya. Card checkout for everyone else.</p>
      </div>
      <div class="hero-art rv">
        <img src="/assets/signal.svg" alt="">
        <div class="ticket" aria-hidden="true">
          <div class="row" data-u="u-daae84"><span class="mono">Order lifecycle</span><span class="badge run">In progress</span></div>
          <div class="steps"><span class="on"></span><span class="on"></span><span class="now"></span><span></span></div>
          <div class="row muted" data-u="u-1531d8"><span>Submitted</span><span>Pending</span><span>In progress</span><span>Completed</span></div>
        </div>
      </div>
    </section>

    <section class="section rv">
      <span class="eyebrow">How it works</span>
      <h2>Four steps, every one of them visible.</h2>
      <div class="flow">
        <div><b>01</b><h3>Fund your wallet</h3><p>Top up in ${esc(s.walletCurrency)} from a minimum of ${major((s.minDeposit || 0) / 100, s.walletCurrency, 0)}. Your balance is spent per order, never pre-committed.</p></div>
        <div><b>02</b><h3>Pick a service</h3><p>Only services that are live upstream and priced by the owner appear. No dead listings.</p></div>
        <div><b>03</b><h3>Submit details</h3><p>The form adapts to the service: links, usernames, comments or keywords, exactly what it needs.</p></div>
        <div><b>04</b><h3>Track to the end</h3><p>Every status change is timestamped in the order history, with start count and remaining quantity.</p></div>
      </div>
    </section>

    <section class="section rv">
      <div class="split">
        <div>
          <span class="eyebrow">Straight dealing</span>
          <h2>Built on rules we will not bend.</h2>
          <p class="sub">An SMM panel is only as good as what happens when something goes wrong. These are the defaults, not upgrades.</p>
        </div>
        <div class="ledger">
          <div class="li">${icon('shield')}<div><h3>Uncertain submissions are held, not guessed</h3><p>If the provider response is unclear, the order is paused for a human check instead of being sent twice.</p></div></div>
          <div class="li">${icon('undo')}<div><h3>Refunds return to your wallet</h3><p>Failed, canceled and partial orders credit the unused amount back to your balance for your next order.</p></div></div>
          <div class="li">${icon('clock')}<div><h3>Cancel and refill are requests</h3><p>Where a service supports them you can request either. We show the outcome, we do not promise instant results.</p></div></div>
          <div class="li">${icon('layers')}<div><h3>Bulk ordering with independent results</h3><p>Place up to 25 orders at once across different services. One failure never blocks the rest.</p></div></div>
        </div>
      </div>
    </section>

    <section class="section rv">
      <span class="eyebrow">Payments</span>
      <h2>Two rails, chosen by where you are.</h2>
      <div class="pay-cards">
        <div class="pay-card dark"><span class="tag">${icon('phone')} Kenya</span><h3>M-Pesa STK push</h3><p>Enter your Safaricom number, approve on your phone, and your wallet updates as soon as the payment confirms.</p></div>
        <div class="pay-card"><span class="tag">${icon('card')} Everywhere else</span><h3>Secure card checkout</h3><p>You are redirected to a hosted card page. Any currency conversion is shown to you before you pay, not after.</p></div>
      </div>
    </section>

    <section class="final rv">
      <h2>Your next campaign deserves receipts.</h2>
      <div class="row">${reg ? '<a class="btn" href="/register">Get started</a>' : ''}<a class="btn ghost" data-u="u-3aec64" href="/login">Sign in</a></div>
    </section>
  </div>
  <footer class="foot"><div class="wrap"><span>${esc(s.siteName)}${s.supportEmail ? ` &middot; <a href="mailto:${esc(s.supportEmail)}">${esc(s.supportEmail)}</a>` : ''}</span><span>Prices in ${esc(s.walletCurrency)}. Refunds credit your wallet balance.</span></div></footer>`;
  reveal(el);
}

export async function catalog(el, { state, query }) {
  const s = state.settings;
  document.title = `Services | ${s.siteName}`;
  const inApp = !!state.user;
  el.innerHTML = `<div class="${inApp ? '' : 'wrap cat-pub'}">
    <div class="page-head"><div><h1>Service catalog</h1><p>Live, priced services. Rates are per 1,000 unless marked as a package.</p></div>
    ${inApp ? '<a class="btn signal" href="/new-order">' + icon('plus') + 'New order</a>' : ''}</div>
    <div class="toolbar"><label class="search">${icon('search')}<input type="search" id="q" placeholder="Search services" aria-label="Search services" value="${esc(query.get('q') || '')}"></label>
    <select id="cat" aria-label="Category"><option value="">All categories</option></select></div>
    <div id="list">${skeleton(6, 44)}</div></div>`;
  const list = $('#list', el), q = $('#q', el), cat = $('#cat', el);
  let cats = null, t;
  async function load() {
    try {
      const p = new URLSearchParams({ q: q.value, category: cat.value });
      const r = await api('/services?' + p);
      if (!cats) {
        cats = r.categories || [];
        cat.innerHTML += cats.map(c => `<option>${esc(c)}</option>`).join('');
      }
      const cur = r.currency || s.walletCurrency;
      const svcs = r.services || [];
      if (!svcs.length) {
        list.innerHTML = `<div class="card">${empty({ glyph: 'grid', title: q.value || cat.value ? 'No matching services' : 'No services published yet', text: q.value || cat.value ? 'Try a different search or category.' : 'The owner has not priced and published any services yet. Check back soon.' })}</div>`;
        return;
      }
      const groups = {};
      svcs.forEach(v => (groups[v.category] ||= []).push(v));
      list.innerHTML = Object.entries(groups).map(([c, items]) => `<div class="cat-h">${esc(c)}</div><div class="svc-list">${items.map(v => `
        <div class="svc"><div><h3>${esc(v.name)}</h3><div class="meta"><span class="mono">#${esc(v.id)}</span><span>Min ${num(v.min)}</span><span>Max ${num(v.max)}</span>${v.refill ? '<span class="badge ok plain">Refill</span>' : ''}${v.cancel ? '<span class="badge plain">Cancelable</span>' : ''}</div>
        ${v.description ? `<p class="muted" data-u="u-2d58a1">${esc(v.description).slice(0, 220)}</p>` : ''}</div>
        <div class="price"><b>${major(v.rate, cur)}</b><span>${v.pricingUnit === 'package' ? 'per package' : 'per 1,000'}</span>
        <a class="btn sm ${inApp ? '' : 'ghost'}" data-u="u-d43169" href="${inApp ? '/new-order?service=' + encodeURIComponent(v.id) : '/register'}">${inApp ? 'Order' : 'Sign up to order'}</a></div></div>`).join('')}</div>`).join('');
    } catch (e) {
      if (e.status === 401) {
        list.innerHTML = `<div class="card">${empty({ glyph: 'lock', title: 'Sign in to see prices', text: 'The full catalog with live pricing is available once you have an account.', action: '<div class="row"><a class="btn" href="/login?next=/services">Sign in</a><a class="btn ghost" href="/register">Create account</a></div>' })}</div>`;
      } else errorState(list, e, load);
    }
  }
  q.oninput = () => { clearTimeout(t); t = setTimeout(load, 300); };
  cat.onchange = load;
  load();
}
