import { esc, num } from './ui.js';

const DEFS = {
  link: { label: 'Link', type: 'url', hint: 'Full public URL to the post, profile or page.', ph: 'https://' },
  quantity: { label: 'Quantity', type: 'number' },
  comments: { label: 'Comments', type: 'lines', hint: 'One comment per line.' },
  usernames: { label: 'Usernames', type: 'lines', hint: 'One username per line.' },
  hashtags: { label: 'Hashtags', type: 'lines', hint: 'One hashtag per line.' },
  username: { label: 'Username', type: 'text' },
  media: { label: 'Media URL', type: 'url', ph: 'https://' },
  groups: { label: 'Groups', type: 'lines', hint: 'One group per line.' },
  answer_number: { label: 'Answer number', type: 'number' },
  keywords: { label: 'Keywords', type: 'lines', hint: 'One keyword per line.' },
  title: { label: 'Title', type: 'text' },
  description: { label: 'Description', type: 'textarea' },
  min: { label: 'Minimum per post', type: 'number' },
  max: { label: 'Maximum per post', type: 'number' },
  posts: { label: 'Number of posts', type: 'number' },
  old_posts: { label: 'Old posts', type: 'number' },
  delay: { label: 'Delay (minutes)', type: 'number' },
  expiry: { label: 'Expiry date', type: 'date' },
  runs: { label: 'Runs', type: 'number' },
  interval: { label: 'Interval (minutes)', type: 'number' },
};
const human = k => k.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
export const def = k => DEFS[k] || { label: human(k), type: 'text' };

export function usesQuantity(svc) {
  const req = svc.requirements || [];
  return req.includes('quantity') || (!req.length && svc.pricingUnit !== 'package');
}
export function requiredKeys(svc) {
  const req = svc.requirements && svc.requirements.length ? [...svc.requirements] : (svc.pricingUnit === 'package' ? ['link'] : ['link', 'quantity']);
  return req;
}

export function renderFields(svc, values = {}, uid = 'f') {
  const keys = requiredKeys(svc);
  return keys.map(k => {
    const d = def(k), id = `${uid}-${k}`, v = values[k] ?? '';
    let input;
    if (k === 'quantity') input = `<input id="${id}" name="${k}" type="number" inputmode="numeric" min="${svc.min}" max="${svc.max}" step="1" required value="${esc(v)}" placeholder="${num(svc.min)} to ${num(svc.max)}">`;
    else if (d.type === 'lines' || d.type === 'textarea') input = `<textarea id="${id}" name="${k}" required>${esc(v)}</textarea>`;
    else input = `<input id="${id}" name="${k}" type="${d.type}" ${d.type === 'number' ? 'inputmode="numeric" step="1" min="0"' : ''} required value="${esc(v)}" placeholder="${esc(d.ph || '')}">`;
    const hint = k === 'quantity' ? `Between ${num(svc.min)} and ${num(svc.max)}.` : d.hint;
    return `<div class="field" data-key="${k}"><label for="${id}">${esc(d.label)}</label>${input}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
  }).join('');
}

export function readFields(root, svc) {
  const keys = requiredKeys(svc);
  const out = { link: '', quantity: 0, fields: {} };
  const errors = [];
  for (const k of keys) {
    const elx = root.querySelector(`[name="${k}"]`);
    const raw = elx ? elx.value.trim() : '';
    const d = def(k);
    if (!raw) { errors.push(`${d.label} is required.`); continue; }
    if (k === 'link') {
      try { const u = new URL(raw); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { errors.push('Link must be a full http or https URL.'); }
      out.link = raw;
    } else if (k === 'quantity') {
      const q = Number(raw);
      if (!Number.isInteger(q) || q < svc.min || q > svc.max) errors.push(`Quantity must be a whole number between ${num(svc.min)} and ${num(svc.max)}.`);
      out.quantity = q;
    } else if (d.type === 'number') out.fields[k] = Number(raw);
    else if (d.type === 'lines') out.fields[k] = raw.split('\n').map(s => s.trim()).filter(Boolean).join('\n');
    else out.fields[k] = raw;
  }
  if (!keys.includes('quantity')) {
    const lines = out.fields.comments || out.fields.usernames;
    out.quantity = svc.pricingUnit === 'package' ? 1 : lines ? lines.split('\n').length : svc.min;
  }
  return { ...out, errors };
}

export function estimate(svc, qty) {
  if (!svc) return 0;
  if (svc.pricingUnit === 'package') return Number(svc.rate);
  return (Number(svc.rate) * Number(qty || 0)) / 1000;
}
