// Matching: skills vocabulary, the score, the picks, the screen's filters, CV sections (the pure parts of core.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../web/js/core.js';

const cvText = ['Riya Verma', 'SKILLS', 'Python, SQL, Splunk, Wazuh SIEM, Nmap, Wireshark, Burp Suite, Linux', 'PROJECTS', '- Home SOC lab with Wazuh', 'EDUCATION', 'B.Tech CSE 2022-2026'].join('\n');

test('termsIn: aliases count, short names only written exactly', () => {
  assert.deepEqual([...C.termsIn('k8s, golang, VAPT and pentesting; MITRE ATT&CK')].sort(), ['Go', 'Kubernetes', 'MITRE ATT&CK', 'Penetration Testing']);
  assert.deepEqual([...C.termsIn('Python scripting; go to the office; the rest of the team; Windows laptop')], ['Python']);
  assert.deepEqual([...C.termsIn('C, C++ and R')].sort(), ['C', 'C++', 'R']);
  assert.ok(C.termsIn('Knows Ghidra well', ['Ghidra']).has('Ghidra'));
});

test('mySkills: CV skills plus added, minus removed', () => {
  const sk = C.mySkills({ cv: cvText, skillsAdded: ['Ghidra'], skillsRemoved: ['linux'] });
  assert.ok(sk.includes('Splunk') && sk.includes('Ghidra') && !sk.includes('Linux'));
});

test('matchScore: weighted overlap, matched and missing', () => {
  const skills = C.mySkills({ cv: cvText });
  const soc = C.matchScore({ role: 'SOC Analyst L1', details: 'Monitor SIEM alerts in Splunk, incident response, MITRE ATT&CK, Python a plus. Threat hunting.' }, skills, ['Threat Hunting'], ['SOC Analyst']);
  assert.ok(soc.score >= 70, String(soc.score));
  assert.deepEqual(soc.matched.slice(0, 2), ['SOC', 'Threat Hunting']); // title words and your keywords weigh most
  assert.ok(soc.missing.includes('Incident Response') && soc.missing.includes('MITRE ATT&CK'));
  const web = C.matchScore({ role: 'Frontend Developer', details: 'React, TypeScript, CSS, REST APIs' }, skills, [], ['SOC Analyst']);
  assert.equal(web.score, 0); assert.equal(web.matched.length, 0);
  assert.equal(C.matchScore({ role: 'Graduate Trainee', details: 'Join us' }, skills, [], ['SOC Analyst']).score, 30);
  assert.equal(C.matchScore({ role: 'Threat Detection Trainee', details: 'Join us' }, skills, [], ['SOC Analyst']).score, 55); // no skills named; the title fits
});

test('pickByScore: at least minMatch, best first, at most n', () => {
  const data = { cv: cvText, settings: C.normalizeSettings({ prefs: { roles: ['SOC Analyst', 'Security Analyst'] }, minMatch: 40 }) };
  const c = [{ company: 'A', role: 'SOC Analyst', details: 'Splunk SIEM Python', key: 'a|soc analyst', link: 'javascript:x' },
    { company: 'B', role: 'Web Developer', details: 'React CSS', key: 'b|web developer' },
    { company: 'C', role: 'Security Analyst', details: 'Splunk, Nessus, CISSP', key: 'c|security analyst', link: 'https://c.example/j' }];
  const p = C.pickByScore(c, data, 5, '2026-10-30');
  assert.deepEqual(p.map(j => j.company), ['A', 'C']);
  assert.equal(p[0].link, ''); assert.equal(p[1].link, 'https://c.example/j');
  assert.ok(p[0].score >= p[1].score && p[0].matched.includes('Splunk') && p[1].missing.includes('Nessus'));
  assert.equal(C.pickByScore(c, data, 1, '2026-10-30').length, 1);
});

test('filterJobs: score, applied, internships, location', () => {
  const jobs = [{ role: 'SOC Intern', company: 'A', location: 'Pune', score: 80, key: 'a|soc intern', status: 'New' },
    { role: 'SOC Analyst', company: 'B', location: 'Bangalore', score: 60, key: 'b|soc analyst', status: 'New' },
    { role: 'SOC Analyst', company: 'C', location: 'Remote', score: 30, key: 'c|soc analyst', status: 'New' },
    { role: 'Analyst', company: 'D', location: 'Pune', score: 90, key: 'd|analyst', status: 'Applied' }];
  const ids = (v) => C.filterJobs(jobs, v, [{ key: 'b|soc analyst' }]).map(j => j.company).join('');
  assert.equal(ids({ minMatch: 0, internships: true, hideApplied: false }), 'ABCD');
  assert.equal(ids({ minMatch: 0, internships: true, hideApplied: true }), 'AC');
  assert.equal(ids({ minMatch: 50, internships: false, hideApplied: false }), 'BD');
  assert.equal(ids({ minMatch: 0, internships: true, hideApplied: false, location: 'Bengaluru' }), 'B');
  assert.equal(ids({ minMatch: 0, internships: true, hideApplied: false, location: 'Remote' }), 'C');
});

test('cvSections splits under headings', () => {
  const s = C.cvSections(['Riya', 'CAREER OBJECTIVE', 'Seeking a SOC role', 'TECHNICAL SKILLS:', 'Python, SQL', 'PROJECTS', '• Home SOC lab', '- Phishing checker',
    'CERTIFICATIONS', 'CEH', 'EXTRA-CURRICULAR ACTIVITIES', 'CTF club lead'].join('\n'));
  assert.deepEqual(s.summary, ['Seeking a SOC role']);
  assert.deepEqual(s.skills, ['Python, SQL']);
  assert.deepEqual(s.projects, ['Home SOC lab', 'Phishing checker']);
  assert.deepEqual(s.certifications, ['CEH']);
  assert.deepEqual(s.leadership, ['CTF club lead']);
});

test('settings: keywords, minMatch, matchView', () => {
  const s = C.normalizeSettings({ keywords: ['Threat Hunting', 'threat hunting', ''], minMatch: 55, matchView: { location: 'Pune', internships: false } });
  assert.deepEqual(s.keywords, ['Threat Hunting']);
  assert.equal(s.minMatch, 40); // only the offered steps (0, 10 … 90)
  assert.deepEqual(s.matchView, { location: 'Pune', experience: 'fresher', internships: false, hideApplied: true });
});

test('built-in company list: short role words are whole words, US remote and CTO roles are left out', () => {
  const prefs = C.normalizeSettings({ prefs: { roles: ['SOC Analyst'], locations: ['Hyderabad', 'Remote'] } }).prefs;
  const L = (role, location) => ({ id: 'x', role, location });
  assert.equal(C.matchesPrefs(L('SOC Analyst L1', 'Hyderabad'), prefs), true);
  assert.equal(C.matchesPrefs(L('SOC Analysts', 'Hyderabad'), prefs), true);
  assert.equal(C.matchesPrefs(L('Social Media Associate', 'Hyderabad'), prefs), false);
  assert.equal(C.matchesPrefs(L('Security Engineer', 'Remote, Maryland; Remote, Virginia'), Object.assign({}, prefs, { roles: ['Security Engineer'] })), false);
  assert.equal(C.matchesPrefs(L('Technical Leader & CTO, National Security', 'Remote - India'), Object.assign({}, prefs, { roles: ['Security Analyst'] })), false);
  assert.equal(C.searchCompanies(C.normalizeSettings({})).length, C.INDIA_BOARDS.length);
  assert.equal(C.searchCompanies(C.normalizeSettings({ autoCompanies: false })).length, 0);
  C.INDIA_BOARDS.forEach(c => assert.ok(C.normalizeCompany(c), c.name));
});

test('a job with only a title that fits your roles is kept even above its title-only score', () => {
  const data = { settings: C.normalizeSettings({ prefs: { roles: ['Security Analyst'] }, minMatch: 70 }), cv: 'Python, SIEM', skillsAdded: [], skillsRemoved: [] };
  const picked = C.pickByScore([{ id: 'a', role: 'Security Analyst', company: 'Acme', location: 'Hyderabad', details: '' },
    { id: 'b', role: 'Sales Executive', company: 'Acme', location: 'Hyderabad', details: '' }], data, 5, '2026-10-30');
  assert.deepEqual(picked.map(j => j.role), ['Security Analyst']);
});

test('role names match how job boards write titles', () => {
  assert.equal(C.roleFits('Cyber Security Analyst', ['Cybersecurity Analyst'], 'core'), true);
  assert.equal(C.roleFits('Security Operations Center Analyst', ['SOC Analyst'], 'core'), true);
  assert.equal(C.roleFits('VAPT Engineer', ['Penetration Tester'], 'core'), true);
  assert.equal(C.roleFits('Security Analyst', ['Cloud Security'], 'core'), false);
  assert.equal(C.roleFits('Security Engineer', ['Cybersecurity Analyst'], 'related'), true);
});

test('reading a posting: 2+ years, unpaid, fees and bulk invites are caught', () => {
  assert.equal(C.minYears('We need 3+ years of experience in SOC. 0-1 years of experience is fine for interns.'), 0);
  assert.equal(C.minYears('Requires 2-4 years of relevant experience.'), 2);
  assert.equal(C.minYears('Freshers welcome.'), null);
  assert.equal(C.postingProblem('Requires 3+ years of experience with Splunk.'), 'experience');
  assert.equal(C.postingProblem('Unpaid internship, certificate provided.', { paidOnly: true }), 'unpaid');
  assert.equal(C.postingProblem('Unpaid internship, certificate provided.', { paidOnly: false }), '');
  assert.equal(C.postingProblem('Pay a registration fee of Rs 999 to confirm your seat.'), 'fee');
  assert.equal(C.postingProblem('Dear Candidate, you have been shortlisted for our training program.'), 'bulkInvite');
  assert.equal(C.postingProblem('Monitor SIEM alerts. 0-1 years. Stipend ₹20k/month.'), '');
  assert.equal(C.decodeEntities('&lt;p&gt;R&amp;D &#8377;20k&lt;/p&gt;'), '<p>R&D ₹20k</p>');
});

test('Core first: at least half the picks are Core when good Core jobs exist; Stretch only one skill away', () => {
  const data = { settings: C.normalizeSettings({ prefs: { roles: ['SOC Analyst'], roleRange: 'stretch' }, minMatch: 0 }), cv: 'SIEM, Splunk, Python, Linux', skillsAdded: [], skillsRemoved: [] };
  const L = (id, role, details) => ({ id, role, company: 'Acme' + id, location: 'Hyderabad', details, key: id });
  const picked = C.pickByScore([
    L('1', 'SOC Analyst', 'SIEM, Splunk'), L('2', 'Security Engineer', 'Python, Linux, SIEM, Splunk'), L('3', 'Backend Developer', 'Python, Linux, Splunk'),
    L('4', 'Data Engineer', 'Spark, Kafka, Scala, Python'), L('5', 'Security Analyst', 'Python, Linux, SIEM'),
  ], data, 2, '2026-10-30');
  assert.ok(picked.some(j => j.role === 'SOC Analyst')); // Core kept even though others score higher
  assert.equal(C.roleKind('Backend Developer', ['SOC Analyst']), 'Stretch');
  const all = C.pickByScore([L('3', 'Backend Developer', 'Python, Linux, Splunk'), L('4', 'Data Engineer', 'Spark, Kafka, Scala, Python')], data, 5, '2026-10-30');
  assert.deepEqual(all.map(j => j.role), ['Backend Developer']); // Data Engineer is more than one skill away
  const w1 = C.searchWords(['SOC Analyst', 'Penetration Tester'], 100), w2 = C.searchWords(['SOC Analyst', 'Penetration Tester'], 101);
  assert.equal(w1[0], 'SOC Analyst'); assert.equal(w2[0], 'SOC Analyst'); assert.notDeepEqual(w1, w2);
});

test('a posting the board gave no place for must say India or remote in its description', () => {
  assert.equal(C.postingProblem('Únete a nuestro equipo en Madrid. Ciberseguridad.', {}, { location: '' }), 'location');
  assert.equal(C.postingProblem('Join our Hyderabad team. 0-1 years.', {}, { location: '2 Locations' }), '');
  assert.equal(C.postingProblem('Fully remote role.', {}, { location: '' }), '');
  assert.equal(C.postingProblem('Join us in Madrid.', {}, { location: 'Bengaluru' }), ''); // the board's place wins
});

test('sales and calling jobs are left out even when the title mentions security', () => {
  const prefs = C.normalizeSettings({ prefs: { roles: ['Security Analyst'], avoid: [] } }).prefs;
  assert.equal(C.rejectReason({ role: 'Account Executive, Cybersecurity Architecture', location: 'Bengaluru' }, prefs), 'skipList');
  assert.equal(C.rejectReason({ role: 'Security Presales Consultant', location: 'Bengaluru' }, prefs), 'skipList');
  assert.equal(C.rejectReason({ role: 'Security Analyst', location: 'Bengaluru' }, prefs), '');
});

test('match scores are shown as words', () => {
  assert.deepEqual([85, 70, 55, 40, 20].map(s => C.matchLabel(s).label), ['Excellent', 'Good', 'Fair', 'Ambitious', 'Poor']);
  assert.equal(C.matchLabel(80).label, 'Excellent'); assert.equal(C.matchLabel(79).label, 'Good');
});
