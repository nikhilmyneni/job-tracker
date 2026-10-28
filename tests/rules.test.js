// Tests for the parts of src/*.gs that don't need Google services.
// Run: npm test   (Node 18+)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

function load() {
  const dir = __dirname + '/../src/';
  const src = fs.readdirSync(dir).filter(f => f.endsWith('.gs')).map(f => fs.readFileSync(dir + f, 'utf8')).join('\n');
  const ctx = { console, Session: { getEffectiveUser: () => ({ getEmail: () => 'me@example.com' }) } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}
const ctx = load();
const call = (expr) => vm.runInContext(expr, ctx);
const classify = (subject, from, body) => call(`ruleClassify_(${JSON.stringify({ subject, from, body })})`);

test('rejection', () => {
  const r = classify('Your application for Profile Review Executive', 'ApplyRyt Careers <careers@applyryt.com>',
    'After careful consideration, we have decided not to take your application forward');
  assert.equal(r.is_application_update, true);
  assert.equal(r.stage, 'Rejected');
  assert.equal(r.company, 'ApplyRyt');
  assert.equal(r.role, 'Profile Review Executive');
});

test('confirmation', () => {
  const r = classify('Thank you for your application to Notion, Sai!', 'Notion <recruiting-no-reply@makenotion.com>', 'Thank you for applying to Notion');
  assert.equal(r.stage, 'Applied');
  assert.equal(r.company, 'Notion');
});

test('assessment invite = Screening', () => {
  const r = classify('Amazon invites you to complete an assessment!', 'noreply@mail.amazon.jobs', 'complete the online assessment');
  assert.equal(r.stage, 'Screening');
  assert.equal(r.company, 'Amazon');
});

test('interview invite', () => {
  assert.equal(classify('Interview invitation', 'careers@applyryt.com', 'We would like to invite you to an interview').stage, 'Interview');
});

test('selection = Offer', () => {
  assert.equal(classify('Congratulations — You Have Been Selected', 'ApplyRyt <careers@applyryt.com>', 'you have been selected').stage, 'Offer');
});

test('unrelated mail ignored', () => {
  assert.equal(classify('Your weekly newsletter', 'news@site.com', 'hello').is_application_update, false);
});

const fakeProps = (obj) => {
  const store = { settings: obj === undefined ? undefined : JSON.stringify(obj) };
  return { getProperty: (k) => store[k] == null ? null : store[k], setProperty: (k, v) => { store[k] = v; }, store };
};
const plain = (x) => JSON.parse(JSON.stringify(x));
const newResult = () => ({ appsNew: 0, appsChanged: [], jobsNew: [], due: [], notes: [] });

test('settings: defaults when nothing is saved', () => {
  ctx.p = fakeProps();
  const s = call('readSettings_(p)');
  assert.equal(s.enabled, false);
  assert.equal(s.hour, 20);
  assert.equal(s.jobsPerDay, 5);
  assert.equal(s.days.Sun, true);
});

test('settings: saved values are kept, bad ones replaced', () => {
  ctx.p = fakeProps({ enabled: true, hour: 21, days: { Tue: false, Sat: 'yes' }, jobsPerDay: 10, geminiKey: ' abc ', since: '2026-06-01' });
  const s = call('readSettings_(p)');
  assert.equal(s.enabled, true);
  assert.equal(s.hour, 21);
  assert.equal(s.days.Tue, false);
  assert.equal(s.days.Sat, true);
  assert.equal(s.jobsPerDay, 10);
  assert.equal(s.geminiKey, 'abc');
  assert.equal(s.since, '2026-06-01');
  ctx.p = fakeProps({ hour: 30, jobsPerDay: 7, since: 'soon' });
  const t = call('readSettings_(p)');
  assert.equal(t.hour, 20);
  assert.equal(t.jobsPerDay, 5);
  assert.equal(t.since, '');
});

test('settings: write then read round-trips', () => {
  ctx.p = fakeProps();
  call('writeSettings_(Object.assign(defaultSettings_(), { hour: 7, enabled: true }), p)');
  assert.equal(call('readSettings_(p)').hour, 7);
  assert.equal(call('readSettings_(p)').enabled, true);
});

test('upsertApplication_: new, then advance; furthest never moves back', () => {
  ctx.apps = []; ctx.res = newResult();
  call(`upsertApplication_(apps, { company: 'Acme', role: 'SOC Analyst', stage: 'Applied', date: '2026-10-01', channel: 'LinkedIn' }, res)`);
  call(`upsertApplication_(apps, { company: 'Acme', role: 'SOC Analyst', stage: 'Interview', date: '2026-10-05', next_step: 'Prepare' }, res)`);
  call(`upsertApplication_(apps, { company: 'acme', role: 'soc analyst', stage: 'Rejected', date: '2026-10-09' }, res)`);
  const a = plain(ctx.apps);
  assert.equal(a.length, 1);
  assert.equal(a[0].status, 'Rejected');
  assert.equal(a[0].furthest, 'Interview');
  assert.equal(a[0].applied_on, '2026-10-01');
  assert.equal(a[0].last_update, '2026-10-09');
  assert.equal(a[0].next_step, '');
  assert.equal(a[0].channel, 'LinkedIn');
  assert.equal(ctx.res.appsNew, 1);
  assert.equal(ctx.res.appsChanged.length, 3);
});

test('upsertApplication_: roleless email matches, and a role fills in later', () => {
  ctx.apps = []; ctx.res = newResult();
  call(`upsertApplication_(apps, { company: 'Beta', role: '', stage: 'Applied', date: '2026-10-01' }, res)`);
  call(`upsertApplication_(apps, { company: 'Beta', role: 'Intern', stage: 'Screening', date: '2026-10-03' }, res)`);
  call(`upsertApplication_(apps, { company: 'Beta', role: '', stage: 'Interview', date: '2026-10-04' }, res)`);
  const a = plain(ctx.apps);
  assert.equal(a.length, 1);
  assert.equal(a[0].role, 'Intern');
  assert.equal(a[0].key, 'beta|intern');
  assert.equal(a[0].furthest, 'Interview');
});

test('upsertApplication_: no company, no row', () => {
  ctx.apps = []; ctx.res = newResult();
  call(`upsertApplication_(apps, { company: '  ', stage: 'Applied', date: '2026-10-01' }, res)`);
  assert.equal(ctx.apps.length, 0);
});

test('markGhosted_ after 21 quiet days, only from Applied', () => {
  ctx.apps = [
    { company: 'Old', status: 'Applied', last_update: '2026-09-01' },
    { company: 'Recent', status: 'Applied', last_update: '2026-10-20' },
    { company: 'Busy', status: 'Interview', last_update: '2026-09-01' },
  ];
  ctx.res = newResult();
  call(`markGhosted_(apps, new Date('2026-10-29T12:00:00'), res)`);
  assert.deepEqual(plain(ctx.apps).map(a => a.status), ['Ghosted', 'Applied', 'Interview']);
});

test('expireJobs_: same role or roleless application → Applied; past apply-by → Expired', () => {
  ctx.jobs = [
    { company: 'Acme', role: 'SOC Analyst', status: 'New', key: 'acme|soc analyst' },
    { company: 'Acme', role: 'Pentester', status: 'New', key: 'acme|pentester' },
    { company: 'Beta', role: 'Intern', status: 'New', key: 'beta|intern' },
    { company: 'Gamma', role: 'Analyst', status: 'New', key: 'gamma|analyst', apply_by: '2026-10-01' },
    { company: 'Delta', role: 'Analyst', status: 'Skipped', key: 'delta|analyst', apply_by: '2026-10-01' },
  ];
  ctx.apps = [{ key: 'acme|soc analyst' }, { key: 'beta|' }];
  call(`expireJobs_(jobs, apps, '2026-10-29')`);
  assert.deepEqual(plain(ctx.jobs).map(j => j.status), ['Applied', 'New', 'Applied', 'Expired', 'Skipped']);
});

test('collectDue_ lists next steps for live stages only', () => {
  ctx.apps = [
    { company: 'A', status: 'Interview', next_step: 'Prepare' },
    { company: 'B', status: 'Rejected', next_step: 'x' },
    { company: 'C', status: 'Screening', next_step: '' },
  ];
  ctx.res = newResult();
  call('collectDue_(apps, res)');
  assert.deepEqual(plain(ctx.res.due), ['A: Prepare']);
});

test('summaryText_', () => {
  ctx.res = Object.assign(newResult(), { appsChanged: ['Acme: Applied'], jobsNew: ['Beta – Intern (fit 4/5)'] });
  const t = call('summaryText_(res)');
  assert.match(t, /Application updates:\n- Acme: Applied/);
  assert.match(t, /New recommended jobs \(open the tracker for a tailored resume\):\n- Beta/);
});

test('cleanResume_: no name means no resume', () => {
  assert.equal(call('cleanResume_(null)'), null);
  assert.equal(call('cleanResume_({ name: "  ", summary: "x" })'), null);
  assert.equal(call('cleanResume_("text")'), null);
});

test('cleanResume_: keeps known fields as strings, drops junk, caps lists', () => {
  ctx.raw = {
    name: ' Test Person ', headline: 'Security Analyst', contact: ['a@example.com', 123, null, { x: 1 }],
    summary: 'Short summary.', photo: 'http://x', dob: '2000-01-01',
    skills: [{ group: 'Tools', items: ['Nmap', 'Wireshark'] }, { group: 'Empty', items: [] }, 'bad', ...Array(6).fill({ group: 'G', items: ['x'] })],
    experience: [{ title: 'Intern', org: 'Acme', dates: '2025', bullets: ['a', 'b', 'c', 'd', 'e'] }, { bullets: ['no title'] }],
    projects: Array(5).fill({ name: 'P', tech: 'Python', bullets: ['x'] }),
    education: [{ school: 'MRU', degree: 'B.Tech', dates: '2022–2026' }, { degree: 'no school' }],
    certifications: ['CEH', ''], extras: 'not a list',
  };
  const r = plain(call('cleanResume_(raw)'));
  assert.equal(r.name, 'Test Person');
  assert.deepEqual(r.contact, ['a@example.com', '123']);
  assert.equal('photo' in r || 'dob' in r, false);
  assert.equal(r.skills.length, 4);
  assert.deepEqual(r.skills[0], { group: 'Tools', items: ['Nmap', 'Wireshark'] });
  assert.equal(r.experience.length, 1);
  assert.equal(r.experience[0].bullets.length, 4);
  assert.equal(r.projects.length, 3);
  assert.equal(r.education.length, 1);
  assert.deepEqual(r.certifications, ['CEH']);
  assert.deepEqual(r.extras, []);
});
