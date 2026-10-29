/** Small DOM helpers. Strings always become text, never HTML. */
export const $ = (id) => document.getElementById(id);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  kids.flat(Infinity).forEach(c => { if (c != null && c !== false && c !== '') el.append(c instanceof Node ? c : String(c)); });
  return el;
}

export const errText = (e) => String((e && e.message) || e || 'Something went wrong');

/** Disables a button and shows a label while work runs; errors go to statusEl or a toast. */
export async function busy(btn, label, work, statusEl) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  if (statusEl) { statusEl.className = 'status'; statusEl.textContent = ''; }
  try { return await work(); } catch (e) {
    if (statusEl) { statusEl.className = 'status err'; statusEl.textContent = errText(e); } else toast(errText(e), true);
    return undefined;
  } finally { btn.disabled = false; btn.textContent = old; }
}

let toastT;
export function toast(text, bad) {
  let t = $('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.className = bad ? 'show bad' : 'show';
  t.textContent = text;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.className = ''; }, bad ? 7000 : 3500);
}

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
export const isHttp = (u) => /^https?:\/\//.test(String(u || ''));
export const extLink = (href, text, cls) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: cls }, text);
export const pill = (v, cls) => h('span', { class: 'pill s-' + String(cls || v).replace(/[^A-Za-z-]/g, '') }, v);
export const emptyRow = (cols, text) => h('tr', {}, h('td', { colSpan: cols, class: 'empty' }, text));

/** Chips you can add to and remove from. Returns {el, get()}. suggestions: extra one-click chips. */
export function chipInput(values, { placeholder, suggestions = [], label, max = 12 } = {}) {
  let list = values.slice();
  const wrap = h('div', { class: 'chips' });
  const input = h('input', { type: 'text', placeholder: placeholder || 'Type and press Enter', 'aria-label': label || placeholder });
  const sugg = h('div', { class: 'chip-sugg' });
  const add = (v) => {
    v = String(v || '').trim().slice(0, 80);
    if (!v || list.length >= max || list.some(x => x.toLowerCase() === v.toLowerCase())) return;
    list.push(v); draw();
  };
  const draw = () => {
    wrap.replaceChildren(...list.map((v, i) => h('span', { class: 'chip' }, v,
      h('button', { type: 'button', 'aria-label': 'Remove ' + v, onclick: () => { list.splice(i, 1); draw(); } }, '×'))), input);
    sugg.replaceChildren(...suggestions.filter(s => !list.some(x => x.toLowerCase() === s.toLowerCase()))
      .map(s => h('button', { type: 'button', class: 'chip ghost', onclick: () => add(s) }, '+ ' + s)));
  };
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) { e.preventDefault(); add(input.value); input.value = ''; }
    else if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); draw(); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) { add(input.value); input.value = ''; } });
  draw();
  return { el: h('div', {}, wrap, sugg), get: () => { if (input.value.trim()) { add(input.value); input.value = ''; } return list.slice(); } };
}

/** One-of buttons. options: {value: label}. Returns {el, get()}. */
export function segmented(options, value, label) {
  let cur = value;
  const el = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const draw = () => el.replaceChildren(...Object.entries(options).map(([v, l]) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(String(cur) === String(v)), onclick: () => { cur = v; draw(); },
  }, l)));
  draw();
  return { el, get: () => cur };
}

/** Bar chart of {week, n} rows as inline SVG, sized to its box, with a tooltip. */
export function weeklyChart(box, rows) {
  if (!rows.length) { box.replaceChildren(h('div', { class: 'empty' }, 'No applications yet.')); return; }
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (text != null) e.textContent = text; return e; };
  const W = Math.max(280, box.clientWidth || 320), H = 200, left = 30, top = 8, bottom = 24;
  const max = Math.max(1, ...rows.map(r => r.n));
  const step = Math.max(1, Math.ceil(max / 4));
  const yMax = Math.ceil(max / step) * step;
  const y = (v) => H - bottom - (v / yMax) * (H - bottom - top);
  const band = (W - left - 4) / rows.length, bw = Math.min(32, band * 0.7);
  const svg = s('svg', { width: '100%', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Applications per week' });
  for (let v = 0; v <= yMax; v += step) {
    svg.append(s('line', { x1: left, x2: W - 4, y1: y(v), y2: y(v), class: 'grid' }));
    svg.append(s('text', { x: left - 6, y: y(v), dy: '0.32em', 'text-anchor': 'end', class: 'axis' }, v));
  }
  const fmt = (k) => new Date(k + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const every = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor((W - left) / 56))));
  const tip = h('div', { class: 'tip' });
  rows.forEach((r, i) => {
    const cx = left + band * i + band / 2;
    if (i % every === 0) svg.append(s('text', { x: cx, y: H - 6, 'text-anchor': 'middle', class: 'axis' }, fmt(r.week)));
    const rect = s('rect', { x: cx - bw / 2, width: bw, y: y(r.n), height: Math.max(0, y(0) - y(r.n)), rx: 4, class: 'barv' });
    rect.addEventListener('mousemove', (ev) => {
      tip.replaceChildren(h('div', { class: 'lbl' }, 'Week of ' + fmt(r.week)), h('div', {}, `${r.n} application${r.n === 1 ? '' : 's'}`));
      tip.style.opacity = 1;
      const bb = box.getBoundingClientRect();
      tip.style.left = Math.max(0, Math.min(ev.clientX - bb.left + 12, bb.width - tip.offsetWidth - 4)) + 'px';
      tip.style.top = Math.max(0, ev.clientY - bb.top - 44) + 'px';
    });
    rect.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
    svg.append(rect);
  });
  box.replaceChildren(svg, tip);
}
