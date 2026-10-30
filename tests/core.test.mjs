// Tests for the pure parts of web/js (no browser, no network). Run: npm test (Node 18+)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../web/js/core.js';
import { zipStore, unzipFile, docxXmlToText, docxToText, crc32 } from '../web/js/docx.js';
import { parseJsonLoose } from '../web/js/ai.js';

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
  assert.deepEqual(s.schedule, { on: true, days: [0, 1, 2, 3, 4, 5, 6], gmailAt: '07:00', jobsAt: '09:00' });
  assert.equal(s.prefs.roleRange, 'related');
  assert.equal(s.prefs.paidOnly, true);
  assert.equal(s.ai, undefined);
});
test('settings: valid kept, invalid replaced, lists cleaned', () => {
  const s = C.normalizeSettings({
    onboarded: true, name: ' Test ', jobsPerUpdate: 10, sinceDays: 60,
    schedule: { on: true, days: [1, 1, 5, 9, 'x'], gmailAt: '25:00', jobsAt: '18:30' },
    prefs: { roles: ['SOC Analyst', 'soc analyst', '', 5, 'Pentester'], level: 'boss', jobType: 'internship', paidOnly: false, locations: [], roleRange: 'core' },
    ai: [{ provider: 'groq', key: 'old-key' }],
  });
  assert.equal(s.onboarded, true);
  assert.equal(s.name, 'Test');
  assert.equal(s.jobsPerUpdate, 10);
  assert.deepEqual(s.schedule, { on: true, days: [1, 5], gmailAt: '07:00', jobsAt: '18:30' });
  assert.equal(s.prefs.roleRange, 'core');
  assert.equal(s.sinceDays, 60);
  assert.deepEqual(s.prefs.roles, ['SOC Analyst', 'Pentester']);
  assert.equal(s.prefs.level, 'fresher');
  assert.equal(s.prefs.jobType, 'internship');
  assert.equal(s.prefs.paidOnly, false);
  assert.deepEqual(s.prefs.locations, []);
  assert.equal(s.ai, undefined); // saved keys from before are dropped
});
test('prefsText lists what the scorer needs', () => {
  const s = C.normalizeSettings({ city: 'Hyderabad', prefs: { roles: ['SOC Analyst'], minPay: '3 LPA', avoid: ['Sales'] } });
  const t = C.prefsText(s);
  assert.match(t, /Target roles: SOC Analyst/);
  assert.match(t, /paid only, at least 3 LPA/);
  assert.match(t, /Currently based in: Hyderabad/);
  assert.match(t, /Avoid: Sales/);
});
test('settings: older files keep "only when I click" as the schedule switched off', () => {
  assert.equal(C.normalizeSettings({ autoUpdateHours: 0 }).schedule.on, false);
  assert.equal(C.normalizeSettings({ autoUpdateHours: 12 }).schedule.on, true);
});
test('scheduleDue: each part runs once after its time on a chosen day, and catches up on the next open', () => {
  const d = C.emptyData();
  const at = (day, hh, mm = 0) => new Date(2026, 9, day, hh, mm); // local time; 26 Oct 2026 is a Monday
  assert.deepEqual(C.scheduleDue(d, at(29, 12)), { gmail: false, jobs: false }); // not set up yet
  d.settings.onboarded = true;
  assert.deepEqual(C.scheduleDue(d, at(29, 12)), { gmail: true, jobs: true }); // never ran
  d.settings.schedule = { on: true, days: [1, 2, 3, 4, 5], gmailAt: '07:00', jobsAt: '18:00' };
  d.gmailRunAt = at(29, 7, 5).toISOString(); d.jobsRunAt = at(28, 18, 30).toISOString();
  assert.deepEqual(C.scheduleDue(d, at(29, 12)), { gmail: false, jobs: false }); // Thu noon: both done since their times
  assert.deepEqual(C.scheduleDue(d, at(29, 18, 1)), { gmail: false, jobs: true }); // Thu 18:01
  assert.deepEqual(C.scheduleDue(d, at(30, 6, 59)), { gmail: false, jobs: true }); // Fri before 07:00: jobs still owed from Thu
  d.jobsRunAt = at(29, 19).toISOString();
  assert.deepEqual(C.scheduleDue(d, at(31, 10)), { gmail: true, jobs: true }); // Sat: Friday's runs were missed
  d.gmailRunAt = at(30, 8).toISOString(); d.jobsRunAt = at(30, 19).toISOString();
  assert.deepEqual(C.scheduleDue(d, at(31, 10)), { gmail: false, jobs: false }); // Sat isn't a chosen day
  d.settings.schedule.on = false;
  assert.deepEqual(C.scheduleDue(d, at(2 + 31, 10)), { gmail: false, jobs: false }); // off: only Sync now
  d.settings.schedule.on = true; d.settings.jobsPerUpdate = 0;
  assert.equal(C.scheduleDue(d, at(33, 20)).jobs, false); // no new jobs wanted
});
test('role range: core needs every specific word of a role; related takes any, with synonyms', () => {
  const roles = ['Cloud Security'];
  assert.equal(C.roleFits('Cloud Security Intern', roles, 'core'), true);
  assert.equal(C.roleFits('Security Analyst', roles, 'core'), false);
  assert.equal(C.roleFits('Security Analyst', roles, 'related'), true);
  const prefs = C.normalizeSettings({ prefs: { roles, roleRange: 'core', locations: [] } }).prefs;
  assert.equal(C.matchesPrefs({ role: 'Network Security Engineer', location: 'Remote' }, prefs), false);
  assert.equal(C.matchesPrefs({ role: 'Network Security Engineer', location: 'Remote' }, Object.assign({}, prefs, { roleRange: 'related' })), true);
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
// ---------- resume ----------
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
// ---------- ai ----------
test('parseJsonLoose', () => {
  assert.deepEqual(parseJsonLoose('[{"n":1}]'), [{ n: 1 }]);
  assert.deepEqual(parseJsonLoose('Sure!\n```json\n[{"n":2}]\n```'), [{ n: 2 }]);
  assert.deepEqual(parseJsonLoose('{"items":[1,2]}'), [1, 2]);
  assert.deepEqual(parseJsonLoose('{"name":"x","skills":[]}'), { name: 'x', skills: [] });
  assert.equal(parseJsonLoose('no json here'), null);
});

// ---------- job boards ----------
test('parseCareerUrl reads each board and refuses others', () => {
  assert.deepEqual(C.parseCareerUrl('https://jobs.lever.co/cred/abc'), { ats: 'lever', slug: 'cred', name: 'Cred' });
  assert.equal(C.parseCareerUrl('boards.greenhouse.io/zscaler').ats, 'greenhouse');
  assert.equal(C.parseCareerUrl('https://boards.greenhouse.io/embed/job_board?for=groww').slug, 'groww');
  assert.equal(C.parseCareerUrl('https://jobs.ashbyhq.com/sarvam').ats, 'ashby');
  assert.equal(C.parseCareerUrl('https://careers.smartrecruiters.com/Visa').slug, 'Visa');
  assert.equal(C.parseCareerUrl('https://apply.workable.com/huggingface/').ats, 'workable');
  assert.equal(C.parseCareerUrl('https://bunq.recruitee.com/').slug, 'bunq');
  assert.deepEqual(C.parseCareerUrl('nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite'),
    { ats: 'workday', slug: 'nvidia', name: 'Nvidia', host: 'nvidia.wd5.myworkdayjobs.com', site: 'NVIDIAExternalCareerSite' });
  assert.deepEqual(C.parseCareerUrl('https://careers.example.com/jobs'), { unsupported: true, host: 'careers.example.com' });
  assert.equal(C.parseCareerUrl('not a link'), null);
});
test('normalizeSettings keeps valid companies once', () => {
  const s = C.normalizeSettings({ companies: [{ ats: 'lever', slug: 'cred', name: 'CRED' }, { ats: 'lever', slug: 'CRED' }, { ats: 'nope', slug: 'x' }, { ats: 'workday', slug: 'x', host: 'evil.com', site: 'a' }] });
  assert.deepEqual(s.companies, [{ ats: 'lever', slug: 'cred', name: 'CRED' }]);
});
test('listingsFromBoard maps Greenhouse, Lever and Workday', () => {
  const gh = C.listingsFromBoard({ ats: 'greenhouse', slug: 'z', name: 'Z' }, { jobs: [{ id: 7, title: 'SOC Analyst', location: { name: 'Bengaluru' }, absolute_url: 'https://z.example/7' }] });
  assert.equal(gh[0].id, 'ats:greenhouse:z:7'); assert.equal(gh[0].location, 'Bengaluru'); assert.equal(gh[0].source, 'Greenhouse');
  const lv = C.listingsFromBoard({ ats: 'lever', slug: 'c', name: 'C' }, [{ id: 'a', text: 'Security Intern', categories: { location: 'Pune', commitment: 'Intern' }, country: 'IN', hostedUrl: 'https://jobs.lever.co/c/a', workplaceType: 'remote' }]);
  assert.equal(lv[0].location, 'Pune · India'); assert.equal(lv[0].remote, true);
  const wd = C.listingsFromBoard(C.COMPANY_SUGGESTIONS.find(c => c.ats === 'workday'), { jobPostings: [{ title: 'Cyber Analyst', externalPath: '/job/India-Bengaluru/Cyber_JR1', locationsText: '2 Locations' }] });
  assert.equal(wd[0].location, 'India Bengaluru (+1 more)');
  assert.equal(wd[0].link, 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/India-Bengaluru/Cyber_JR1');
});
test('matchesPrefs: role words, seniority, job type, location', () => {
  const p = C.normalizeSettings({ prefs: { roles: ['SOC Analyst', 'Penetration Tester'], level: 'fresher', jobType: 'both', locations: ['Hyderabad', 'Remote'], relocate: false, avoid: ['Sales'] } }).prefs;
  const ok = (role, location, remote) => C.matchesPrefs({ role, location, remote }, p);
  assert.equal(ok('SOC Analyst L1', 'Hyderabad, India'), true);
  assert.equal(ok('Incident Response Associate', 'Hyderabad'), true); // synonym of SOC
  assert.equal(ok('VAPT Engineer', 'Remote - India'), true); // synonym of penetration
  assert.equal(ok('Financial Analyst', 'Hyderabad'), false); // only the generic word matches
  assert.equal(ok('Senior SOC Analyst', 'Hyderabad'), false);
  assert.equal(ok('SOC Analyst', 'Pune'), false); // not a chosen city, not relocating
  assert.equal(ok('SOC Analyst', 'Remote (Canada)'), false);
  assert.equal(ok('SOC Analyst', '3 Locations'), true); // unknown: the AI decides
  assert.equal(ok('Security Sales Specialist', 'Hyderabad'), false); // skip list
  const intern = Object.assign({}, p, { jobType: 'internship', relocate: true });
  assert.equal(C.matchesPrefs({ role: 'SOC Analyst', location: 'Pune' }, intern), false);
  assert.equal(C.matchesPrefs({ role: 'SOC Intern', location: 'Pune' }, intern), true);
});
test('boardCandidates skips seen ones and takes companies in turn', () => {
  const p = C.normalizeSettings({ prefs: { roles: ['Security'], locations: [], relocate: true } }).prefs;
  const L = (co, n) => ({ id: `${co}${n}`, company: co, role: 'Security Analyst', location: 'India' });
  const out = C.boardCandidates([L('A', 1), L('A', 2), L('A', 3), L('B', 1)], p, new Set(['A1']), 3);
  assert.deepEqual(out.map(l => l.id), ['A2', 'B1', 'A3']);
});

// ---------- ResumeFold ----------
test('toYearMonth', () => {
  assert.equal(C.toYearMonth('2021-03'), '2021-03');
  assert.equal(C.toYearMonth('Mar 2021'), '2021-03');
  assert.equal(C.toYearMonth('March, 2021'), '2021-03');
  assert.equal(C.toYearMonth('03/2021'), '2021-03');
  assert.equal(C.toYearMonth('2020'), '2020-01');
  assert.equal(C.toYearMonth('Present'), '');
});
test('cleanResumeFold: schema-safe ids, dates and strings', () => {
  assert.equal(C.cleanResumeFold(null), null);
  assert.equal(C.cleanResumeFold({ summary: 'x' }), null);
  const r = C.cleanResumeFold({
    contact: { fullName: ' Test Person ', email: 'a@example.com', photo: 'x' },
    experience: [{ title: 'Intern', company: 'Example Labs', start: 'May 2025', end: 'Present', bullets: ['Did a', 7, null] }],
    skills: [{ category: 'Tools', items: ['Nmap'] }, { category: 'Empty', items: [] }],
    projects: [{ name: 'Lab', link: 'javascript:alert(1)' }],
    certifications: [{ name: 'CEH', date: '2024' }, { issuer: 'no name' }],
  });
  assert.equal(r.contact.fullName, 'Test Person'); assert.equal(r.contact.photo, undefined);
  assert.deepEqual(r.experience[0], { id: 'exp1', title: 'Intern', company: 'Example Labs', location: '', start: '2025-05', end: '', current: true, bullets: ['Did a', '7'] });
  assert.equal(r.skills.length, 1); assert.equal(r.skills[0].id, 'skill1');
  assert.equal(r.projects[0].link, '');
  assert.deepEqual(r.certifications.map(c => c.date), ['2024-01']);
});
test('resumeFoldFor fills in the job without touching the CV', () => {
  const base = C.cleanResumeFold({ contact: { fullName: 'Test Person' }, education: [{ school: 'Example University' }] });
  const out = C.resumeFoldFor(base, { company: 'Kestrel', role: 'SOC Analyst' }, 'Monitor SIEM alerts.');
  assert.equal(out.meta.analysis.jobDescription, 'Monitor SIEM alerts.');
  assert.equal(out.meta.analysis.company, 'Kestrel');
  assert.equal(out.meta.exportSettings.filename, 'Test_Person_Resume_Kestrel_SOC_Analyst');
  assert.equal(base.meta, undefined);
});
test('textHash changes with the text', () => {
  assert.equal(C.textHash('abc'), C.textHash('abc'));
  assert.notEqual(C.textHash('abc'), C.textHash('abd'));
});

// ---------- step 2: board, next steps, review, CV profile, notifications ----------
test('upsertApplication keeps history, slot and changes', () => {
  const apps = [], r = C.newResult();
  C.upsertApplication(apps, { company: 'Kestrel', role: 'SOC Analyst', stage: 'Applied', date: '2026-10-01' }, r);
  C.upsertApplication(apps, { company: 'Kestrel', role: 'SOC Analyst', stage: 'Interview', date: '2026-10-20', next_at: '2026-11-03T11:00', next_kind: 'interview', round: 'Round 2' }, r);
  assert.deepEqual(apps[0].history.map(x => x.status), ['Applied', 'Interview']);
  assert.equal(apps[0].next_at, '2026-11-03T11:00');
  assert.deepEqual(r.changes[1], { company: 'Kestrel', role: 'SOC Analyst', from: 'Applied', to: 'Interview' });
  C.upsertApplication(apps, { company: 'Kestrel', role: 'SOC Analyst', stage: 'Rejected', date: '2026-11-05' }, r);
  assert.equal(apps[0].next_at, '');
});
test('nextLabel: interview slot, deadlines, ghosted, closed', () => {
  const now = new Date('2026-10-29T10:00:00');
  assert.deepEqual(C.nextLabel({ status: 'Interview', next_at: '2026-11-03T11:00', next_kind: 'interview', round: 'Round 2' }, now), { text: 'Round 2 · Tue 3 Nov, 11:00', tone: 'blue' });
  assert.equal(C.nextLabel({ status: 'Screening', next_at: '2026-10-30', next_kind: 'deadline' }, now).text, 'Due Fri');
  assert.equal(C.nextLabel({ status: 'Screening', next_at: '2026-11-12', next_kind: 'deadline' }, now).text, 'Due 12 Nov');
  assert.equal(C.nextLabel({ status: 'Screening', next_at: '2026-10-29', next_kind: 'deadline' }, now).text, 'Due today');
  assert.deepEqual(C.nextLabel({ status: 'Screening', next_at: '2026-10-20', next_kind: 'deadline' }, now), { text: 'Overdue', tone: 'red' });
  assert.equal(C.nextLabel({ status: 'Ghosted' }, now).text, 'No reply for 21+ days');
  assert.equal(C.nextLabel({ status: 'Offer', next_step: 'Sign' }, now).text, '');
});
test('board columns and timeline', () => {
  assert.equal(C.boardColumn('Ghosted'), 'Applied');
  assert.equal(C.boardColumn('Withdrawn'), 'Rejected');
  assert.equal(C.boardColumn('Screening'), 'Screening');
  const t = C.timeline([{ company: 'A', role: '', applied_on: '2026-10-01', status: 'Offer', last_update: '2026-10-10' }, { company: 'B', history: [{ on: '2026-10-05', status: 'Applied', by: 'email' }] }]);
  assert.deepEqual(t.map(e => `${e.on} ${e.company} ${e.status}`), ['2026-10-10 A Offer', '2026-10-05 B Applied', '2026-10-01 A Applied']);
});
test('addReview dedupes and skips dismissed emails', () => {
  const d = C.emptyData();
  const e = { id: 'm1', from: 'Hiring <hr@northwind.in>', subject: 'Your application', date: new Date('2026-10-24T09:00:00'), link: '' };
  assert.equal(C.addReview(d, e, { stage: 'Applied' }), true);
  assert.equal(C.addReview(d, e), false);
  assert.equal(d.review[0].company, 'Northwind');
  d.reviewDone.push('m2');
  assert.equal(C.addReview(d, Object.assign({}, e, { id: 'm2' })), false);
  assert.deepEqual(C.normalizeData(JSON.parse(JSON.stringify(d))).review.length, 1);
});
test('ruleClassify flags unclear application emails for review', () => {
  assert.equal(classify('Next steps for your candidature', 'no-reply@ats.example', 'please see the portal').needs_review, true);
  assert.equal(classify('Weekly digest', 'news@site.com', 'hello').needs_review, false);
});
test('profileFromCv reads name, city, roles, level and skills', () => {
  const cv = 'Riya Verma\nriya@mail.in · +91 9 · Bangalore\nB.Tech CSE 2022 – 2026 (pursuing)\nHome SOC lab with Wazuh SIEM and Splunk. Web VAPT with Burp Suite, OWASP.\nSkills: Python, SQL, Nmap';
  const p = C.profileFromCv(cv, new Date('2026-10-29'));
  assert.equal(p.name, 'Riya Verma');
  assert.equal(p.city, 'Bengaluru');
  assert.deepEqual(p.roles.slice(0, 2), ['SOC Analyst', 'Penetration Tester']);
  assert.equal(p.level, 'both');
  assert.ok(p.skills.includes('Burp Suite') && p.skills.includes('Python'));
  const d = C.applyCvProfile(C.defaultSettings(), p);
  assert.equal(d.name, 'Riya Verma');
  assert.deepEqual(d.prefs.locations, ['Bengaluru', 'Remote', 'Anywhere in India']);
  const kept = C.defaultSettings(); kept.prefs.roles = ['Data Analyst'];
  assert.deepEqual(C.applyCvProfile(kept, p).prefs.roles, ['Data Analyst']);
});
test('placeMatches searches from the first letter', () => {
  assert.deepEqual(C.placeMatches('h').slice(0, 1), ['Hyderabad']);
  assert.ok(C.placeMatches('ban').includes('Bengaluru'));
  assert.ok(!C.placeMatches('mu', ['Mumbai']).includes('Mumbai'));
  assert.deepEqual(C.placeMatches(''), []);
});

// ---------- stricter CV reading ----------
const prof = (t, hint) => C.profileFromCv(t, new Date('2026-10-29'), { hint });
test('name: ALL CAPS line, "Name | email | phone", after a RESUME title', () => {
  assert.equal(prof('NIKHIL MYNENI\nnikhil@mail.in | +91 98765 43210 | Hyderabad').name, 'Nikhil Myneni');
  assert.equal(prof('Nikhil Myneni | nikhil@mail.in | 9876543210').name, 'Nikhil Myneni');
  assert.equal(prof('RESUME\nCurriculum Vitae\nPriya K. Sharma\nEmail: p@mail.in').name, 'Priya K. Sharma');
});
test('name: letter-spaced headings, split using the email', () => {
  assert.equal(prof('N I K H I L   M Y N E N I\nHyderabad').name, 'Nikhil Myneni');
  assert.equal(prof('K A R T H I K R E D D Y A N U M U L A\nkarthik.anumula@mail.in | Secunderabad').name, 'Karthik Reddy Anumula');
});
test('name: never taken from below the first section heading, or from a skills line', () => {
  const p = prof('SKILLS\nBurp Suite, Metasploit\nPROJECTS\nWeb App VAPT');
  assert.equal(p.name, ''); assert.equal(p.found.name, false);
  assert.equal(prof('C A R E E R O B J E C T I V E\nSeeking a role\nBurp Suite, Nmap').name, '');
});
test('name: the Google account name wins when the CV contains it', () => {
  assert.equal(prof('SAINIKHILMYNENI\ncontact', 'Sai Nikhil Myneni').name, 'Sai Nikhil Myneni');
  assert.equal(prof('Someone Else\nx', 'Sai Nikhil Myneni').name, 'Someone Else');
});
test('roles need real evidence; an objective naming a role counts most', () => {
  assert.deepEqual(prof('A B\nCompleted an audit of the canteen accounts.').roles, []);
  assert.equal(prof('Objective: Penetration Tester internship\nSkills: Python').roles[0], 'Penetration Tester');
});
test('contact details', () => {
  const p = prof('Riya Verma\nriya.v@mail.in · +91 90000 11111 · linkedin.com/in/riya-v · github.com/riyav');
  assert.equal(p.email, 'riya.v@mail.in'); assert.equal(p.phone, '+91 90000 11111');
  assert.equal(p.linkedin, 'linkedin.com/in/riya-v'); assert.equal(p.github, 'github.com/riyav');
});

// ---------- Gmail optional ----------
test('parsePastedEmail reads From/Subject lines, or guesses them', () => {
  const a = C.parsePastedEmail('Subject: Interview invitation\nFrom: Kestrel Careers <careers@kestrel.in>\n\nWe would like to invite you');
  assert.equal(a.subject, 'Interview invitation'); assert.equal(a.from, 'Kestrel Careers <careers@kestrel.in>');
  const b = C.parsePastedEmail('Your application to Nimbus\r\nNimbus Hiring <jobs@nimbus.in>\r\nThank you for applying');
  assert.equal(b.subject, 'Your application to Nimbus'); assert.equal(b.from, 'Nimbus Hiring <jobs@nimbus.in>');
  assert.equal(C.ruleClassify({ subject: b.subject, from: b.from, body: b.body }).company, 'Nimbus');
});
test('gmailRunAt: kept separately; older files count their last run', () => {
  assert.equal(C.normalizeData({ lastRunAt: '2026-10-01T00:00:00Z' }).gmailRunAt, '2026-10-01T00:00:00Z');
  assert.equal(C.normalizeData({ lastRunAt: '2026-10-01T00:00:00Z', gmailRunAt: '' }).gmailRunAt, '');
  assert.equal(C.emptyData().gmailRunAt, '');
});

test('job-site emails are filed under the employer they name, never the job site', () => {
  const li = C.ruleClassify({ from: 'LinkedIn <jobs-noreply@linkedin.com>', subject: 'Test, your application was sent to Acme Robotics', body: 'Your application was sent to Acme Robotics.' });
  assert.equal(li.company, 'Acme Robotics'); assert.equal(li.is_application_update, true);
  const nk = C.ruleClassify({ from: 'Naukri <info@naukri.com>', subject: 'You have successfully applied to SOC Analyst at Orion Labs', body: '' });
  assert.equal(nk.company, 'Orion Labs'); assert.equal(nk.role, 'SOC Analyst'); assert.equal(nk.stage, 'Applied');
  assert.equal(C.jobSiteParts('Your application was sent to Kestrel Systems Pvt Ltd.').company, 'Kestrel Systems');
  assert.equal(C.jobSiteParts('Your application to Pragati Infotech was viewed').company, 'Pragati Infotech');
  const unnamed = C.ruleClassify({ from: 'Indeed <indeedapply@indeed.com>', subject: 'Indeed Application: Cloud Intern', body: 'Your application has been submitted.' });
  assert.equal(unnamed.company, ''); assert.equal(unnamed.needs_review, true); // a look, not an "Indeed" card
});

test('the application search covers Promotions only for job sites and application systems', () => {
  const q = C.appSearch('2026/07/01');
  assert.match(q, /-category:social/);
  assert.match(q, /\(-category:promotions OR \{from:linkedin\.com [^}]*from:myworkday\.com[^}]*\}\)/);
  assert.match(q, /"successfully applied"/);
});

test('an older email, or one from before your own change, never moves an application back', () => {
  const apps = [], r = C.newResult();
  C.upsertApplication(apps, { company: 'Acme', role: 'SOC Analyst', stage: 'Interview', date: '2026-10-20' }, r);
  C.upsertApplication(apps, { company: 'Acme', role: 'SOC Analyst', stage: 'Applied', date: '2026-10-01', link: 'https://mail.google.com/x' }, r);
  assert.equal(apps[0].status, 'Interview');
  assert.equal(apps[0].history.length, 1);
  C.setApplicationStatus(apps[0], 'Rejected', '2026-10-25');
  C.upsertApplication(apps, { company: 'Acme', role: 'SOC Analyst', stage: 'Interview', date: '2026-10-24' }, r);
  assert.equal(apps[0].status, 'Rejected');
  C.upsertApplication(apps, { company: 'Acme', role: 'SOC Analyst', stage: 'Offer', date: '2026-10-28' }, r);
  assert.equal(apps[0].status, 'Offer');
});

test('signup day: the job search runs every 2 hours until a day of matches is in', () => {
  const d = C.emptyData();
  const at = (hh) => new Date(2026, 9, 30, hh, 0);
  Object.assign(d.settings, { onboarded: true, jobsPerUpdate: 3 });
  d.settings.schedule = { on: true, days: [0, 1, 2, 3, 4, 5, 6], gmailAt: '07:00', jobsAt: '09:00' };
  d.startedOn = '2026-10-30'; d.gmailRunAt = at(11).toISOString(); d.jobsRunAt = at(11).toISOString();
  assert.equal(C.scheduleDue(d, at(12)).jobs, false); // an hour after setup
  assert.equal(C.scheduleDue(d, at(13)).jobs, true); // two hours after
  d.jobs = [1, 2, 3].map(i => ({ id: 'j' + i, found_on: '2026-10-30', source: 'Lever' }));
  assert.equal(C.scheduleDue(d, at(13)).jobs, false); // a day's matches are in
  d.jobs = []; d.startedOn = '2026-10-29';
  assert.equal(C.scheduleDue(d, at(13)).jobs, false); // not the signup day
});
