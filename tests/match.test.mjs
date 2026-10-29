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
