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

/**
 * Changes a button's label and lets its width follow smoothly (kitchen "Dynamic Button"), so the row around it
 * doesn't jump. Falls back to an instant change when motion is reduced.
 */
export function setLabel(btn, text) {
  if (btn.textContent === text) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = btn.getBoundingClientRect().width;
  btn.textContent = text;
  if (reduce || !from || !btn.animate) return;
  const to = btn.getBoundingClientRect().width;
  if (Math.abs(to - from) > 1) btn.animate([{ width: from + 'px' }, { width: to + 'px' }], { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' });
}

/** Disables a button and shows a label while work runs; errors go to statusEl or a toast. */
export async function busy(btn, label, work, statusEl) {
  const old = btn.textContent;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); setLabel(btn, label);
  if (statusEl) { statusEl.className = 'status'; statusEl.textContent = ''; }
  try { return await work(); } catch (e) {
    if (statusEl) { statusEl.className = 'status err'; statusEl.textContent = errText(e); } else toast(errText(e), true);
    return undefined;
  } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); setLabel(btn, old); }
}

/**
 * A destructive button you hold to confirm (kitchen "Hold to Confirm"): a fill sweeps across while held and
 * runs onConfirm when it reaches the end. Letting go early rolls it back. Holding Enter or Space works too.
 */
export function holdButton(label, onConfirm, { duration = 1600, done = 'Done' } = {}) {
  const fill = h('span', { class: 'hold-fill', 'aria-hidden': 'true' }, label);
  const btn = h('button', { type: 'button', class: 'btn hold', 'aria-label': label + ' (press and hold)' }, h('span', {}, label), fill);
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = null, anim = null;
  const set = (pct, ms, ease) => {
    const from = getComputedStyle(fill).clipPath;
    if (anim) anim.cancel();
    anim = fill.animate([{ clipPath: from }, { clipPath: `inset(0 ${100 - pct}% 0 0)` }], { duration: reduce() ? 0 : ms, easing: ease, fill: 'forwards' });
  };
  const start = (e) => {
    if (btn.disabled || timer) return;
    if (e.type === 'pointerdown') btn.setPointerCapture(e.pointerId);
    btn.setAttribute('aria-busy', 'true');
    const ms = e.type === 'keydown' ? Math.min(duration, 900) : duration;
    set(100, ms, 'linear');
    timer = setTimeout(async () => {
      timer = null; btn.removeAttribute('aria-busy'); btn.classList.add('held');
      fill.textContent = done;
      try { await onConfirm(); } finally { setTimeout(() => { btn.classList.remove('held'); fill.textContent = label; set(0, 0, 'linear'); }, 1800); }
    }, ms);
  };
  const cancel = () => {
    if (!timer) return;
    clearTimeout(timer); timer = null; btn.removeAttribute('aria-busy');
    set(0, 180, 'cubic-bezier(.23,1,.32,1)');
  };
  btn.addEventListener('pointerdown', start);
  ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(ev => btn.addEventListener(ev, cancel));
  btn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(e); } });
  btn.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') cancel(); });
  return btn;
}

/** 2px-stroke line icons on a 24 grid, built from our own constant shapes. */
const ICONS = {
  refresh: [['path', 'M21 12a9 9 0 0 1-15.4 6.4L3 16'], ['path', 'M3 12a9 9 0 0 1 15.4-6.4L21 8'], ['path', 'M21 3v5h-5M3 21v-5h5']],
  plus: [['path', 'M12 5v14M5 12h14']],
  search: [['circle', 11, 11, 7], ['path', 'm20 20-3.5-3.5']],
  external: [['path', 'M14 4h6v6M20 4l-9 9'], ['path', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5']],
  download: [['path', 'M12 4v11'], ['path', 'M7 10l5 5 5-5'], ['path', 'M5 20h14']],
  archive: [['path', 'M4 5h16v4H4z'], ['path', 'M6 9v10h12V9'], ['path', 'M10 13h4']],
  mail: [['path', 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'], ['path', 'm3 7 9 6 9-6']],
  alert: [['path', 'M12 3 2 20h20z'], ['path', 'M12 10v4M12 17h.01']],
  x: [['path', 'M6 6l12 12M18 6 6 18']],
  check: [['path', 'm5 12 5 5 9-10']],
  home: [['path', 'M3 11 12 4l9 7'], ['path', 'M5 10v10h14V10']],
  filter: [['path', 'M3 5h18l-7 8v6l-4 2v-8z']],
  more: [['circle', 5, 12, 1.2], ['circle', 12, 12, 1.2], ['circle', 19, 12, 1.2]],
  bookmark: [['path', 'M6 3h12v18l-6-4-6 4z']],
  bell: [['path', 'M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7'], ['path', 'M10 20a2 2 0 0 0 4 0']],
  upload: [['path', 'M12 16V4M7 9l5-5 5 5'], ['path', 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3']],
  file: [['path', 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z'], ['path', 'M14 3v5h5']],
  grip: [['path', 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01']],
};
export function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
  (ICONS[name] || []).forEach(([tag, a, b, c]) => {
    const el = document.createElementNS(NS, tag);
    if (tag === 'path') el.setAttribute('d', a); else { el.setAttribute('cx', a); el.setAttribute('cy', b); el.setAttribute('r', c); }
    svg.append(el);
  });
  return svg;
}

/** Page header: an h1 noun title, one grey line about the data, and real actions on the right. */
export function pageHead(title, sub, ...actions) {
  return h('header', { class: 'page-head' },
    h('div', {}, h('h1', { tabIndex: -1 }, title), sub ? h('p', { class: 'page-sub' }, sub) : ''),
    actions.length ? h('div', { class: 'page-acts' }, ...actions) : '');
}

/** "3 min ago", "2 h ago", or the date. */
export function ago(iso, now = Date.now()) {
  if (!iso) return '';
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** A small button that copies text and says "Copied" for a moment. */
export function copyButton(text, label = 'Copy') {
  const btn = h('button', { type: 'button', class: 'btn btn-sm btn-quiet copy', onclick: async () => {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const ta = h('textarea', { value: text, readOnly: true, class: 'visually-hidden' }); document.body.append(ta); ta.select();
      try { document.execCommand('copy'); } finally { ta.remove(); }
    }
    setLabel(btn, 'Copied'); setTimeout(() => setLabel(btn, label), 1500);
  } }, label);
  return btn;
}

/** Opens the shared <dialog> with a title and content; returns a close function. */
export function openDialog(title, ...body) {
  const d = $('dialog');
  const close = () => d.close();
  d.replaceChildren(h('div', { class: 'dialog-head' }, h('h2', { id: 'dialog-title' }, title),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x'))), ...body);
  d.showModal();
  return close;
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
const PILL_TONE = { Screening: 'orange', Assessment: 'orange', Interview: 'blue', Offer: 'green', Rejected: 'red', New: 'blue', Saved: 'blue' };
export const pill = (v, tone) => { const t = tone === undefined ? PILL_TONE[v] : tone; return h('span', { class: 'pill' + (t ? ' pill-' + t : '') }, v); };
export const emptyRow = (cols, text) => h('tr', {}, h('td', { colSpan: cols, class: 'empty' }, text));

/**
 * Chips you can add to and remove from. Returns {el, get(), set(list)}. suggestions: extra one-click chips.
 * search(q, current): live matches shown from the first letter typed (a combobox: arrows, Enter, Escape).
 */
let comboId = 0;
export function chipInput(values, { placeholder, suggestions = [], label, max = 12, search, onChange } = {}) {
  let list = values.slice(), matches = [], active = -1;
  const id = 'combo-' + (++comboId);
  const wrap = h('div', { class: 'chips' });
  const input = h('input', { type: 'text', placeholder: placeholder || 'Type and press Enter', 'aria-label': label || placeholder, autocomplete: 'off' });
  const box = h('ul', { class: 'combo', id, role: 'listbox', 'aria-label': (label || 'Suggestions'), hidden: true });
  if (search) { input.setAttribute('role', 'combobox'); input.setAttribute('aria-controls', id); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-autocomplete', 'list'); }
  const sugg = h('div', { class: 'chip-sugg' });
  const add = (v) => {
    v = String(v || '').trim().slice(0, 80);
    if (!v || list.length >= max || list.some(x => x.toLowerCase() === v.toLowerCase())) return;
    list.push(v); draw(); if (onChange) onChange(list.slice());
  };
  const drawMatches = () => {
    matches = search ? search(input.value, list) : [];
    if (active >= matches.length) active = matches.length - 1;
    box.hidden = !matches.length;
    input.setAttribute('aria-expanded', String(!!matches.length));
    if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-${active}`); else input.removeAttribute('aria-activedescendant');
    box.replaceChildren(...matches.map((m, i) => h('li', { id: `${id}-${i}`, role: 'option', 'aria-selected': String(i === active),
      onmousedown: (e) => { e.preventDefault(); pick(m); } }, m)));
  };
  const pick = (v) => { add(v); input.value = ''; active = -1; drawMatches(); input.focus(); };
  const draw = () => {
    wrap.replaceChildren(...list.map((v, i) => h('span', { class: 'chip' }, v,
      h('button', { type: 'button', 'aria-label': 'Remove ' + v, onclick: () => { list.splice(i, 1); draw(); if (onChange) onChange(list.slice()); input.focus(); } }, '×'))), input);
    sugg.replaceChildren(...suggestions.filter(s => !list.some(x => x.toLowerCase() === s.toLowerCase()))
      .map(s => h('button', { type: 'button', class: 'chip-add', onclick: () => add(s) }, '+ ' + s)));
  };
  input.addEventListener('input', () => { active = search && input.value.trim() ? 0 : -1; drawMatches(); });
  input.addEventListener('keydown', (e) => {
    if (search && matches.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; drawMatches();
    } else if (search && e.key === 'Escape' && matches.length) { e.preventDefault(); matches = []; box.hidden = true; input.setAttribute('aria-expanded', 'false'); }
    else if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && input.value.trim()) {
      if (e.key === 'Tab' && !(search && active >= 0)) return;
      e.preventDefault(); pick(search && active >= 0 && matches[active] ? matches[active] : input.value);
    } else if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); draw(); if (onChange) onChange(list.slice()); }
  });
  input.addEventListener('blur', () => {
    if (!search && input.value.trim()) { add(input.value); input.value = ''; }
    box.hidden = true; input.setAttribute('aria-expanded', 'false');
  });
  draw();
  return {
    el: h('div', { class: 'chip-field' }, wrap, box, sugg),
    get: () => { if (input.value.trim()) { add(input.value); input.value = ''; } return list.slice(); },
    set: (v) => { list = v.slice(); draw(); },
  };
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
