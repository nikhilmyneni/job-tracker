// Tests for the resume tailor (web/js/core.js) and the Word export (web/js/docx.js). Made-up data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../web/js/core.js';
import { resumeDocx, docxToText } from '../web/js/docx.js';
import { DEMO_FOLD } from '../web/js/demo.js';

const job = { role: 'SOC Analyst', company: 'Kestrel Systems', jd: 'Monitor SIEM alerts in Splunk and Wazuh, incident response. Python and Linux a plus. Knowledge of MITRE ATT&CK.' };
const cv = 'Test Person\ntest.person@example.com\n\nSkills\nWazuh, Python, Bash, Splunk, Linux, SIEM\n\nProjects\nHome SOC lab | 2025\nBuilt a Wazuh SIEM lab and wrote detection rules.';

test('the rules-based resume keeps the CV facts and nothing else', () => {
  const r = C.resumeFromCv(cv);
  assert.equal(r.contact.fullName, 'Test Person');
  assert.equal(r.contact.email, 'test.person@example.com');
  assert.ok(r.projects.length >= 1 && /SOC lab/.test(r.projects[0].name));
  const text = C.resumeText(r).toLowerCase();
  ['mitre', 'aws', 'kubernetes'].forEach(t => assert.ok(!text.includes(t), t));
});

test('suggestions never add a skill the CV lacks without a warning', () => {
  const s = C.tailorSuggestions(DEMO_FOLD, job, cv);
  const add = s.filter(x => x.kind === 'Add skill');
  assert.ok(add.some(x => /MITRE/.test(x.title)));
  add.forEach(x => assert.match(x.warn, /interview/));
  s.filter(x => x.kind !== 'Add skill').forEach(x => {
    if (x.patch.op === 'addSkill') assert.ok(C.termsIn(cv).has(x.patch.term), x.patch.term);
  });
});

test('accepting edits reorders, marks what changed, and leaves the base alone', () => {
  const before = JSON.stringify(DEMO_FOLD);
  const s = C.tailorSuggestions(DEMO_FOLD, job, cv);
  const order = s.find(x => x.id === 'skills-order');
  const { resume, changed } = C.applySuggestions(DEMO_FOLD, [order, s.find(x => x.id === 'headline')]);
  assert.equal(JSON.stringify(DEMO_FOLD), before);
  assert.ok(changed.has('skills') && changed.has('headline'));
  assert.equal(resume.contact.headline.split(' · ')[0], 'SOC Analyst');
  const first = resume.skills[0].items[0].toLowerCase();
  assert.ok(order.patch.terms.map(t => t.toLowerCase()).includes(first));
});

test('adding a missing skill raises the match score', () => {
  const add = C.tailorSuggestions(DEMO_FOLD, job, cv).find(x => x.id.startsWith('add:'));
  const base = C.tailorScore(DEMO_FOLD, job).score;
  const after = C.tailorScore(C.applySuggestions(DEMO_FOLD, [add]).resume, job).score;
  assert.ok(after > base, `${after} > ${base}`);
});

test('the job description is split into have / missing / plain parts that rebuild the text', () => {
  const have = C.termsIn(cv);
  const parts = C.highlightJd(job.jd, have);
  assert.equal(parts.map(p => p.text).join(''), job.jd);
  assert.ok(parts.some(p => p.kind === 'have' && p.text === 'Splunk'));
  assert.ok(parts.some(p => p.kind === 'miss' && /MITRE/.test(p.text)));
});

test('an AI summary that brings in new skills is refused', () => {
  assert.equal(C.honestRewrite('Security graduate with hands-on Wazuh and Splunk work in a home SIEM lab.', cv).ok, true);
  const bad = C.honestRewrite('Security graduate skilled in Splunk, AWS and Kubernetes.', cv);
  assert.equal(bad.ok, false);
  assert.ok(bad.added.length >= 1);
});

test('ResumeFold file carries the chosen layout; unknown layouts fall back', () => {
  assert.equal(C.resumeFoldFor(DEMO_FOLD, job, job.jd, 'student').meta.template, 'student');
  assert.equal(C.resumeFoldFor(DEMO_FOLD, job, job.jd, 'fancy').meta.template, 'standard');
});

test('LaTeX escapes special characters', () => {
  const r = JSON.parse(JSON.stringify(DEMO_FOLD));
  r.summary = 'R&D at 100% with C# and $5_000 {budget}';
  const tex = C.resumeLatex(r);
  assert.match(tex, /R\\&D at 100\\% with C\\# and \\\$5\\_000 \\\{budget\\\}/);
  assert.match(tex, /\\begin\{document\}[\s\S]*\\end\{document\}/);
});

test('Word export is a real .docx that reads back as the resume', async () => {
  const bytes = resumeDocx(DEMO_FOLD);
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
  const text = await docxToText(bytes);
  assert.match(text, /^Test Person/);
  assert.match(text, /Security Intern/);
  assert.match(text, /Home SOC lab/);
});

test('a pasted job description becomes a saved job; the role falls back to its first short line', () => {
  const jd = 'Junior SOC Analyst\nWe need someone to watch SIEM alerts in Splunk, triage incidents and write clear notes.';
  const j = C.pastedJob({ company: ' Kestrel ', jd }, '2026-10-30');
  assert.equal(j.role, 'Junior SOC Analyst');
  assert.equal(j.company, 'Kestrel');
  assert.equal(j.status, 'Saved');
  assert.equal(j.source, 'Pasted');
  assert.equal(j.jd, jd);
  assert.equal(C.pastedJob({ role: 'SOC Analyst', jd }, '2026-10-30').role, 'SOC Analyst');
  assert.equal(C.pastedJob({ role: 'X', jd: 'too short' }, '2026-10-30'), null);
  assert.equal(C.pastedJob({ jd, link: 'javascript:alert(1)' }, '2026-10-30').link, '');
});

test('ATS score: keywords plus format checks; tailoring raises it', () => {
  const base = C.atsScore(DEMO_FOLD, job, []);
  assert.ok(base.score > 0 && base.score <= 100);
  assert.ok(base.keywords.total >= base.keywords.found);
  assert.equal(base.checks.length, 6);
  assert.ok(base.checks.find(x => /Email and phone/.test(x.text)).ok);
  const sugg = C.tailorSuggestions(DEMO_FOLD, job, cv);
  const better = C.atsScore(C.applySuggestions(DEMO_FOLD, sugg.filter(s => s.id === 'headline' || s.id.startsWith('add:'))).resume, job, []);
  assert.ok(better.score > base.score, `${better.score} > ${base.score}`);
  assert.ok(better.checks.find(x => /job title/.test(x.text)).ok, 'the headline names the role');
});
