import { api, uuid } from '../api.js';
import { icon, esc, money, major, num, date, badge, toast, skeleton, statSkeleton, empty, errorState, busy, pager, confirmDialog, formData, countryOptions, countryName, $, $$ } from '../ui.js';
import { renderFields, readFields, estimate, usesQuantity } from '../fields.js';

const TERMINAL = ['Completed', 'Partial', 'Canceled', 'Failed'];
const head = (t, p, actions = '') => `<div class="page-head"><div><h1>${t}</h1>${p ? `<p>${p}</p>` : ''}</div><div class="row">${actions}</div></div>`;
const cur = s => s.settings.walletCurrency || 'KES';

function orderRows(orders, c) {
  return `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Service</th><th class="num">Qty</th><th class="num">Charge</th><th>Status</th><th>Placed</th></tr></thead><tbody>
  ${orders.map(o => `<tr><td><a class="mono" href="/orders/${esc(o.id)}">#${esc(o.id)}</a></td><td data-u="u-4d1468">${esc(o.serviceName)}</td><td class="num">${num(o.quantity)}</td><td class="num">${money(o.charge, c)}</td><td>${badge(o.status)}</td><td class="muted">${date(o.createdAt)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function txRows(txs, c) {
  return `<div class="table-wrap"><table><thead><tr><th>Type</th><th>Description</th><th class="num">Amount</th><th class="num">Balance</th><th>Date</th></tr></thead><tbody>
  ${txs.map(t => `<tr><td><span class="badge plain">${esc(t.type)}</span></td><td>${esc(t.description)}</td><td class="num ${t.amount < 0 ? 'neg' : 'pos'}">${t.amount > 0 ? '+' : ''}${money(t.amount, c)}</td><td class="num">${money(t.balanceAfter, c)}</td><td class="muted">${date(t.createdAt)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

export async function dashboard(el, ctx) {
  const { state } = ctx;
  document.title = `Dashboard | ${state.settings.siteName}`;
  const first = (state.user.name || '').split(' ')[0];
  el.innerHTML = head(`Hello, ${esc(first)}`, 'Your wallet, orders and recent activity.', `<a class="btn ghost" href="/wallet">${icon('wallet')}Top up</a><a class="btn signal" href="/new-order">${icon('plus')}New order</a>`) + `<div id="d">${statSkeleton(5)}${skeleton(5)}</div>`;
  const box = $('#d', el);
  async function load() {
    try {
      const r = await api('/dashboard');
      state.user = r.user; ctx.rerenderShell();
      const c = cur(state), s = r.stats || {};
      box.innerHTML = `<div class="stats stagger">
        <div class="stat hl"><div class="k">Wallet balance</div><div class="v">${money(r.user.balance, c)}</div></div>
        <div class="stat"><div class="k">Active orders</div><div class="v">${num(s.activeOrders)}</div></div>
        <div class="stat"><div class="k">Completed</div><div class="v">${num(s.completedOrders)}</div></div>
        <div class="stat"><div class="k">Total spent</div><div class="v">${money(s.totalSpent, c)}</div></div>
        <div class="stat"><div class="k">Refunded to wallet</div><div class="v">${money(s.totalRefunded, c)}</div></div></div>
        <div class="cols"><div class="card"><div class="card-head"><h2>Recent orders</h2><a href="/orders" class="btn ghost sm">All orders</a></div>
        ${r.recentOrders?.length ? orderRows(r.recentOrders, c) : empty({ glyph: 'list', title: 'No orders yet', text: 'Your first order will show up here with live status tracking.', action: '<a class="btn" href="/new-order">Place an order</a>' })}</div>
        <div class="card"><div class="card-head"><h2>Wallet activity</h2><a href="/wallet" class="btn ghost sm">Wallet</a></div>
        ${r.transactions?.length ? `<div class="stack" data-u="u-ef1096">${r.transactions.slice(0, 8).map(t => `<div class="secret-status"><div><b data-u="u-0cf08e">${esc(t.description || t.type)}</b><div class="muted" data-u="u-6b9c17">${date(t.createdAt)}</div></div><span class="mono ${t.amount < 0 ? 'neg' : 'pos'}">${t.amount > 0 ? '+' : ''}${money(t.amount, c)}</span></div>`).join('')}</div>`
          : empty({ glyph: 'wallet', title: 'No transactions', text: 'Top up your wallet to start ordering.', action: '<a class="btn ghost" href="/wallet">Add funds</a>' })}</div></div>`;
    } catch (e) { errorState(box, e, load); }
  }
  load();
}

let svcCache = null;
async function loadServices() {
  if (svcCache && Date.now() - svcCache.at < 60000) return svcCache.data;
  const r = await api('/services');
  svcCache = { at: Date.now(), data: r };
  return r;
}
function serviceOptions(services, selected) {
  const groups = {};
  services.forEach(s => (groups[s.category] ||= []).push(s));
  return '<option value="">Choose a service</option>' + Object.entries(groups).map(([c, items]) => `<optgroup label="${esc(c)}">${items.map(s => `<option value="${esc(s.id)}" ${String(s.id) === String(selected) ? 'selected' : ''}>#${esc(s.id)} ${esc(s.name)}</option>`).join('')}</optgroup>`).join('');
}
function svcInfo(s, c) {
  return `<div class="note">${icon('info')}<div><b>${major(s.rate, c)}</b> ${s.pricingUnit === 'package' ? 'per package' : 'per 1,000'} &middot; Min ${num(s.min)} &middot; Max ${num(s.max)}
    ${s.refill ? ' &middot; Refill available' : ''}${s.cancel ? ' &middot; Cancel requests allowed' : ''}${s.description ? `<div data-u="u-9e3c4c">${esc(s.description)}</div>` : ''}</div></div>`;
}
function noServices() {
  return `<div class="card">${empty({ glyph: 'grid', title: 'No services available yet', text: 'The owner has not published priced services. Ordering opens as soon as they do.' })}</div>`;
}

export async function newOrder(el, ctx) {
  const { state, query, navigate } = ctx;
  document.title = `New order | ${state.settings.siteName}`;
  el.innerHTML = head('New order', 'The form adapts to each service. You are charged from your wallet on submit.', `<a class="btn ghost" href="/bulk-orders">${icon('layers')}Bulk orders</a>`) + `<div id="o">${skeleton(6, 36)}</div>`;
  const box = $('#o', el);
  let data;
  try { data = await loadServices(); } catch (e) { return errorState(box, e, () => newOrder(el, ctx)); }
  const c = data.currency || cur(state), services = data.services || [];
  if (!services.length) { box.innerHTML = noServices(); return; }
  let key = uuid(), lastRequest = '';
  box.innerHTML = `<div class="cols"><form class="card" id="of" novalidate>
      <div class="form-error" hidden></div>
      <div class="field"><label for="cat">Category</label><select id="cat"><option value="">All categories</option>${(data.categories || []).map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
      <div class="field"><label for="svc">Service</label><select id="svc" name="serviceId" required>${serviceOptions(services, query.get('service'))}</select></div>
      <div id="info"></div><div id="dyn" data-u="u-553a64"></div>
    </form>
    <aside><div class="summary-box"><div class="muted mono" data-u="u-bb8694">Order summary</div>
      <div class="total" id="tot">${money(0, c)}</div>
      <div class="line"><span class="muted">Service</span><span id="sn">None</span></div>
      <div class="line"><span class="muted">Quantity</span><span id="sq">0</span></div>
      <div class="line"><span class="muted">Wallet balance</span><span>${money(state.user.balance, c)}</span></div>
      <button class="btn signal block" data-u="u-b0043e" id="sub" data-busy="Submitting" disabled>Place order ${icon('arrow')}</button>
      <p class="muted" data-u="u-5a4ff3">Estimate. The final charge is confirmed by the server.</p></div>
      <div class="note" data-u="u-002535">${icon('shield')}<span>If a submission is uncertain we hold it for review instead of resending. Refunds always return to your wallet.</span></div></aside></div>`;
  const svcSel = $('#svc', box), catSel = $('#cat', box), form = $('#of', box);
  const current = () => services.find(s => String(s.id) === svcSel.value);
  function update() {
    const s = current();
    const btn = $('#sub', box);
    if (!s) { $('#sn', box).textContent = 'None'; $('#tot', box).textContent = money(0, c); btn.disabled = true; return; }
    const r = readFields($('#dyn', box), s);
    const est = estimate(s, r.quantity);
    $('#sn', box).textContent = s.name.length > 34 ? s.name.slice(0, 34) + '...' : s.name;
    $('#sq', box).textContent = num(r.quantity);
    $('#tot', box).textContent = major(est, c);
    btn.disabled = false;
  }
  function pick() {
    const s = current();
    $('#info', box).innerHTML = s ? svcInfo(s, c) : '';
    $('#dyn', box).innerHTML = s ? renderFields(s, usesQuantity(s) ? { quantity: s.min } : {}, 'o') : '';
    update();
  }
  catSel.onchange = () => {
    const keep = svcSel.value;
    svcSel.innerHTML = serviceOptions(catSel.value ? services.filter(s => s.category === catSel.value) : services, keep);
    pick();
  };
  svcSel.onchange = pick;
  form.addEventListener('input', e => { if (e.target !== svcSel && e.target !== catSel) update(); });
  pick();
  $('#sub', box).onclick = () => {
    const s = current();
    const errBox = form.querySelector('.form-error');
    const r = readFields($('#dyn', box), s);
    if (r.errors.length) { errBox.hidden = false; errBox.textContent = r.errors.join(' '); return; }
    errBox.hidden = true;
    const fingerprint = JSON.stringify({ serviceId: s.id, quantity: r.quantity, link: r.link, fields: r.fields });
    if (fingerprint !== lastRequest) { key = uuid(); lastRequest = fingerprint; }
    busy($('#sub', box), async () => {
      try {
        const res = await api('/orders', { method: 'POST', body: { serviceId: s.id, quantity: r.quantity, link: r.link, fields: r.fields, idempotencyKey: key } });
        toast(`Order #${res.order.id} placed`);
        navigate(`/orders/${res.order.id}`);
      } catch (e) { errBox.hidden = false; errBox.textContent = e.message; }
    });
  };
}

export async function bulkOrders(el, ctx) {
  const { state } = ctx;
  document.title = `Bulk orders | ${state.settings.siteName}`;
  el.innerHTML = head('Bulk orders', 'Up to 25 orders in one go, across any services. Each one succeeds or fails on its own.') + `<div id="b">${skeleton(5, 36)}</div>`;
  const box = $('#b', el);
  let data;
  try { data = await loadServices(); } catch (e) { return errorState(box, e, () => bulkOrders(el, ctx)); }
  const c = data.currency || cur(state), services = data.services || [];
  if (!services.length) { box.innerHTML = noServices(); return; }
  let seq = 0, batchKey = uuid(), lastBatch = '';
  box.innerHTML = `<div class="cols"><div><div id="rows"></div><button class="btn ghost" id="add">${icon('plus')}Add another order</button></div>
    <aside><div class="summary-box"><div class="muted mono" data-u="u-bb8694">Batch summary</div>
    <div class="total" id="tot">${money(0, c)}</div><div class="line"><span class="muted">Orders</span><span id="cnt">0</span></div>
    <div class="line"><span class="muted">Wallet balance</span><span>${money(state.user.balance, c)}</span></div>
    <button class="btn signal block" data-u="u-b0043e" id="sub" data-busy="Submitting batch">Submit batch ${icon('arrow')}</button>
    <p class="muted" data-u="u-5a4ff3">Estimate. Orders that fail are not charged.</p></div><div id="res" data-u="u-002535"></div></aside></div>`;
  const rowsEl = $('#rows', box);
  const svcOf = row => services.find(s => String(s.id) === row.querySelector('select').value);
  function recalc() {
    const rows = $$('.bulk-row', rowsEl);
    let total = 0;
    rows.forEach((row, i) => {
      row.querySelector('.idx').textContent = `Order ${i + 1}`;
      const s = svcOf(row);
      if (s) { const r = readFields(row.querySelector('.dyn'), s); total += estimate(s, r.quantity); }
    });
    $('#tot', box).textContent = major(total, c);
    $('#cnt', box).textContent = rows.length;
    $('#add', box).disabled = rows.length >= 25;
  }
  function addRow() {
    if ($$('.bulk-row', rowsEl).length >= 25) return;
    const id = ++seq;
    const row = document.createElement('div');
    row.className = 'bulk-row';
    row.dataset.key = uuid();
    row.innerHTML = `<div class="bh"><span class="idx"></span><span class="st"></span><button class="iconbtn" data-rm aria-label="Remove order">${icon('trash')}</button></div>
      <div class="field"><label for="bs${id}">Service</label><select id="bs${id}">${serviceOptions(services)}</select></div><div class="info"></div><div class="dyn grid2" data-u="u-002535"></div>`;
    rowsEl.appendChild(row);
    const sel = row.querySelector('select');
    sel.onchange = () => {
      const s = svcOf(row);
      row.querySelector('.info').innerHTML = s ? svcInfo(s, c) : '';
      row.querySelector('.dyn').innerHTML = s ? renderFields(s, usesQuantity(s) ? { quantity: s.min } : {}, 'b' + id) : '';
      recalc();
    };
    row.addEventListener('input', recalc);
    row.querySelector('[data-rm]').onclick = () => { if ($$('.bulk-row', rowsEl).length > 1) { row.remove(); recalc(); } };
    recalc();
  }
  $('#add', box).onclick = addRow;
  addRow(); addRow();
  $('#sub', box).onclick = () => {
    const rows = $$('.bulk-row:not(.ok)', rowsEl);
    const orders = [], errs = [];
    rows.forEach((row, i) => {
      const s = svcOf(row);
      if (!s) { errs.push(`Order ${i + 1}: choose a service.`); return; }
      const r = readFields(row.querySelector('.dyn'), s);
      if (r.errors.length) errs.push(`Order ${i + 1}: ${r.errors[0]}`);
      orders.push({ serviceId: s.id, quantity: r.quantity, link: r.link, fields: r.fields, idempotencyKey: row.dataset.key });
    });
    const res = $('#res', box);
    if (!orders.length) { toast('Add another order to submit a new batch.'); return; }
    if (errs.length) { res.innerHTML = `<div class="form-error">${errs.map(esc).join('<br>')}</div>`; return; }
    const fingerprint = JSON.stringify(orders);
    if (fingerprint !== lastBatch) { batchKey = uuid(); lastBatch = fingerprint; }
    busy($('#sub', box), async () => {
      try {
        const r = await api('/orders/bulk', { method: 'POST', body: { orders, idempotencyKey: batchKey } });
        let ok = 0;
        (r.results || []).forEach((x, i) => {
          const idx = x.index ?? i, row = rows[idx];
          if (!row) return;
          if (x.order) { ok++; row.querySelector('.st').innerHTML = `<a href="/orders/${esc(x.order.id)}">${badge(x.order.status)} #${esc(x.order.id)}</a>`; row.classList.add('ok'); }
          else { row.querySelector('.st').innerHTML = `<span class="badge bad">${esc(x.error)}</span>`; row.classList.add('bad'); }
        });
        res.innerHTML = `<div class="note ${ok ? 'ok' : ''}">${icon(ok ? 'check' : 'alert')}<span>${esc(r.message || `${ok} of ${orders.length} orders placed.`)}</span></div>`;
        toast(`${ok} of ${orders.length} orders placed`, ok ? 'ok' : 'error');
        svcCache = null;
        // Successful rows are locked so a resubmit cannot duplicate them.
        rows.forEach(row => { if (row.classList.contains('ok')) { row.querySelectorAll('input,select,textarea,button').forEach(i => i.disabled = true); } });
      } catch (e) { res.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; }
    });
  };
}

export async function orders(el, ctx) {
  const { state, query } = ctx;
  document.title = `Orders | ${state.settings.siteName}`;
  let status = query.get('status') || '', page = Number(query.get('page') || 1);
  const ST = ['', 'Pending', 'Processing', 'In progress', 'Completed', 'Partial', 'Canceled', 'Failed', 'Submission uncertain'];
  el.innerHTML = head('Orders', 'Every order you have placed, newest first.', `<a class="btn signal" href="/new-order">${icon('plus')}New order</a>`) +
    `<div class="chips" role="tablist">${ST.map(s => `<button class="chip ${s === status ? 'on' : ''}" data-s="${esc(s)}">${s || 'All'}</button>`).join('')}</div><div id="ol">${skeleton(6)}</div>`;
  const box = $('#ol', el);
  async function load() {
    box.innerHTML = skeleton(6);
    history.replaceState({}, '', `/orders?${new URLSearchParams({ ...(status && { status }), ...(page > 1 && { page }) })}`.replace(/\?$/, ''));
    try {
      const r = await api(`/orders?${new URLSearchParams({ status, page })}`);
      box.innerHTML = `<div class="card">${r.orders?.length ? orderRows(r.orders, cur(state)) + pager(r.page, r.pages, r.total) : empty({ glyph: 'list', title: status ? `No ${status.toLowerCase()} orders` : 'No orders yet', text: status ? 'Try another filter.' : 'Place your first order to see it tracked here.', action: status ? '' : '<a class="btn" href="/new-order">New order</a>' })}</div>`;
      $$('[data-page]', box).forEach(b => b.onclick = () => { page = Number(b.dataset.page); load(); });
    } catch (e) { errorState(box, e, load); }
  }
  $$('.chip', el).forEach(b => b.onclick = () => { status = b.dataset.s; page = 1; $$('.chip', el).forEach(x => x.classList.toggle('on', x === b)); load(); });
  load();
}

export async function orderDetail(el, ctx) {
  const { state, params } = ctx;
  document.title = `Order #${params.id} | ${state.settings.siteName}`;
  el.innerHTML = `<a href="/orders" class="btn ghost sm" data-u="u-8e8697">${icon('back')}Orders</a><div id="od">${skeleton(8)}</div>`;
  const box = $('#od', el);
  const c = cur(state);
  function draw(o) {
    const delivered = o.remains != null ? Math.max(0, o.quantity - o.remains) : (o.status === 'Completed' ? o.quantity : null);
    const pct = delivered != null && o.quantity ? Math.min(100, Math.round((delivered / o.quantity) * 100)) : 0;
    const canCancel = o.cancel && !TERMINAL.includes(o.status) && o.providerOrderId;
    const canRefill = o.refill && ['Completed', 'Partial'].includes(o.status);
    const hist = [...(o.history || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
    const fields = Object.entries(o.fields || {});
    box.innerHTML = `${head(`Order <span class="mono">#${esc(o.id)}</span>`, esc(o.serviceName), `
      <button class="btn ghost" id="rf" data-busy="Checking">${icon('refresh')}Check status</button>
      ${canRefill ? `<button class="btn ghost" id="rl" data-busy="Requesting">${icon('rotate')}Request refill</button>` : ''}
      ${canCancel ? `<button class="btn ghost" id="cn" data-busy="Requesting">${icon('x')}Request cancel</button>` : ''}`)}
      <div class="cols"><div class="stack">
        <div class="card"><div class="card-head"><h2>Progress</h2>${badge(o.status)}</div>
          ${delivered != null ? `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i data-w="${pct}"></i></div><p class="muted" data-u="u-b0d85b">${num(delivered)} of ${num(o.quantity)} delivered${o.remains != null ? ` &middot; ${num(o.remains)} remaining` : ''}</p>` : '<p class="muted">Progress appears once the provider reports counts.</p>'}
          ${o.status === 'Submission uncertain' ? `<div class="note" data-u="u-553a64">${icon('shield')}<span>The provider response was unclear, so this order is held for a manual check. It will not be resent automatically, and if it never reached the provider your charge returns to your wallet.</span></div>` : ''}
          ${o.refundAmount > 0 ? `<div class="note ok" data-u="u-553a64">${icon('undo')}<span>${money(o.refundAmount, c)} refunded to your wallet.</span></div>` : ''}
        </div>
        <div class="card"><h2>History</h2>${hist.length ? `<ol class="timeline">${hist.map(h => `<li><b>${esc(h.status)}</b>${h.message ? `<p>${esc(h.message)}</p>` : ''}<time>${date(h.at)}</time></li>`).join('')}</ol>` : '<p class="muted">No history recorded yet.</p>'}</div>
      </div>
      <div class="card"><h2>Details</h2><dl class="kv">
        <dt>Charge</dt><dd>${money(o.charge, c)}</dd><dt>Quantity</dt><dd>${num(o.quantity)}</dd>
        <dt>Link</dt><dd>${o.link ? `<a href="${esc(o.link)}" target="_blank" rel="noopener noreferrer">${esc(o.link)}</a>` : 'None'}</dd>
        <dt>Start count</dt><dd>${o.startCount != null ? num(o.startCount) : 'Not reported'}</dd>
        <dt>Service ID</dt><dd class="mono">${esc(o.serviceId)}</dd>
        <dt>Placed</dt><dd>${date(o.createdAt)}</dd><dt>Updated</dt><dd>${date(o.updatedAt)}</dd>
        ${fields.map(([k, v]) => `<dt>${esc(k.replace(/_/g, ' '))}</dt><dd data-u="u-d07753">${esc(v)}</dd>`).join('')}
      </dl></div></div>`;
    $$('[data-w]', box).forEach(i => { i.style.width = i.dataset.w + '%'; });
    const act = (id, path, msg) => { const b = $('#' + id, box); if (b) b.onclick = () => busy(b, async () => {
      if (id === 'cn' && !(await confirmDialog({ title: 'Request cancellation?', text: 'This sends a cancel request to the provider. It may be declined, and any refund depends on what was not delivered.', confirm: 'Send request' }))) return;
      try { const r = await api(`/orders/${o.id}/${path}`, { method: 'POST' }); toast(r.message || msg); draw(r.order); } catch (e) { toast(e.message, 'error'); }
    }); };
    act('rf', 'refresh', 'Status updated');
    act('rl', 'refill', 'Refill requested');
    act('cn', 'cancel', 'Cancel requested');
  }
  async function load() {
    try { const r = await api(`/orders/${encodeURIComponent(params.id)}`); draw(r.order); }
    catch (e) { if (e.status === 404) box.innerHTML = `<div class="card">${empty({ glyph: 'search', title: 'Order not found', text: 'It may belong to another account.' })}</div>`; else errorState(box, e, load); }
  }
  load();
}

export async function wallet(el, ctx) {
  const { state, query } = ctx;
  document.title = `Wallet | ${state.settings.siteName}`;
  el.innerHTML = head('Wallet', 'Fund your balance and review every movement.') + `<div id="w">${statSkeleton(2)}${skeleton(6)}</div>`;
  const box = $('#w', el);
  let w, pollTimer = null;
  const stopPoll = () => { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; };

  async function verify(id, quiet) {
    const r = await api(`/payments/${id}/verify`, { method: 'POST' });
    if (!quiet || r.payment.status !== 'pending') toast(r.message || `Payment ${r.payment.status}`, r.payment.status === 'failed' ? 'error' : 'ok');
    return r.payment;
  }
  function poll(id, n = 0) {
    stopPoll();
    const s = $('#pstat', box);
    if (n >= 24) { if (s) s.innerHTML = `<div class="note">${icon('clock')}<span>Still waiting for M-Pesa confirmation. Use Verify in the payments list once you have approved the prompt.</span></div>`; return; }
    pollTimer = setTimeout(async () => {
      if (ctx.isStale()) return stopPoll();
      try {
        const p = await verify(id, true);
        if (p.status === 'pending' || p.status === 'initializing') { if (s) s.querySelector('b').textContent = `Waiting for approval (${n + 1}/24)`; poll(id, n + 1); }
        else load();
      } catch { poll(id, n + 1); }
    }, 5000);
  }

  function draw() {
    const c = w.currency || cur(state), isMpesa = w.gateway === 'giftedpay';
    const min = w.minDeposit ?? state.settings.minDeposit;
    const conv = !isMpesa && w.paystackCurrency && w.paystackCurrency !== c;
    box.innerHTML = `<div class="cols"><div class="stack">
      <div class="balance-hero"><div class="k">Available balance</div><div class="v">${money(w.balance, c)}</div><span class="tag" data-u="u-1ae12d">${icon(isMpesa ? 'phone' : 'card')}${isMpesa ? 'M-Pesa top ups' : 'Card top ups'}</span></div>
      <div class="card"><h2>Transactions</h2>${w.transactions?.length ? txRows(w.transactions, c) : empty({ glyph: 'wallet', title: 'No transactions yet', text: 'Deposits, order charges and refunds will be listed here.' })}</div>
      <div class="card"><h2>Payments</h2>${w.payments?.length ? `<div class="table-wrap"><table><thead><tr><th>Reference</th><th class="num">Amount</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>
        ${w.payments.map(p => `<tr><td class="mono">${esc(p.reference)}</td><td class="num">${money(p.amount, p.currency || c)}${p.payCurrency && p.payCurrency !== (p.currency || c) ? `<div class="muted" data-u="u-6b9c17">paid ${money(p.payAmount, p.payCurrency)}</div>` : ''}</td><td>${badge(p.status)}</td><td class="muted">${date(p.createdAt)}</td>
        <td>${['pending', 'initializing'].includes(p.status) ? `<button class="btn ghost sm" data-verify="${esc(p.id)}" data-busy="Verifying">Verify</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : empty({ glyph: 'card', title: 'No payments yet', text: 'Your top up attempts appear here.' })}</div>
    </div>
    <form class="card" id="pf" novalidate data-u="u-3b9d4e"><h2>Add funds</h2><div class="form-error" hidden></div>
      <div class="amounts">${[1, 5, 10].map(m => `<button type="button" class="chip" data-amt="${(min * m) / 100}">${money(min * m, c)}</button>`).join('')}</div>
      <div class="field"><label for="amt">Amount (${esc(c)})</label><input id="amt" name="amount" type="number" inputmode="decimal" min="${min / 100}" step="1" required><span class="hint">Minimum ${money(min, c)}.</span></div>
      ${isMpesa ? `<div class="field"><label for="ph">M-Pesa phone number</label><input id="ph" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07XX XXX XXX" required><span class="hint">You will get an STK prompt on this phone.</span></div>`
        : `<div id="convnote">${conv ? '' : ''}</div>`}
      <button class="btn signal block" data-busy="${isMpesa ? 'Sending prompt' : 'Opening checkout'}">${isMpesa ? 'Send M-Pesa prompt' : 'Continue to card checkout'} ${icon('arrow')}</button>
      <div id="pstat" data-u="u-002535"></div>
      <p class="muted" data-u="u-5a4ff3">${isMpesa ? 'Your wallet is credited only after M-Pesa confirms the payment.' : 'You will be redirected to a secure hosted card page. Your wallet is credited only after the payment is verified.'}</p>
    </form></div>`;
    const f = $('#pf', box), amt = f.amount;
    let paymentKey = uuid(), lastPayment = '';
    const convUpdate = () => {
      const n = $('#convnote', box);
      if (!n || !conv) return;
      const v = Number(amt.value || 0), rate = Number(w.paystackToWalletRate || 0);
      n.innerHTML = `<div class="note" data-u="u-617963">${icon('globe')}<span>Card checkout charges in ${esc(w.paystackCurrency)}. Rate: 1 ${esc(w.paystackCurrency)} = ${rate} ${esc(c)}.${v && rate ? ` You will pay about <b>${major(v / rate, w.paystackCurrency)}</b>.` : ''}</span></div>`;
    };
    convUpdate();
    amt.oninput = convUpdate;
    $$('[data-amt]', f).forEach(b => b.onclick = () => { amt.value = b.dataset.amt; convUpdate(); });
    $$('[data-verify]', box).forEach(b => b.onclick = () => busy(b, async () => { try { await verify(b.dataset.verify); load(); } catch (e) { toast(e.message, 'error'); } }));
    f.onsubmit = e => {
      e.preventDefault();
      const d = formData(f), err = f.querySelector('.form-error');
      const minor = Math.round(Number(d.amount) * 100);
      const fail = m => { err.hidden = false; err.textContent = m; };
      if (!minor || minor < min) return fail(`Enter at least ${money(min, c)}.`);
      let phone;
      if (isMpesa) {
        phone = (d.phone || '').replace(/[\s-]/g, '');
        if (!/^(\+?254|0)?[17]\d{8}$/.test(phone)) return fail('Enter a valid Safaricom number, for example 0712345678.');
      }
      err.hidden = true;
      const fingerprint = JSON.stringify({ amount: minor, phone });
      if (fingerprint !== lastPayment) { paymentKey = uuid(); lastPayment = fingerprint; }
      busy(f.querySelector('button.signal'), async () => {
        try {
          const r = await api('/payments', { method: 'POST', body: { amount: minor, ...(phone && { phone }), idempotencyKey: paymentKey } });
          if (r.authorizationUrl) {
            let u; try { u = new URL(r.authorizationUrl); } catch { /* invalid */ }
            if (!u || u.protocol !== 'https:') return fail('Checkout link was invalid. Please try again.');
            toast('Redirecting to secure checkout');
            location.href = u.href;
            return;
          }
          toast(r.message || 'Check your phone to approve the payment');
          $('#pstat', box).innerHTML = `<div class="note">${icon('phone')}<span><b>Waiting for approval</b><br>Approve the prompt on your phone. This page updates automatically.</span></div>`;
          poll(r.payment.id);
        } catch (ex) { fail(ex.message); }
      });
    };
  }

  async function load() {
    stopPoll();
    try {
      w = await api('/wallet');
      if (state.user) { state.user.balance = w.balance; ctx.rerenderShell(); }
      draw();
    } catch (e) { errorState(box, e, load); }
  }
  await load();
  const ref = query.get('reference') || query.get('trxref');
  if (ref && w) {
    history.replaceState({}, '', '/wallet');
    const p = (w.payments || []).find(x => x.reference === ref);
    if (!p) toast('We could not find that payment on your account.', 'error');
    else if (['pending', 'initializing'].includes(p.status)) { try { await verify(p.id); } catch (e) { toast(e.message, 'error'); } load(); }
    else toast(`Payment ${p.reference} is ${p.status}`, p.status === 'failed' ? 'error' : 'ok');
  }
}

export async function account(el, ctx) {
  const { state } = ctx;
  document.title = `Account | ${state.settings.siteName}`;
  const u = state.user;
  el.innerHTML = head('Account', 'Profile, country and password.') + `<div class="cols">
    <form class="card" id="pf" novalidate><h2>Profile</h2><div class="form-error" hidden></div>
      <div class="field"><label for="nm">Name</label><input id="nm" name="name" required maxlength="80" value="${esc(u.name)}" autocomplete="name"></div>
      <div class="field"><label>Email</label><input value="${esc(u.email)}" disabled></div>
      <div class="field"><label for="co">Country</label><select id="co" name="country">${countryOptions(u.country)}</select><span class="hint">Decides your payment method (Kenya uses M-Pesa, others use card). Locks after your first payment or order.</span></div>
      <dl class="kv" data-u="u-b0c4b2"><dt>Role</dt><dd>${esc(u.role.replace('_', ' '))}</dd><dt>Member since</dt><dd>${date(u.createdAt, false)}</dd><dt>Current country</dt><dd>${esc(countryName(u.country))}</dd></dl>
      <button class="btn" data-busy="Saving">Save profile</button></form>
    <form class="card" id="pw" novalidate data-u="u-3b9d4e"><h2>Password</h2><div class="form-error" hidden></div>
      <div class="field"><label for="cp">Current password</label><input id="cp" name="currentPassword" type="password" required autocomplete="current-password"></div>
      <div class="field"><label for="np">New password</label><input id="np" name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"><span class="hint">12 to 128 characters.</span></div>
      <div class="field"><label for="cf">Confirm new password</label><input id="cf" name="confirm" type="password" required autocomplete="new-password"></div>
      <button class="btn" data-busy="Updating">Update password</button></form></div>`;
  const pf = $('#pf', el), pw = $('#pw', el);
  const fail = (f, m) => { const e = f.querySelector('.form-error'); e.hidden = !m; e.textContent = m || ''; };
  pf.onsubmit = e => {
    e.preventDefault();
    const d = formData(pf);
    if (!d.name) return fail(pf, 'Name is required.');
    busy(pf.querySelector('button'), async () => {
      try { const r = await api('/account', { method: 'PATCH', body: { name: d.name, country: d.country } }); state.user = r.user; fail(pf); toast('Profile saved'); account(el, ctx); }
      catch (ex) { fail(pf, ex.message); }
    });
  };
  pw.onsubmit = e => {
    e.preventDefault();
    const d = formData(pw);
    if (d.password.length < 12 || d.password.length > 128) return fail(pw, 'New password must be 12 to 128 characters.');
    if (d.password !== d.confirm) return fail(pw, 'Passwords do not match.');
    busy(pw.querySelector('button'), async () => {
      try { const r = await api('/account/password', { method: 'POST', body: { currentPassword: d.currentPassword, password: d.password } }); pw.reset(); fail(pw); toast(r.message || 'Password updated'); }
      catch (ex) { fail(pw, ex.message); }
    });
  };
}
