// Tests for the parts of Code.gs that don't need Google services.
// Run: npm test   (Node 18+)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

function load() {
  const src = fs.readFileSync(__dirname + '/../src/Code.gs', 'utf8');
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

test('settings parsing', () => {
  const rows = [['Setting', 'Your choice'], ['Daily updates on', true], ['Update time', '9 PM'], ['Mon', true], ['Tue', false], ['Wed', true], ['Thu', true], ['Fri', true], ['Sat', false], ['Sun', false], ['New jobs per day', '10'], ['Email me a summary', true], ['Make tailored resumes', true], ['Search Gmail since', ''], ['Preferred locations', 'Hyderabad'], ['Job preferences', 'fresher'], ['Gemini API key', ' abc '], ['Gemini model', 'gemini-2.5-flash'], ['Last update', '']];
  ctx.fakeSS = { getSheetByName: () => ({ getRange: () => ({ getValues: () => rows }) }) };
  const s = call('readSettings_(fakeSS)');
  assert.equal(s.hour, 21);
  assert.equal(s.days.Tue, false);
  assert.equal(s.days.Wed, true);
  assert.equal(s.jobsPerDay, 10);
  assert.equal(s.geminiKey, 'abc');
});

test('12 AM / 12 PM parsing', () => {
  const mk = (t) => [['Setting', ''], ['Daily updates on', true], ['Update time', t]];
  ctx.fakeSS = { getSheetByName: () => ({ getRange: () => ({ getValues: () => mk('12 PM') }) }) };
  assert.equal(call('readSettings_(fakeSS)').hour, 12);
});

test('expireJobs_ marks Applied only for the same role (or a roleless application)', () => {
  const jobs = [
    ['Found on', 'Fit', 'Company', 'Role', 'Location', 'Pay', 'Why', 'Gap', 'Apply by', 'Apply', 'Resume', 'Status', 'key'],
    ['', 4, 'Acme', 'SOC Analyst', '', '', '', '', '', '', '', 'New', 'acme|soc analyst'],
    ['', 4, 'Acme', 'Pentester', '', '', '', '', '', '', '', 'New', 'acme|pentester'],
    ['', 4, 'Beta', 'Intern', '', '', '', '', '', '', '', 'New', 'beta|intern'],
  ];
  const apps = [
    ['Company', 'Role', 'Channel', 'Applied on', 'Status', 'Furthest stage', 'Last update', 'Next step', 'Email', 'key'],
    ['Acme', 'SOC Analyst', '', '', 'Applied', 'Applied', '', '', '', 'acme|soc analyst'],
    ['Beta', '', '', '', 'Applied', 'Applied', '', '', '', 'beta|'],
  ];
  const set = {};
  ctx.fakeSS = { getSheetByName: (n) => n === 'Applications'
    ? { getDataRange: () => ({ getValues: () => apps }) }
    : { getDataRange: () => ({ getValues: () => jobs }), getRange: (r, c) => ({ setValue: (v) => { set[r + ':' + c] = v; } }) } };
  call('expireJobs_(fakeSS)');
  assert.deepEqual(JSON.parse(JSON.stringify(set)), { '2:12': 'Applied', '4:12': 'Applied' });
});
