/** The applications board (drag a card to another column), the timeline, and the card's edit dialog. */
import { h, busy, icon, pill, openDialog, isHttp, toast, errText } from './ui.js';
import { BOARD, STATUSES, STATUS_LABEL, boardColumn, nextLabel, timeline } from './core.js';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (ymd) => { const [, m, d] = String(ymd || '').split('-'); return d ? `${Number(d)} ${MONTH[Number(m) - 1]}` : ''; };
const initial = (s) => (String(s || '?').trim().charAt(0) || '?').toUpperCase();

export function renderBoard(ctx, apps) {
  const { act } = ctx;
  let dragging = null;
  const cols = BOARD.map(col => {
    const mine = apps.filter(a => boardColumn(a.status) === col.id)
      .sort((a, b) => String(b.last_update || '').localeCompare(String(a.last_update || '')));
    const list = h('div', { class: 'col-list' }, ...mine.map(a => card(ctx, a, () => { dragging = a; })));
    if (!mine.length) list.append(h('p', { class: 'col-empty' }, 'Drop a card here'));
    const el = h('section', { class: 'col', 'aria-label': `${col.label}, ${mine.length}`, dataset: { col: col.id } },
      h('h3', { class: 'col-head' }, col.label, h('span', { class: 'col-count' }, mine.length)), list);
    el.addEventListener('dragover', (e) => { if (dragging) { e.preventDefault(); el.classList.add('drop'); } });
    el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop'); });
    el.addEventListener('drop', async (e) => {
      e.preventDefault(); el.classList.remove('drop');
      const a = dragging; dragging = null;
      if (!a || boardColumn(a.status) === col.id) return;
      try { await act.setApplicationStatus(a, col.id); toast(`${a.company} moved to ${col.label}`); } catch (err) { toast(errText(err), true); }
    });
    return el;
  });
  return h('div', { class: 'board-box', tabIndex: 0, 'aria-label': 'Applications board. Scroll sideways for more columns.' }, h('div', { class: 'board' }, ...cols));
}

function card(ctx, a, onDrag) {
  const next = nextLabel(a);
  const el = h('article', { class: 'app-card', draggable: 'true' },
    h('button', { type: 'button', class: 'app-card-open', 'aria-label': `${a.company}${a.role ? ', ' + a.role : ''}: ${STATUS_LABEL[a.status]}. Edit`, onclick: () => editDialog(ctx, a) }),
    h('div', { class: 'app-card-top' },
      h('span', { class: 'ini' }, initial(a.company)),
      h('div', { class: 'app-card-text' }, h('b', {}, a.company), h('span', {}, a.role || 'Role not stated'))),
    h('p', { class: 'app-card-src' }, icon('mail'), h('span', {}, `${a.channel || 'Email'} · ${shortDate(a.last_update || a.applied_on)}`)),
    next.text || a.status === 'Withdrawn' ? h('p', {}, pill(next.text || 'Withdrawn', next.tone)) : '',
    isHttp(a.email_link) || isHttp(a.posting_link) ? h('p', { class: 'app-card-links' },
      isHttp(a.email_link) ? h('a', { href: a.email_link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open the latest ${a.company} email in Gmail` }, icon('mail'), 'Email') : '',
      isHttp(a.posting_link) ? h('a', { href: a.posting_link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open the ${a.company} job posting` }, icon('external'), 'Posting') : '') : '');
  el.addEventListener('dragstart', (e) => { onDrag(); el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.id); });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  return el;
}

/** Fix anything the email reading got wrong: status, role, next step, the slot or deadline. */
export function editDialog(ctx, a) {
  const f = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-lbl' }, label), input);
  const status = h('select', {}, ...STATUSES.map(s => h('option', { value: s, selected: s === a.status }, STATUS_LABEL[s])));
  const role = h('input', { value: a.role || '', autocomplete: 'off' });
  const step = h('input', { value: a.next_step || '', autocomplete: 'off', placeholder: 'e.g. Prepare for the technical round' });
  const [d, t] = String(a.next_at || '').split('T');
  const date = h('input', { type: 'date', value: d || '' });
  const time = h('input', { type: 'time', value: t || '' });
  const kind = h('select', {}, h('option', { value: 'interview', selected: a.next_kind !== 'deadline' }, 'Interview slot'), h('option', { value: 'deadline', selected: a.next_kind === 'deadline' }, 'Deadline'));
  const msg = h('div', { class: 'status', role: 'status' });
  const save = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save changes');
  const form = h('form', { class: 'stack', onsubmit: (e) => {
    e.preventDefault();
    busy(save, 'Saving…', async () => {
      await ctx.act.editApplication(a, { status: status.value, role: role.value, next_step: step.value, next_at: date.value ? date.value + (time.value ? 'T' + time.value : '') : '', next_kind: kind.value });
      close(); toast('Saved');
    }, msg);
  } },
    f('Status', status), f('Role', role), f('Next step', step),
    h('div', { class: 'field-row' }, f('Date', date), f('Time', time), f('Type', kind)),
    isHttp(a.email_link) || isHttp(a.posting_link) ? h('p', { class: 'row' },
      isHttp(a.email_link) ? h('a', { href: a.email_link, target: '_blank', rel: 'noopener noreferrer', class: 'link-ext' }, icon('mail'), 'Open the latest email') : '',
      isHttp(a.posting_link) ? h('a', { href: a.posting_link, target: '_blank', rel: 'noopener noreferrer', class: 'link-ext' }, icon('external'), 'Open the job posting') : '') : '',
    msg,
    h('div', { class: 'row-split' }, h('div', { class: 'row' }, removeBtn(() => ctx.act.deleteApplication(a).then(() => close())),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: (e) => busy(e.currentTarget, '…', () => ctx.act.archiveApplications([a], !a.archived).then(() => close())) }, a.archived ? 'Unarchive' : 'Archive')), save));
  const close = openDialog(a.company, form);
}

/** Remove, confirmed in place: the button becomes "Yes, remove" and "Keep" (no second dialog). */
export function removeBtn(onRemove, label = 'Remove', question = 'Remove it?') {
  const box = h('div', { class: 'confirm-inline' });
  const ask = () => box.replaceChildren(h('span', { class: 'confirm-q', role: 'status' }, question),
    h('button', { type: 'button', class: 'btn btn-danger', onclick: (e) => busy(e.currentTarget, 'Removing…', onRemove) }, 'Yes, remove'),
    h('button', { type: 'button', class: 'btn btn-quiet', onclick: idle }, 'Keep'));
  const idle = () => box.replaceChildren(h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { ask(); box.querySelector('.btn-danger').focus(); } }, label));
  idle();
  return box;
}

export function renderTimeline(apps) {
  const events = timeline(apps).slice(0, 200);
  if (!events.length) return h('p', { class: 'empty' }, 'Status changes show up here as they happen.');
  const groups = new Map();
  events.forEach(e => { const k = e.on; groups.set(k, (groups.get(k) || []).concat(e)); });
  const by = { email: 'from email', you: 'changed by you', quiet: 'no reply' };
  return h('ol', { class: 'timeline' }, ...[...groups].map(([on, list]) => h('li', {},
    h('h3', { class: 'tl-date' }, new Date(on + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })),
    h('ul', { class: 'tl-list' }, ...list.map(e => h('li', { class: 'tl-row' },
      h('span', { class: 'ini' }, initial(e.company)),
      h('span', { class: 'tl-what' }, h('b', {}, e.company), e.role ? h('span', {}, e.role) : ''),
      pill(STATUS_LABEL[e.status] || e.status), h('span', { class: 'tl-by' }, by[e.by] || '')))))));
}
