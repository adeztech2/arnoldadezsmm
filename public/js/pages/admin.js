import { api, uuid } from '../api.js';
import { icon, esc, money, major, num, date, badge, toast, skeleton, statSkeleton, empty, errorState, busy, pager, modal, confirmDialog, formData, $, $$ } from '../ui.js';

const head = (t, p, actions = '') => `<div class="page-head"><div><span class="eyebrow">Owner console</span><h1 data-u="u-d43169">${t}</h1>${p ? `<p>${p}</p>` : ''}</div><div class="row">${actions}</div></div>`;
const W = s => s.settings.walletCurrency || 'KES';
const isSuper = s => s.user && s.user.role === 'super_admin';
const pct = v => (v == null ? '' : `${Number(v).toFixed(1)}%`);

export async function summary(el, ctx) {
  const { state } = ctx;
  document.title = `Owner overview | ${state.settings.siteName}`;
  el.innerHTML = head('Business overview', 'Sales, provider cost and estimated profit across every service.', `<button class="btn ghost" id="job" data-busy="Reconciling">${icon('play')}Run reconciliation</button><a class="btn" href="/admin/services">${icon('tag')}Pricing</a>`) + `<div id="s">${statSkeleton(6)}${skeleton(6)}</div>`;
  const box = $('#s', el), c = W(state);
  $('#job', el).onclick = e => runJobs(e.currentTarget, load);
  async function load() {
    try {
      const r = await api('/admin/summary');
      const s = r.stats || {};
      const by = [...(r.byService || [])].sort((a, b) => b.profit - a.profit);
      box.innerHTML = `<div class="stats stagger">
        <div class="stat hl"><div class="k">Estimated profit</div><div class="v ${s.profit < 0 ? 'neg' : ''}">${money(s.profit, c)}</div></div>
        <div class="stat"><div class="k">Net revenue</div><div class="v">${money(s.revenue, c)}</div></div>
        <div class="stat"><div class="k">Provider cost</div><div class="v">${money(s.providerCost, c)}</div></div>
        <div class="stat"><div class="k">Refunds</div><div class="v">${money(s.refunds, c)}</div></div>
        <div class="stat"><div class="k">Orders</div><div class="v">${num(s.orders)}</div></div>
        <div class="stat"><div class="k">Users</div><div class="v">${num(s.users)}</div></div>
        <div class="stat"><div class="k">Pending payments</div><div class="v">${num(s.pendingPayments)}</div></div>
        <div class="stat"><div class="k">Provider balance</div><div class="v" data-u="u-b5ef88">${r.providerBalance ? major(r.providerBalance.balance, r.providerBalance.currency) : '<span class="muted" data-u="u-3dd9b4">Unavailable</span>'}</div></div></div>
        <div class="note" data-u="u-8e8697">${icon('info')}<span>Profit is an estimate: net sales less provider cost. Payment gateway fees are not included. Provider rate: 1 ${esc(r.providerCurrency || '')} = ${esc(r.providerToWalletRate ?? '')} ${esc(c)}. Last catalog sync: ${r.lastSyncAt ? date(r.lastSyncAt) : 'never'}.</span></div>
        <div class="cols"><div class="card"><div class="card-head"><h2>Profit by service</h2><span class="badge plain">Estimated</span></div>
          ${by.length ? `<div class="table-wrap"><table><thead><tr><th>Service</th><th class="num">Orders</th><th class="num">Revenue</th><th class="num">Cost</th><th class="num">Refunds</th><th class="num">Profit</th></tr></thead><tbody>
          ${by.map(x => `<tr><td>${esc(x.name)} <span class="mono muted">#${esc(x.serviceId)}</span></td><td class="num">${num(x.orders)}</td><td class="num">${money(x.revenue, c)}</td><td class="num">${money(x.providerCost, c)}</td><td class="num">${money(x.refunds, c)}</td><td class="num ${x.profit < 0 ? 'neg' : 'pos'}"><b>${money(x.profit, c)}</b></td></tr>`).join('')}</tbody></table></div>`
          : empty({ glyph: 'chart', title: 'No sales yet', text: 'Per service profitability appears after the first orders.' })}</div>
        <div class="card"><div class="card-head"><h2>Latest orders</h2><a class="btn ghost sm" href="/admin/orders">All</a></div>
          ${r.recentOrders?.length ? `<div class="stack" data-u="u-ef1096">${r.recentOrders.slice(0, 8).map(o => `<div class="secret-status"><div><b data-u="u-0cf08e">#${esc(o.id)} ${esc(o.serviceName).slice(0, 40)}</b><div class="muted" data-u="u-6b9c17">${date(o.createdAt)} &middot; ${money(o.charge, c)}</div></div>${badge(o.status)}</div>`).join('')}</div>` : empty({ glyph: 'list', title: 'No orders yet' })}</div></div>`;
    } catch (e) { errorState(box, e, load); }
  }
  load();
}

async function runJobs(btn, after) {
  await busy(btn, async () => {
    try {
      const r = await api('/admin/jobs/run', { method: 'POST' });
      toast(`${r.message || 'Reconciliation done'}: ${num(r.ordersChecked)} orders, ${num(r.paymentsChecked)} payments checked`);
      if (r.errors?.length) modal(`<h2>Reconciliation notes</h2><ul>${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul><div class="actions"><button class="btn" data-close>Close</button></div>`);
      after && after();
    } catch (e) { toast(e.message, 'error'); }
  });
}

export async function services(el, ctx) {
  const { state } = ctx;
  document.title = `Pricing | ${state.settings.siteName}`;
  const c = W(state);
  el.innerHTML = head('Service pricing', 'Set selling prices from provider cost. Only enabled, priced and supported services are visible to customers.', isSuper(state) ? `<button class="btn signal" id="sync" data-busy="Syncing">${icon('refresh')}Sync provider catalog</button>` : '<span class="badge plain">Read only: super admin manages pricing</span>') +
    `<div class="toolbar"><label class="search">${icon('search')}<input type="search" id="q" placeholder="Search by name, ID or category" aria-label="Search"></label>
    <select id="flt" aria-label="Filter"><option value="">All services</option><option value="live">Live to customers</option><option value="unpriced">Not priced</option><option value="unsupported">Unsupported type</option><option value="unavailable">Unavailable upstream</option><option value="loss">Priced at a loss</option></select></div>
    <div class="row" data-u="u-617963"><label class="lbl" for="mk">Markup</label><input id="mk" type="number" step="0.1" data-u="u-1a3055"><span class="muted" data-u="u-3044b6">% over cost</span><button class="btn ghost sm" id="applyMk" ${isSuper(state) ? '' : 'hidden'}>Apply to visible unpriced</button></div>
    <div id="meta"></div><div id="sv">${skeleton(8, 30)}</div>`;
  const box = $('#sv', el), q = $('#q', el), flt = $('#flt', el);
  let all = [], meta = {}, page = 1, t;
  try { const st = await api('/admin/settings'); $('#mk', el).value = st.settings?.defaultMarkupPercent ?? ''; } catch { /* optional */ }

  const preview = (s, sell) => {
    if (sell == null || sell === '' || Number.isNaN(Number(sell))) return { profit: null, margin: null };
    const p = Number(sell) - Number(s.costRate);
    return { profit: p, margin: Number(sell) > 0 ? (p / Number(sell)) * 100 : null };
  };
  function filtered() {
    const term = q.value.trim().toLowerCase(), f = flt.value;
    return all.filter(s => {
      if (term && !`${s.id} ${s.name} ${s.category} ${s.type}`.toLowerCase().includes(term)) return false;
      if (f === 'live') return s.enabled && s.supported && s.available && s.sellingRate != null;
      if (f === 'unpriced') return s.sellingRate == null;
      if (f === 'unsupported') return !s.supported;
      if (f === 'unavailable') return !s.available;
      if (f === 'loss') return s.profitRate != null && s.profitRate < 0;
      return true;
    });
  }
  function draw() {
    const list = filtered(), per = 40, pages = Math.max(1, Math.ceil(list.length / per));
    page = Math.min(page, pages);
    const rows = list.slice((page - 1) * per, page * per);
    const live = all.filter(s => s.enabled && s.supported && s.available && s.sellingRate != null).length;
    $('#meta', el).innerHTML = `<div class="stats"><div class="stat"><div class="k">Provider services</div><div class="v">${num(all.length)}</div></div><div class="stat"><div class="k">Live to customers</div><div class="v">${num(live)}</div></div><div class="stat"><div class="k">Provider currency</div><div class="v" data-u="u-e5e6f8">${esc(meta.providerCurrency || 'Not set')}</div></div><div class="stat"><div class="k">Last sync</div><div class="v" data-u="u-2592cc">${meta.lastSyncAt ? date(meta.lastSyncAt) : 'Never'}</div></div></div>
      <div class="note" data-u="u-617963">${icon('info')}<span>Rates are per 1,000 or per package. Cost converts provider price at 1 ${esc(meta.providerCurrency || '')} = ${esc(meta.providerToWalletRate ?? '')} ${esc(c)}. Profit excludes gateway fees.</span></div>`;
    if (!all.length) { box.innerHTML = `<div class="card">${empty({ glyph: 'database', title: 'No provider services imported', text: 'Add the provider API key in Settings, then sync the catalog to import every available service.', action: `<a class="btn ghost" href="/admin/settings">${icon('key')}Open settings</a>` })}</div>`; return; }
    if (!list.length) { box.innerHTML = `<div class="card">${empty({ glyph: 'search', title: 'Nothing matches', text: 'Adjust the search or filter.' })}</div>`; return; }
    box.innerHTML = `<div class="card"><div class="table-wrap"><table><thead><tr><th>Service</th><th>Status</th><th class="num">Provider rate</th><th class="num">Cost (${esc(c)})</th><th class="num">Selling (${esc(c)})</th><th class="num">Profit</th><th class="num">Margin</th><th>On</th><th></th></tr></thead><tbody>
    ${rows.map(s => `<tr data-id="${esc(s.id)}"><td data-u="u-c1c4e5"><b data-u="u-bfc824">${esc(s.name)}</b><div class="muted" data-u="u-6b9c17"><span class="mono">#${esc(s.id)}</span> &middot; ${esc(s.category)} &middot; ${esc(s.type)} &middot; ${num(s.min)} to ${num(s.max)} &middot; ${s.pricingUnit === 'package' ? 'package' : 'per 1k'}</div></td>
      <td>${!s.available ? '<span class="badge bad">Unavailable</span>' : !s.supported ? '<span class="badge sig" title="This service type cannot be ordered through the panel yet">Unsupported type</span>' : s.sellingRate == null ? '<span class="badge">Unpriced</span>' : s.enabled ? '<span class="badge ok">Live</span>' : '<span class="badge">Hidden</span>'}</td>
      <td class="num mono">${major(s.providerRate, s.providerCurrency || meta.providerCurrency || 'USD', 2)}</td>
      <td class="num mono">${major(s.costRate, c)}</td>
      <td class="num"><input type="number" step="0.01" min="0" class="sell" value="${s.sellingRate ?? ''}" aria-label="Selling rate for ${esc(s.name)}" data-u="u-1df1d2"></td>
      <td class="num mono pf">${s.profitRate != null ? major(s.profitRate, c) : ''}</td><td class="num mg">${pct(s.marginPercent)}</td>
      <td><input type="checkbox" class="en" ${s.enabled ? 'checked' : ''} aria-label="Enabled"></td>
      <td>${isSuper(state) ? '<button class="btn sm save" data-busy="Saving">Save</button>' : ''}</td></tr>`).join('')}</tbody></table></div>${pager(page, pages, list.length)}</div>`;
    $$('tr[data-id]', box).forEach(tr => {
      const s = all.find(x => String(x.id) === tr.dataset.id);
      const sell = tr.querySelector('.sell');
      sell.oninput = () => {
        const p = preview(s, sell.value);
        tr.querySelector('.pf').innerHTML = p.profit == null ? '' : `<span class="${p.profit < 0 ? 'neg' : 'pos'}">${major(p.profit, c)}</span>`;
        tr.querySelector('.mg').textContent = pct(p.margin);
      };
      const sb = tr.querySelector('.save');
      if (sb) sb.onclick = e => save(e.currentTarget, s, tr); else { sell.disabled = true; tr.querySelector('.en').disabled = true; }
    });
    $$('[data-page]', box).forEach(b => b.onclick = () => { page = Number(b.dataset.page); draw(); });
  }
  async function save(btn, s, tr) {
    const v = tr.querySelector('.sell').value, en = tr.querySelector('.en').checked;
    if (v === '' && en) return toast('Set a selling price before enabling.', 'error');
    const n = Number(v);
    if (v !== '' && (!(n > 0))) return toast('Selling price must be greater than zero.', 'error');
    if (v !== '' && n < s.costRate && !(await confirmDialog({ title: 'Price below cost?', text: `This sells at ${major(n, c)} against a cost of ${major(s.costRate, c)}, a loss on every order.`, confirm: 'Save anyway', danger: true }))) return;
    await busy(btn, async () => {
      try {
        const r = await api(`/admin/services/${encodeURIComponent(s.id)}`, { method: 'PATCH', body: { sellingRate: v === '' ? null : n, enabled: en } });
        Object.assign(s, r.service); toast(`Saved #${s.id}`); draw();
      } catch (e) { toast(e.message, 'error'); }
    });
  }
  $('#applyMk', el).onclick = () => {
    const m = Number($('#mk', el).value);
    if (!(m > -100)) return toast('Enter a markup percentage.', 'error');
    let n = 0;
    $$('tr[data-id]', box).forEach(tr => {
      const s = all.find(x => String(x.id) === tr.dataset.id), sell = tr.querySelector('.sell');
      if (s.sellingRate == null && !sell.value && s.supported && s.available) { sell.value = (s.costRate * (1 + m / 100)).toFixed(2); sell.oninput(); n++; }
    });
    toast(n ? `Filled ${n} prices. Review and save each row.` : 'No visible unpriced services to fill.', n ? 'ok' : 'error');
  };
  async function load() {
    try { const r = await api('/admin/services'); all = r.services || []; meta = r; draw(); }
    catch (e) { errorState(box, e, load); }
  }
  q.oninput = () => { clearTimeout(t); t = setTimeout(() => { page = 1; draw(); }, 200); };
  flt.onchange = () => { page = 1; draw(); };
  if ($('#sync', el)) $('#sync', el).onclick = e => busy(e.currentTarget, async () => {
    try { const r = await api('/admin/services/sync', { method: 'POST' }); toast(`${r.message || 'Catalog synced'} (${num(r.count)} services)`); load(); }
    catch (ex) { toast(ex.message, 'error'); }
  });
  load();
}

export async function orders(el, ctx) {
  const { state } = ctx;
  document.title = `All orders | ${state.settings.siteName}`;
  const c = W(state);
  const sup = isSuper(state);
  let status = '', page = 1;
  const ST = ['', 'Submission uncertain', 'Submitting', 'Pending', 'Processing', 'In progress', 'Completed', 'Partial', 'Canceled', 'Failed'];
  el.innerHTML = head('All orders', isSuper(state) ? 'Resolve uncertain submissions and issue wallet refunds.' : 'Read only. Resolutions and refunds need the super admin.', `<button class="btn ghost" id="job" data-busy="Reconciling">${icon('play')}Run reconciliation</button>`) +
    `<div class="chips">${ST.map(s => `<button class="chip ${s === status ? 'on' : ''}" data-s="${esc(s)}">${s || 'All'}</button>`).join('')}</div><div id="ao">${skeleton(8)}</div>`;
  const box = $('#ao', el);
  $('#job', el).onclick = e => runJobs(e.currentTarget, load);
  async function load() {
    try {
      const r = await api(`/admin/orders?${new URLSearchParams({ status, page })}`);
      const list = r.orders || [];
      box.innerHTML = `<div class="card">${list.length ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Service</th><th>Provider ID</th><th class="num">Qty</th><th class="num">Charge</th><th class="num">Refunded</th><th class="num">Cost</th><th class="num">Profit</th><th>Status</th><th>Placed</th><th></th></tr></thead><tbody>
        ${list.map(o => `<tr><td class="mono">#${esc(o.id)}</td><td data-u="u-c3b421">${esc(o.serviceName)}</td><td class="mono">${esc(o.providerOrderId || '')}</td><td class="num">${num(o.quantity)}</td><td class="num">${money(o.charge, c)}</td><td class="num">${o.refundAmount ? money(o.refundAmount, c) : ''}</td><td class="num">${o.providerCost != null ? money(o.providerCost, c) : ''}</td><td class="num ${o.profit < 0 ? 'neg' : 'pos'}">${o.profit != null ? money(o.profit, c) : ''}</td><td>${badge(o.status)}</td><td class="muted">${date(o.createdAt)}</td>
        <td><div class="row" data-u="u-2f86e4"><button class="btn ghost sm" data-view="${esc(o.id)}">View</button>
        ${sup && o.status === 'Submission uncertain' ? `<button class="btn signal sm" data-resolve="${esc(o.id)}">Resolve</button>` : ''}
        ${sup && ['Failed', 'Canceled', 'Partial'].includes(o.status) && o.charge - (o.refundAmount || 0) > 0 ? `<button class="btn ghost sm" data-refund="${esc(o.id)}">Refund</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>${pager(r.page, r.pages, r.total)}`
        : empty({ glyph: 'list', title: status ? `No ${status.toLowerCase()} orders` : 'No orders yet', text: status === 'Submission uncertain' ? 'Nothing waiting for review.' : '' })}</div>`;
      const find = id => list.find(o => String(o.id) === id);
      $$('[data-page]', box).forEach(b => b.onclick = () => { page = Number(b.dataset.page); load(); });
      $$('[data-view]', box).forEach(b => b.onclick = () => view(find(b.dataset.view)));
      $$('[data-resolve]', box).forEach(b => b.onclick = () => resolve(find(b.dataset.resolve)));
      $$('[data-refund]', box).forEach(b => b.onclick = () => refund(find(b.dataset.refund)));
    } catch (e) { errorState(box, e, load); }
  }
  function view(o) {
    modal(`<h2>Order #${esc(o.id)}</h2><p class="muted" data-u="u-617963">${esc(o.serviceName)}</p><dl class="kv">
      <dt>Status</dt><dd>${badge(o.status)}</dd><dt>Link</dt><dd>${esc(o.link)}</dd><dt>Charge</dt><dd>${money(o.charge, c)}</dd><dt>Refunded</dt><dd>${money(o.refundAmount || 0, c)}</dd><dt>User ID</dt><dd class="mono">${esc(o.userId ?? '')}</dd><dt>Provider cost</dt><dd>${o.providerCost != null ? money(o.providerCost, c) : 'Unknown'}</dd><dt>Est. profit</dt><dd>${o.profit != null ? money(o.profit, c) : 'Unknown'}</dd>
      <dt>Provider ID</dt><dd class="mono">${esc(o.providerOrderId || 'None')}</dd><dt>Start / remains</dt><dd>${o.startCount ?? '?'} / ${o.remains ?? '?'}</dd>
      ${Object.entries(o.fields || {}).map(([k, v]) => `<dt>${esc(k)}</dt><dd data-u="u-d07753">${esc(v)}</dd>`).join('')}</dl>
      <h3 data-u="u-7aac66">History</h3><ol class="timeline">${[...(o.history || [])].reverse().map(h => `<li><b>${esc(h.status)}</b>${h.message ? `<p>${esc(h.message)}</p>` : ''}<time>${date(h.at)}</time></li>`).join('') || '<li>No history</li>'}</ol>
      <div class="actions"><button class="btn" data-close>Close</button></div>`);
  }
  function resolve(o) {
    modal(`<h2>Resolve #${esc(o.id)}</h2><p class="muted">Check the provider dashboard first. Then either attach the real provider order ID, or confirm it was never submitted to refund the customer wallet.</p>
      <form id="r1" data-u="u-b0043e"><div class="field"><label for="pid">Provider order ID</label><input id="pid" name="providerOrderId" required></div><button class="btn" data-busy="Attaching">Attach provider order</button></form>
      <hr data-u="u-e80cf0">
      <form id="r2"><div class="field"><label for="rsn">Reason (required)</label><textarea id="rsn" name="reason" required placeholder="What you checked upstream"></textarea></div>
      <label class="check" data-u="u-617963"><input type="checkbox" name="ok" required> I verified this order does not exist at the provider</label>
      <button class="btn danger" data-busy="Refunding">Confirm not submitted and refund</button></form>
      <div class="actions"><button class="btn ghost" data-close>Cancel</button></div>`, (m, close) => {
      const go = async (btn, body) => busy(btn, async () => {
        try { await api(`/admin/orders/${o.id}/resolve`, { method: 'POST', body }); toast(`Order #${o.id} resolved`); close(); load(); } catch (e) { toast(e.message, 'error'); }
      });
      $('#r1', m).onsubmit = e => { e.preventDefault(); const d = formData(e.target); if (!d.providerOrderId) return; go(e.target.querySelector('button'), { providerOrderId: d.providerOrderId }); };
      $('#r2', m).onsubmit = e => { e.preventDefault(); const d = formData(e.target); if (!d.reason || !d.ok) return toast('Add a reason and tick the confirmation.', 'error'); go(e.target.querySelector('button'), { confirmNotSubmitted: true, reason: d.reason }); };
    });
  }
  function refund(o) {
    const max = o.charge - (o.refundAmount || 0);
    modal(`<h2>Refund #${esc(o.id)}</h2><p class="muted">Credits the customer wallet only. Up to ${money(max, c)} remains refundable.</p>
      <form data-u="u-b0043e"><div class="field"><label for="ra">Amount (${esc(c)})</label><input id="ra" name="amount" type="number" step="0.01" min="0.01" max="${max / 100}" value="${(max / 100).toFixed(2)}" required></div>
      <div class="field"><label for="rr">Reason</label><input id="rr" name="reason" required></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn signal" data-busy="Refunding">Refund to wallet</button></div></form>`, (m, close) => {
      const f = $('form', m);
      f.onsubmit = e => {
        e.preventDefault();
        const d = formData(f), amt = Math.round(Number(d.amount) * 100);
        if (!(amt > 0) || amt > max) return toast(`Amount must be between ${money(1, c)} and ${money(max, c)}.`, 'error');
        if (!d.reason) return toast('Reason is required.', 'error');
        busy(f.querySelector('.signal'), async () => {
          try { await api(`/admin/orders/${o.id}/refund`, { method: 'POST', body: { totalRefundAmount: o.refundAmount + amt, reason: d.reason } }); toast(`Refunded ${money(amt, c)}`); close(); load(); } catch (ex) { toast(ex.message, 'error'); }
        });
      };
    });
  }
  $$('.chip', el).forEach(b => b.onclick = () => { status = b.dataset.s; page = 1; $$('.chip', el).forEach(x => x.classList.toggle('on', x === b)); box.innerHTML = skeleton(8); load(); });
  load();
}

export async function users(el, ctx) {
  const { state } = ctx;
  document.title = `Users | ${state.settings.siteName}`;
  const c = W(state), sup = isSuper(state);
  let q = '', page = 1, t;
  el.innerHTML = head('Users', sup ? 'Manage access, roles and wallet adjustments.' : 'Read only. Access, role and balance changes need the super admin.') +
    `<div class="toolbar"><label class="search">${icon('search')}<input type="search" id="q" placeholder="Search name or email" aria-label="Search users"></label></div><div id="ul">${skeleton(8)}</div>`;
  const box = $('#ul', el);
  async function load() {
    try {
      const r = await api(`/admin/users?${new URLSearchParams({ q, page })}`);
      const list = r.users || [];
      box.innerHTML = `<div class="card">${list.length ? `<div class="table-wrap"><table><thead><tr><th>User</th><th>Country</th><th>Role</th><th class="num">Balance</th><th>Joined</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(u => { const locked = u.role === 'super_admin' || u.id === state.user.id; return `<tr><td><b data-u="u-0cf08e">${esc(u.name)}</b><div class="muted" data-u="u-6b9c17">${esc(u.email)}</div></td><td class="mono">${esc(u.country)}</td>
        <td>${sup && !locked ? `<select data-role="${esc(u.id)}" aria-label="Role" data-u="u-3444f5"><option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option></select>` : `<span class="badge plain">${esc(u.role.replace('_', ' '))}</span>`}</td>
        <td class="num">${money(u.balance, c)}</td><td class="muted">${date(u.createdAt, false)}</td><td>${u.disabled ? '<span class="badge bad">Disabled</span>' : '<span class="badge ok">Active</span>'}</td>
        <td><div class="row" data-u="u-2f86e4">${sup && !locked ? `<button class="btn ghost sm" data-toggle="${esc(u.id)}">${u.disabled ? 'Enable' : 'Disable'}</button>` : ''}${sup ? `<button class="btn ghost sm" data-bal="${esc(u.id)}">Adjust balance</button>` : ''}</div></td></tr>`; }).join('')}
      </tbody></table></div>${pager(r.page, r.pages, r.total)}` : empty({ glyph: 'users', title: q ? 'No matching users' : 'No users yet' })}</div>`;
      const find = id => list.find(u => String(u.id) === id);
      $$('[data-page]', box).forEach(b => b.onclick = () => { page = Number(b.dataset.page); load(); });
      $$('[data-toggle]', box).forEach(b => b.onclick = async () => {
        const u = find(b.dataset.toggle);
        if (!u.disabled && !(await confirmDialog({ title: `Disable ${u.name}?`, text: 'They will be signed out and unable to order until re-enabled. Their balance is kept.', confirm: 'Disable', danger: true }))) return;
        patch(u, { disabled: !u.disabled, role: u.role });
      });
      $$('[data-role]', box).forEach(s => s.onchange = () => { const u = find(s.dataset.role); patch(u, { disabled: u.disabled, role: s.value }); });
      $$('[data-bal]', box).forEach(b => b.onclick = () => balance(find(b.dataset.bal)));
    } catch (e) { errorState(box, e, load); }
  }
  async function patch(u, body) {
    try { await api(`/admin/users/${u.id}`, { method: 'PATCH', body }); toast(`Updated ${u.name}`); load(); } catch (e) { toast(e.message, 'error'); load(); }
  }
  function balance(u) {
    const adjustmentKey = uuid();
    modal(`<h2>Adjust balance</h2><p class="muted">${esc(u.name)} currently has ${money(u.balance, c)}. Use a negative amount to debit. The balance cannot go below zero.</p>
      <form data-u="u-b0043e"><div class="field"><label for="ba">Amount (${esc(c)}, signed)</label><input id="ba" name="amount" type="number" step="0.01" required placeholder="e.g. 250 or -100"></div>
      <div class="field"><label for="br">Reason</label><input id="br" name="reason" required></div>
      <div class="actions"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn signal" data-busy="Applying">Apply adjustment</button></div></form>`, (m, close) => {
      const f = $('form', m);
      f.onsubmit = e => {
        e.preventDefault();
        const d = formData(f), amt = Math.round(Number(d.amount) * 100);
        if (!amt) return toast('Enter a non-zero amount.', 'error');
        if (u.balance + amt < 0) return toast('That would make the balance negative.', 'error');
        if (!d.reason) return toast('Reason is required.', 'error');
        busy(f.querySelector('.signal'), async () => {
          try { await api(`/admin/users/${u.id}/balance`, { method: 'POST', body: { amount: amt, reason: d.reason, idempotencyKey: adjustmentKey } }); toast(`Balance adjusted by ${money(amt, c)}`); close(); load(); } catch (ex) { toast(ex.message, 'error'); }
        });
      };
    });
  }
  $('#q', el).oninput = e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); page = 1; load(); }, 300); };
  load();
}

export async function settings(el, ctx) {
  const { state } = ctx;
  document.title = `Settings | ${state.settings.siteName}`;
  const sup = isSuper(state);
  el.innerHTML = head('Settings', sup ? 'Brand, payments, provider and integrations.' : 'Read only. Only the super admin can change settings.', `<button class="btn ghost" id="job" data-busy="Reconciling">${icon('play')}Run reconciliation</button>`) + `<div id="st">${skeleton(10, 34)}</div>`;
  const box = $('#st', el);
  $('#job', el).onclick = e => runJobs(e.currentTarget);
  async function load() {
    let r;
    try { r = await api('/admin/settings'); } catch (e) { return errorState(box, e, load); }
    const s = r.settings || {}, ig = r.integrations || {};
    const v = k => esc(s[k] ?? '');
    const sec = (key, name, label, hint) => `<div class="secret-status"><div><b data-u="u-0cf08e">${label}</b><div class="muted" data-u="u-6b9c17">${hint}</div></div>${ig[key] ? `<span class="dot-ok">${icon('check')}Configured</span>` : `<span class="dot-no">${icon('x')}Not configured</span>`}</div>
      <div class="field" data-u="u-5371db"><label for="${name}">${ig[key] ? 'Replace key' : 'Add key'}</label><input id="${name}" name="${name}" type="password" autocomplete="new-password" spellcheck="false" placeholder="${ig[key] ? 'Stored securely. Leave empty to keep.' : 'Paste key'}"></div>`;
    box.innerHTML = `<form id="sf" novalidate><fieldset ${sup ? '' : 'disabled'} data-u="u-d0e597"><div class="cols"><div class="stack">
      <div class="card"><h2>Brand</h2><div class="grid2">
        <div class="field"><label for="siteName">Site name</label><input id="siteName" name="siteName" value="${v('siteName')}" required maxlength="60"></div>
        <div class="field"><label for="supportEmail">Support email</label><input id="supportEmail" name="supportEmail" type="email" value="${v('supportEmail')}"></div></div>
        <div class="field"><label for="tagline">Tagline</label><input id="tagline" name="tagline" value="${v('tagline')}" maxlength="160"></div>
        <div class="field"><label for="iconUrl">Icon URL</label><input id="iconUrl" name="iconUrl" type="url" value="${v('iconUrl')}" placeholder="https://"><span class="hint">HTTPS only. Leave empty to use the default mark.</span></div>
        <div class="field"><label for="announcement">Announcement banner</label><input id="announcement" name="announcement" value="${v('announcement')}" maxlength="240"></div>
        <div class="field"><label for="emailFrom">Sender email (verified in Resend)</label><input id="emailFrom" name="emailFrom" value="${v('emailFrom')}" type="email" placeholder="no-reply@yourdomain.com"></div>
        <label class="check"><input type="checkbox" name="registrationOpen" ${s.registrationOpen !== false ? 'checked' : ''}> Registration open</label>
        <label class="check" data-u="u-5371db"><input type="checkbox" name="maintenance" ${s.maintenance ? 'checked' : ''}> Maintenance mode</label></div>
      <div class="card"><h2>Money</h2><div class="grid2">
        <div class="field"><label>Wallet currency</label><input value="KES" disabled><span class="hint">Fixed.</span></div>
        <div class="field"><label for="minDeposit">Minimum deposit (KES)</label><input id="minDeposit" name="minDeposit" type="number" min="1" step="1" value="${s.minDeposit != null ? s.minDeposit / 100 : ''}"></div>
        <div class="field"><label for="paystackCurrency">Card checkout currency</label><input id="paystackCurrency" name="paystackCurrency" value="${v('paystackCurrency')}" maxlength="3" data-u="u-5f7abe"></div>
        <div class="field"><label for="paystackToWalletRate">1 card currency = ? KES</label><input id="paystackToWalletRate" name="paystackToWalletRate" type="number" step="any" min="0" value="${v('paystackToWalletRate')}"></div>
         <div class="field"><label for="providerToWalletRate">1 ${esc(s.providerCurrency || 'provider unit')} = ? KES</label><input id="providerToWalletRate" name="providerToWalletRate" type="number" step="any" min="0" value="${s.providerToWalletRate > 0 ? v('providerToWalletRate') : ''}"><span class="hint">Used to compute service cost. Set after syncing the provider currency.</span></div>
        <div class="field"><label for="defaultMarkupPercent">Default markup %</label><input id="defaultMarkupPercent" name="defaultMarkupPercent" type="number" step="0.1" value="${v('defaultMarkupPercent')}"></div></div>
        <p class="muted" data-u="u-ea8bbc">Provider currency: ${esc(s.providerCurrency || 'unknown until first sync')}. Last sync: ${s.lastSyncAt ? date(s.lastSyncAt) : 'never'}.</p></div>
      </div>
      <div class="stack" data-u="u-3b9d4e"><div class="card"><h2>Integrations</h2><div class="note" data-u="u-d51702">${icon('lock')}<span>Keys are write only. They are never shown again, never saved in this browser, and cleared from the form after saving.</span></div>
        ${sec('shakergains', 'shakergainsApiKey', 'ShakerGains provider', 'Service catalog and order fulfilment')}
        ${sec('giftedpay', 'giftedpayApiKey', 'GiftedPay M-Pesa', 'Kenyan wallet top ups')}
        ${sec('paystack', 'paystackSecretKey', 'Paystack secret key', 'International card checkout')}
        ${sec('resend', 'resendApiKey', 'Resend', 'Password reset emails')}</div>
        ${sup ? '<button class="btn signal block" data-busy="Saving settings">Save settings</button>' : ''}
        <div class="card"><h2>Scheduled jobs</h2><p class="muted" data-u="u-bfc824">Pending orders and payments reconcile when you run the job above. On hosts without a long running process, call the jobs endpoint on a schedule.</p></div></div></div></fieldset></form>`;
    const f = $('#sf', box);
    f.onsubmit = e => {
      e.preventDefault();
      const d = formData(f);
      const num2 = k => (d[k] === '' ? undefined : Number(d[k]));
      if (d.iconUrl && !/^https:\/\//i.test(d.iconUrl)) return toast('Icon URL must start with https://', 'error');
      for (const k of ['providerToWalletRate', 'paystackToWalletRate']) if (d[k] !== '' && !(Number(d[k]) > 0)) return toast('Exchange rates must be positive.', 'error');
      const body = {
        siteName: d.siteName, tagline: d.tagline, iconUrl: d.iconUrl, supportEmail: d.supportEmail, walletCurrency: 'KES', paystackCurrency: (d.paystackCurrency || '').toUpperCase(),
        providerToWalletRate: num2('providerToWalletRate'), paystackToWalletRate: num2('paystackToWalletRate'), minDeposit: d.minDeposit === '' ? undefined : Math.round(Number(d.minDeposit) * 100),
        emailFrom: d.emailFrom, announcement: d.announcement, registrationOpen: f.registrationOpen.checked, maintenance: f.maintenance.checked, defaultMarkupPercent: num2('defaultMarkupPercent'),
      };
      for (const k of ['shakergainsApiKey', 'resendApiKey', 'giftedpayApiKey', 'paystackSecretKey']) if (d[k]) body[k] = d[k];
      busy(f.querySelector('button.signal'), async () => {
        try {
          const r2 = await api('/admin/settings', { method: 'PATCH', body });
          $$('input[type=password]', f).forEach(i => { i.value = ''; });
          toast(r2.message || 'Settings saved');
          try { Object.assign(state.settings, await api('/public/settings')); } catch { /* keep */ }
          load();
        } catch (ex) { toast(ex.message, 'error'); }
      });
    };
  }
  load();
}

export async function audit(el, ctx) {
  const { state } = ctx;
  document.title = `Audit log | ${state.settings.siteName}`;
  let page = 1;
  el.innerHTML = head('Audit log', 'Every privileged action, who did it and when.') + `<div id="al">${skeleton(8)}</div>`;
  const box = $('#al', el);
  async function load() {
    try {
      const r = await api(`/admin/audit?page=${page}`);
      const ev = r.events || [];
      box.innerHTML = `<div class="card">${ev.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Detail</th></tr></thead><tbody>
        ${ev.map(x => `<tr><td class="muted" data-u="u-4ddbe9">${date(x.createdAt)}</td><td><span class="badge plain mono">${esc(x.action)}</span></td><td>${esc(x.actor)}</td><td class="mono">${esc(x.target)}</td><td data-u="u-d4a135">${esc(typeof x.detail === 'object' ? JSON.stringify(x.detail) : x.detail)}</td></tr>`).join('')}
        </tbody></table></div>${pager(r.page, r.pages, r.total)}` : empty({ glyph: 'shield', title: 'No events yet', text: 'Admin actions will be recorded here.' })}</div>`;
      $$('[data-page]', box).forEach(b => b.onclick = () => { page = Number(b.dataset.page); load(); });
    } catch (e) { errorState(box, e, load); }
  }
  load();
}

export async function payments(el, ctx) {
  const { state } = ctx;
  document.title = `Payments | ${state.settings.siteName}`;
  const sup = isSuper(state);
  let status = '', page = 1;
  const ST = ['', 'review', 'pending', 'initializing', 'completed', 'failed'];
  el.innerHTML = head('Payments', sup ? 'Investigate stuck top ups. Wallets are credited only after the gateway confirms.' : 'Read only. Resolving payments needs the super admin.', `<button class="btn ghost" id="job" data-busy="Reconciling">${icon('play')}Run reconciliation</button>`) +
    `<div class="chips">${ST.map(s => `<button class="chip ${s === status ? 'on' : ''}" data-s="${esc(s)}">${s ? s[0].toUpperCase() + s.slice(1) : 'All'}</button>`).join('')}</div><div id="ap">${skeleton(8)}</div>`;
  const box = $('#ap', el);
  $('#job', el).onclick = e => runJobs(e.currentTarget, load);
  async function load() {
    try {
      const r = await api(`/admin/payments?${new URLSearchParams({ status, page })}`);
      const list = r.payments || [];
      box.innerHTML = `<div class="card">${list.length ? `<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Gateway</th><th class="num">Wallet amount</th><th class="num">Charged</th><th>Checkout ID</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
      ${list.map(p => `<tr><td class="mono">${esc(p.reference)}</td><td><span class="badge plain">${p.gateway === 'giftedpay' ? 'M-Pesa' : 'Card'}</span></td><td class="num">${money(p.amount, p.currency || W(state))}</td><td class="num">${p.payAmount != null ? money(p.payAmount, p.payCurrency || p.currency || W(state)) : ''}</td>
        <td class="mono">${esc(p.checkoutRequestId || '')}</td><td>${badge(p.status)}</td><td class="muted">${date(p.createdAt)}</td>
        <td>${sup && p.status !== 'completed' && p.status !== 'failed' ? `<button class="btn ghost sm" data-res="${esc(p.id)}">${p.gateway === 'giftedpay' && !p.checkoutRequestId ? 'Attach and verify' : 'Verify with gateway'}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>${pager(r.page, r.pages, r.total)}` : empty({ glyph: 'card', title: status ? `No ${status} payments` : 'No payments yet', text: status === 'review' ? 'Nothing needs attention.' : '' })}</div>`;
      $$('[data-page]', box).forEach(b => b.onclick = () => { page = Number(b.dataset.page); load(); });
      $$('[data-res]', box).forEach(b => b.onclick = () => resolve(list.find(p => String(p.id) === b.dataset.res)));
    } catch (e) { errorState(box, e, load); }
  }
  function resolve(p) {
    const needId = p.gateway === 'giftedpay';
    modal(`<h2>Verify ${esc(p.reference)}</h2><p class="muted">This asks ${needId ? 'GiftedPay' : 'Paystack'} for the real outcome. The wallet is credited only if the gateway confirms payment. There is no manual credit here.</p>
      <form class="mt14">${needId ? `<div class="field"><label for="cid">Upstream checkout request ID</label><input id="cid" name="checkoutRequestId" value="${esc(p.checkoutRequestId || '')}" spellcheck="false" ${p.checkoutRequestId ? '' : 'required'}><span class="hint">Find it in the GiftedPay dashboard for this phone and amount.</span></div>` : ''}
      <div class="actions"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn signal" data-busy="Verifying">Verify with gateway</button></div></form>`, (m, close) => {
      const f = $('form', m);
      f.onsubmit = e => {
        e.preventDefault();
        const d = formData(f);
        if (needId && !d.checkoutRequestId) return toast('Enter the checkout request ID.', 'error');
        busy(f.querySelector('.signal'), async () => {
          try {
            const r = await api(`/admin/payments/${p.id}/resolve`, { method: 'POST', body: needId ? { checkoutRequestId: d.checkoutRequestId } : {} });
            toast(r.message || `Payment ${r.payment.status}`, r.payment.status === 'failed' ? 'error' : 'ok'); close(); load();
          } catch (ex) { toast(ex.message, 'error'); }
        });
      };
    });
  }
  $$('.chip', el).forEach(b => b.onclick = () => { status = b.dataset.s; page = 1; $$('.chip', el).forEach(x => x.classList.toggle('on', x === b)); box.innerHTML = skeleton(8); load(); });
  load();
}
