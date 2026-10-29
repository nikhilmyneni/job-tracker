// Tests for the pure parts of web/js (no browser, no network). Run: npm test (Node 18+)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../web/js/core.js';
import { zipStore, unzipFile, docxXmlToText, docxToText, resumeToDocx, resumeDocumentXml, crc32 } from '../web/js/docx.js';
import { parseJsonLoose, activeProviders } from '../web/js/ai.js';

const classify = (subject, from, body) => C.ruleClassify({ subject, from, body });

// ---------- classifier ----------
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
test('channel from sender', () => {
  assert.equal(C.channelFromSender('Naukri <info@naukri.com>'), 'Naukri');
  assert.equal(C.channelFromSender('Acme <jobs@acme.com>'), 'Company site');
});

// ---------- settings ----------
test('settings: defaults', () => {
  const s = C.normalizeSettings(undefined);
  assert.equal(s.onboarded, false);
  assert.equal(s.jobsPerUpdate, 5);
  assert.equal(s.autoUpdateHours, 12);
  assert.equal(s.prefs.paidOnly, true);
  assert.deepEqual(s.ai, []);
});
test('settings: valid kept, invalid replaced, lists cleaned', () => {
  const s = C.normalizeSettings({
    onboarded: true, name: ' Test ', jobsPerUpdate: 10, autoUpdateHours: 7, sinceDays: 60,
    prefs: { roles: ['SOC Analyst', 'soc analyst', '', 5, 'Pentester'], level: 'boss', jobType: 'internship', paidOnly: false, locations: [] },
    ai: [{ provider: 'groq', key: ' k1 ', model: 'm' }, { provider: 'groq', key: 'k2' }, { provider: 'evil', key: 'x' }, { provider: 'gemini', key: '' }],
  });
  assert.equal(s.onboarded, true);
  assert.equal(s.name, 'Test');
  assert.equal(s.jobsPerUpdate, 10);
  assert.equal(s.autoUpdateHours, 12);
  assert.equal(s.sinceDays, 60);
  assert.deepEqual(s.prefs.roles, ['SOC Analyst', 'Pentester']);
  assert.equal(s.prefs.level, 'fresher');
  assert.equal(s.prefs.jobType, 'internship');
  assert.equal(s.prefs.paidOnly, false);
  assert.deepEqual(s.prefs.locations, []);
  assert.deepEqual(s.ai, [{ provider: 'groq', key: 'k1', model: 'm' }]);
});
test('prefsText lists what the scorer needs', () => {
  const s = C.normalizeSettings({ city: 'Hyderabad', prefs: { roles: ['SOC Analyst'], minPay: '3 LPA', avoid: ['Sales'] } });
  const t = C.prefsText(s);
  assert.match(t, /Target roles: SOC Analyst/);
  assert.match(t, /paid only, at least 3 LPA/);
  assert.match(t, /Currently based in: Hyderabad/);
  assert.match(t, /Avoid: Sales/);
});
test('autoUpdateDue', () => {
  const d = C.emptyData();
  const now = new Date('2026-10-29T12:00:00Z');
  assert.equal(C.autoUpdateDue(d, now), false); // not onboarded
  d.settings.onboarded = true;
  assert.equal(C.autoUpdateDue(d, now), true); // never ran
  d.lastRunAt = '2026-10-29T06:00:00Z';
  assert.equal(C.autoUpdateDue(d, now), false); // 6h < 12h
  d.lastRunAt = '2026-10-28T20:00:00Z';
  assert.equal(C.autoUpdateDue(d, now), true);
  d.settings.autoUpdateHours = 0;
  assert.equal(C.autoUpdateDue(d, now), false);
});
test('normalizeData keeps shape', () => {
  const d = C.normalizeData({ applications: [{ a: 1 }, null], seen: [1, 'x'], cvFile: { name: 'x' } });
  assert.equal(d.applications.length, 1);
  assert.deepEqual(d.seen, ['1', 'x']);
  assert.equal(d.cvFile, null);
});

// ---------- Gmail bodies ----------
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
test('decodeBase64Url handles UTF-8', () => {
  assert.equal(C.decodeBase64Url(b64url('Offer – ₹4 LPA ✓')), 'Offer – ₹4 LPA ✓');
});
test('bodyFromPayload prefers text/plain, falls back to stripped html', () => {
  const multi = { mimeType: 'multipart/alternative', parts: [
    { mimeType: 'text/html', body: { data: b64url('<p>Hi</p>') } },
    { mimeType: 'text/plain', body: { data: b64url('Hi plain') } },
  ] };
  assert.equal(C.bodyFromPayload(multi), 'Hi plain');
  const html = { mimeType: 'text/html', body: { data: b64url('<style>x{}</style><p>Dear Test,</p><p>We regret&nbsp;to inform <a href="https://x.io/j">here</a></p>') } };
  assert.equal(C.bodyFromPayload(html), 'Dear Test,\nWe regret to inform here (https://x.io/j)');
  assert.equal(C.headerValue({ headers: [{ name: 'Subject', value: 'S' }] }, 'subject'), 'S');
});

// ---------- applications ----------
test('upsertApplication: new, then advance; furthest never moves back', () => {
  const apps = [], res = C.newResult();
  C.upsertApplication(apps, { company: 'Acme', role: 'SOC Analyst', stage: 'Applied', date: '2026-10-01', channel: 'LinkedIn' }, res);
  C.upsertApplication(apps, { company: 'Acme', role: 'SOC Analyst', stage: 'Interview', date: '2026-10-05', next_step: 'Prepare' }, res);
  C.upsertApplication(apps, { company: 'acme', role: 'soc analyst', stage: 'Rejected', date: '2026-10-09' }, res);
  assert.equal(apps.length, 1);
  assert.equal(apps[0].status, 'Rejected');
  assert.equal(apps[0].furthest, 'Interview');
  assert.equal(apps[0].applied_on, '2026-10-01');
  assert.equal(apps[0].next_step, '');
  assert.equal(res.appsNew, 1);
  assert.equal(res.appsChanged.length, 3);
});
test('upsertApplication: roleless email matches, role fills in later', () => {
  const apps = [], res = C.newResult();
  C.upsertApplication(apps, { company: 'Beta', role: '', stage: 'Applied', date: '2026-10-01' }, res);
  C.upsertApplication(apps, { company: 'Beta', role: 'Intern', stage: 'Screening', date: '2026-10-03' }, res);
  C.upsertApplication(apps, { company: 'Beta', role: '', stage: 'Interview', date: '2026-10-04' }, res);
  assert.equal(apps.length, 1);
  assert.equal(apps[0].key, 'beta|intern');
  assert.equal(apps[0].furthest, 'Interview');
  assert.equal(C.upsertApplication(apps, { company: ' ', stage: 'Applied' }, res), null);
});
test('setApplicationStatus moves furthest only forwards', () => {
  const a = { status: 'Applied', furthest: 'Interview' };
  C.setApplicationStatus(a, 'Screening', '2026-10-29');
  assert.equal(a.furthest, 'Interview');
  C.setApplicationStatus(a, 'Offer', '2026-10-29');
  assert.equal(a.furthest, 'Offer');
  assert.throws(() => C.setApplicationStatus(a, 'Hired', 'x'));
});
test('markGhosted after 21 quiet days, only from Applied', () => {
  const apps = [
    { company: 'Old', status: 'Applied', last_update: '2026-09-01' },
    { company: 'Recent', status: 'Applied', last_update: '2026-10-20' },
    { company: 'Busy', status: 'Interview', last_update: '2026-09-01' },
  ];
  C.markGhosted(apps, new Date('2026-10-29T12:00:00'), C.newResult());
  assert.deepEqual(apps.map(a => a.status), ['Ghosted', 'Applied', 'Interview']);
});
test('expireJobs: same role or roleless application → Applied; past apply-by → Expired', () => {
  const jobs = [
    { company: 'Acme', status: 'New', key: 'acme|soc analyst' },
    { company: 'Acme', status: 'New', key: 'acme|pentester' },
    { company: 'Beta', status: 'New', key: 'beta|intern' },
    { company: 'Gamma', status: 'New', key: 'gamma|analyst', apply_by: '2026-10-01' },
    { company: 'Delta', status: 'Skipped', key: 'delta|analyst', apply_by: '2026-10-01' },
  ];
  C.expireJobs(jobs, [{ key: 'acme|soc analyst' }, { key: 'beta|' }], '2026-10-29');
  assert.deepEqual(jobs.map(j => j.status), ['Applied', 'New', 'Applied', 'Expired', 'Skipped']);
});
test('collectDue and summaryText', () => {
  const res = C.newResult();
  C.collectDue([{ company: 'A', status: 'Interview', next_step: 'Prepare' }, { company: 'B', status: 'Rejected', next_step: 'x' }], res);
  assert.deepEqual(res.due, ['A: Prepare']);
  res.appsChanged.push('Acme: Applied'); res.jobsNew.push('Beta – Intern (fit 4/5)');
  const t = C.summaryText(res);
  assert.match(t, /Application updates:\n- Acme: Applied/);
  assert.match(t, /New recommended jobs:\n- Beta/);
  assert.match(t, /Waiting on you:\n- A: Prepare/);
});

// ---------- jobs ----------
test('newCandidates skips known and duplicate listings', () => {
  const c = C.newCandidates([{ company: 'A', role: 'R' }, { company: 'a ', role: 'r' }, { company: 'B', role: 'X' }, { company: 'C' }],
    [{ key: 'b|x' }], []);
  assert.deepEqual(c.map(x => x.key), ['a|r']);
});
test('pickJobs keeps fit 3+, best first, at most n, validates link and date', () => {
  const cands = [{ company: 'A', role: 'R1', link: 'javascript:alert(1)', key: 'a|r1' }, { company: 'B', role: 'R2', link: 'https://b.io', key: 'b|r2' }, { company: 'C', role: 'R3', key: 'c|r3' }];
  const picks = C.pickJobs([{ n: 0, fit: 4, keep: true, apply_by: 'soon' }, { n: 1, fit: 5, keep: true, apply_by: '2026-11-01' }, { n: 2, fit: 2, keep: true }, { n: 9, fit: 5, keep: true }], cands, 5, '2026-10-29');
  assert.deepEqual(picks.map(p => p.company), ['B', 'A']);
  assert.equal(picks[0].link, 'https://b.io');
  assert.equal(picks[1].link, '');
  assert.equal(picks[1].apply_by, '');
  assert.equal(picks[0].status, 'New');
});
test('scorePrompt carries the preferences', () => {
  const s = C.normalizeSettings({ prefs: { roles: ['Cloud Security'] } });
  assert.match(C.scorePrompt('cv', s, [{ company: 'A', role: 'R' }]), /Target roles: Cloud Security[\s\S]*0\. A — R/);
});

// ---------- resume ----------
const raw = {
  name: ' Test Person ', headline: 'Security Analyst', contact: ['a@example.com', 123, null, { x: 1 }],
  summary: 'Short summary.', photo: 'http://x',
  skills: [{ group: 'Tools', items: ['Nmap', 'Wireshark'] }, { group: 'Empty', items: [] }, 'bad', ...Array(6).fill({ group: 'G', items: ['x'] })],
  experience: [{ title: 'Intern', org: 'Acme', dates: '2025', bullets: ['a', 'b', 'c', 'd', 'e'] }, { bullets: ['no title'] }],
  projects: Array(5).fill({ name: 'P', tech: 'Python', bullets: ['x'] }),
  education: [{ school: 'Example University', degree: 'B.Tech', dates: '2022–2026' }, { degree: 'no school' }],
  certifications: ['CEH', ''], extras: 'not a list',
};
test('cleanResume: no name means no resume', () => {
  assert.equal(C.cleanResume(null), null);
  assert.equal(C.cleanResume({ name: '  ' }), null);
  assert.equal(C.cleanResume('text'), null);
});
test('cleanResume: keeps known fields as strings, drops junk, caps lists', () => {
  const r = C.cleanResume(raw);
  assert.equal(r.name, 'Test Person');
  assert.deepEqual(r.contact, ['a@example.com', '123']);
  assert.equal('photo' in r, false);
  assert.equal(r.skills.length, 4);
  assert.equal(r.experience.length, 1);
  assert.equal(r.experience[0].bullets.length, 4);
  assert.equal(r.projects.length, 3);
  assert.equal(r.education.length, 1);
  assert.deepEqual(r.certifications, ['CEH']);
  assert.deepEqual(r.extras, []);
});
test('resumeBlocks and applyResumeEdits round-trip edits', () => {
  const r = C.cleanResume(raw);
  const blocks = C.resumeBlocks(r);
  assert.equal(blocks[0].t, 'name');
  assert.ok(blocks.some(b => b.t === 'section' && b.text === 'Experience'));
  const edits = blocks.filter(b => b.path).map(b => ({ path: b.path, text: b.label ? b.text : b.text }));
  const same = C.applyResumeEdits(r, edits);
  assert.deepEqual(same, r);
  const changed = C.applyResumeEdits(r, [
    { path: ['name'], text: 'New  Name' },
    { path: ['experience', 0, 'line'], text: 'Analyst, Beta Corp, India' },
    { path: ['experience', 0, 'bullets', 1], text: '' },
    { path: ['skills', 0], text: 'Nmap, Burp' },
    { path: ['contact'], text: 'x@example.com  •  Hyderabad' },
  ]);
  assert.equal(changed.name, 'New Name');
  assert.equal(changed.experience[0].title, 'Analyst');
  assert.equal(changed.experience[0].org, 'Beta Corp, India');
  assert.equal(changed.experience[0].bullets.length, 3);
  assert.deepEqual(changed.skills[0].items, ['Nmap', 'Burp']);
  assert.deepEqual(changed.contact, ['x@example.com', 'Hyderabad']);
});
test('resumeFileBase', () => {
  assert.equal(C.resumeFileBase('Test Person', 'Acme & Co.', 'SOC Analyst (L1)'), 'Test_Person_Resume_Acme_Co_SOC_Analyst_L1');
});

// ---------- dashboard numbers ----------
test('summary, funnel, bySource, weekly', () => {
  const apps = [
    { furthest: 'Applied', status: 'Applied', channel: 'LinkedIn', applied_on: '2026-10-01' },
    { furthest: 'Interview', status: 'Interview', channel: 'LinkedIn', applied_on: '2026-10-02' },
    { furthest: 'Offer', status: 'Offer', channel: 'Naukri', applied_on: '2026-10-20' },
  ];
  assert.deepEqual(C.summary(apps), { total: 3, responses: 2, active: 2, rate: 67, interviews: 2, offers: 1 });
  assert.deepEqual(C.funnel(apps).map(f => f.n), [3, 2, 2, 1]);
  assert.deepEqual(C.bySource(apps).map(r => [r.channel, r.rate]), [['Naukri', 100], ['LinkedIn', 50]]);
  assert.deepEqual(C.weekly(apps), [{ week: '2026-09-28', n: 2 }, { week: '2026-10-05', n: 0 }, { week: '2026-10-12', n: 0 }, { week: '2026-10-19', n: 1 }]);
});

// ---------- docx ----------
test('crc32 known value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
test('zip store then unzip reads the file back', async () => {
  const z = zipStore([{ name: 'a.txt', data: 'hello' }, { name: 'word/document.xml', data: '<x/>' }]);
  assert.equal(new TextDecoder().decode(await unzipFile(z, 'word/document.xml')), '<x/>');
  assert.equal(await unzipFile(z, 'missing'), null);
});
test('unzip reads deflated entries (as Word writes them)', async () => {
  const zlib = await import('node:zlib');
  const body = '<w:document><w:body><w:p><w:r><w:t>Deflated text</w:t></w:r></w:p></w:body></w:document>';
  const z = zipStore([{ name: 'word/document.xml', data: zlib.deflateRawSync(Buffer.from(body)) }]);
  const v = new DataView(z.buffer); v.setUint16(8, 8, true); // local header: method 8
  const cen = z.length - 22 - (46 + 'word/document.xml'.length); v.setUint16(cen + 10, 8, true); // central: method 8
  v.setUint32(cen + 24, body.length, true);
  assert.equal(await docxToText(z), 'Deflated text');
});
test('docxXmlToText keeps paragraphs, bullets, tabs, entities', () => {
  const xml = '<w:document><w:body>' +
    '<w:p><w:r><w:t>Test Person</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">Built a </w:t></w:r><w:r><w:t>SIEM &amp; lab</w:t></w:r></w:p>' +
    '<w:p></w:p><w:p><w:r><w:t>Skills</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>Nmap</w:t></w:r></w:p>' +
    '</w:body></w:document>';
  assert.equal(docxXmlToText(xml), 'Test Person\n• Built a SIEM & lab\n\nSkills\tNmap');
});
test('resume → docx → text round-trip', async () => {
  const r = C.cleanResume(raw);
  const xml = resumeDocumentXml(r);
  assert.match(xml, /<w:pgSz w:w="11906" w:h="16838"\/>/);
  assert.doesNotMatch(xml, /http:\/\/x/);
  const text = await docxToText(resumeToDocx(r));
  assert.match(text, /^Test Person\nSecurity Analyst/);
  assert.match(text, /EXPERIENCE\nIntern, Acme\t2025\n• a/);
  assert.match(text, /Tools: Nmap, Wireshark/);
});

// ---------- ai ----------
test('parseJsonLoose', () => {
  assert.deepEqual(parseJsonLoose('[{"n":1}]'), [{ n: 1 }]);
  assert.deepEqual(parseJsonLoose('Sure!\n```json\n[{"n":2}]\n```'), [{ n: 2 }]);
  assert.deepEqual(parseJsonLoose('{"items":[1,2]}'), [1, 2]);
  assert.deepEqual(parseJsonLoose('{"name":"x","skills":[]}'), { name: 'x', skills: [] });
  assert.equal(parseJsonLoose('no json here'), null);
});
test('activeProviders keeps order and fills default models', () => {
  const s = C.normalizeSettings({ ai: [{ provider: 'groq', key: 'g' }, { provider: 'gemini', key: 'k', model: 'gemini-x' }, { provider: 'openrouter', key: 'o' }] });
  assert.deepEqual(activeProviders(s).map(p => [p.provider, p.model]), [['groq', 'openai/gpt-oss-120b'], ['gemini', 'gemini-x']]);
});
