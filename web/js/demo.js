/** Made-up sample data for ?demo. No real people, no real emails. */
import { emptyData, normalizeSettings, matchScore, mySkills } from './core.js';

export const DEMO_ME = { email: 'demo@jobs4you.vercel.app', name: 'Test Person', picture: '' };

/** The sample CV in ResumeFold's format (what the AI would produce from d.cv). */
export const DEMO_FOLD = {
  contact: { fullName: 'Test Person', headline: 'Cyber security graduate', email: 'test.person@jobs4you.vercel.app', phone: '+91 90000 00000', location: 'Hyderabad', website: '', linkedin: '', github: '' },
  summary: 'Cyber security graduate with hands-on SIEM and network-monitoring projects.',
  experience: [{ id: 'exp1', title: 'Security Intern', company: 'Lumen Labs', location: 'Hyderabad', start: '2025-05', end: '2025-07', current: false, bullets: ['Reviewed firewall and VPN logs daily and flagged unusual logins to the team lead.'] }],
  education: [{ id: 'edu1', school: 'Deccan Institute of Technology', degree: 'B.Tech', field: 'Computer Science (Cyber Security)', location: '', start: '2022-08', end: '2026-05', gpa: '8.1/10', details: [] }],
  skills: [{ id: 'skill1', category: 'Tools', items: ['Nmap', 'Wireshark', 'Burp Suite', 'Wazuh'] }, { id: 'skill2', category: 'Languages', items: ['Python', 'Bash', 'SQL'] }],
  projects: [{ id: 'proj1', name: 'Home SOC lab', link: '', tech: 'Wazuh, Sysmon, Kali', start: '2025-01', end: '', bullets: ['Built a small SIEM lab with three endpoints and wrote detection rules for brute-force logins.'] }],
  certifications: [{ id: 'cert1', name: 'Certified Ethical Hacker (CEH)', issuer: 'EC-Council', date: '', link: '' }],
};

export function demoData(fresh) {
  const d = emptyData();
  if (fresh) return d; // ?demo=setup shows the wizard
  d.settings = normalizeSettings({
    onboarded: true, name: 'Test Person', city: 'Hyderabad',
    prefs: { roles: ['SOC Analyst', 'Security Analyst', 'Cloud Security'], level: 'fresher', jobType: 'both', paidOnly: true, minPay: '3 LPA', locations: ['Hyderabad', 'Remote', 'Bengaluru'], relocate: true, avoid: ['Sales', 'Telecalling'] },
    companies: [{ ats: 'greenhouse', slug: 'zscaler', name: 'Zscaler' }, { ats: 'lever', slug: 'cred', name: 'CRED' }],
    keywords: ['Threat Hunting'],
  });
  const rows = [
    ['Kavach Security', 'SOC Analyst', 'LinkedIn', '2026-09-01', 'Interview', 'Interview', 'Prepare for the technical round'],
    ['Beta Labs', 'Security Intern', 'Naukri', '2026-09-03', 'Rejected', 'Screening', ''],
    ['Gamma Tech', '', 'Company site', '2026-09-20', 'Applied', 'Applied', ''],
    ['Delta Bank', 'Cyber Analyst', 'LinkedIn', '2026-10-10', 'Offer', 'Offer', ''],
    ['Epsilon', 'Pentest Intern', 'Naukri', '2026-10-12', 'Ghosted', 'Applied', ''],
    ['Zen Cloud', 'VAPT Trainee', 'Internshala', '2026-10-20', 'Screening', 'Screening', 'Complete the online test'],
    ['Orbit', 'Security Engineer', 'LinkedIn', '2026-10-22', 'Applied', 'Applied', ''],
  ];
  const next = { 'Kavach Security': ['2026-11-03T11:00', 'interview', 'Round 2'], 'Zen Cloud': ['2026-11-06', 'deadline', ''] };
  d.applications = rows.map(([company, role, channel, applied_on, status, furthest, next_step], i) => ({
    id: 'a' + i, company, role, channel, applied_on, status, furthest, last_update: status === 'Applied' ? applied_on : '2026-10-27', next_step, email_link: 'https://mail.google.com/mail/', posting_link: company === 'Orbit' || company === 'Kavach Security' ? 'https://jobs4you.vercel.app/' : '', key: (company + '|' + role).toLowerCase(),
    next_at: (next[company] || [])[0] || '', next_kind: (next[company] || [])[1] || '', round: (next[company] || [])[2] || '',
    history: [{ on: applied_on, status: 'Applied', by: 'email' }].concat(status !== 'Applied' ? [{ on: '2026-10-27', status, by: status === 'Ghosted' ? 'quiet' : 'email' }] : []),
  }));
  d.review = [
    { id: 'r1', from: 'Talent Team <no-reply@talentdesk.in>', subject: 'Your application: next steps', date: '2026-10-26', link: '', company: '', stage: 'Screening' },
    { id: 'r2', from: 'Campus Hiring <campus@northwind.in>', subject: 'Re: Application for Security Intern', date: '2026-10-24', link: '', company: 'Northwind', stage: 'Applied' },
  ];
  const J = (id, found_on, company, role, location, pay, details, source, link = '', posted = '') =>
    ({ id, found_on, posted, company, role, location, pay, details, source, link, status: 'New', key: (company + '|' + role).toLowerCase(), apply_by: '' });
  d.jobs = [
    J('j1', '2026-10-28', 'Kestrel Systems', 'SOC Analyst (Fresher)', 'Hyderabad', '₹4–5 LPA', 'Monitor SIEM alerts in Splunk and Wazuh, triage incidents, incident response, write clear notes. Python and Linux a plus. Knowledge of MITRE ATT&CK.', 'Greenhouse', '', '2026-10-27'),
    J('j2', '2026-10-28', 'Nimbus Cloud', 'Cloud Security Intern', 'Remote', '₹20k/month', 'IAM reviews on AWS, cloud posture checks, Terraform basics, Python scripting.', 'Lever', '', '2026-10-26'),
    J('j3', '2026-10-27', 'Pragati Infotech', 'Network Security Trainee', 'Bengaluru', '', 'Firewall configuration, TCP/IP, VPN, Wireshark captures, CCNA preferred.', 'Naukri'),
    J('j4', '2026-10-29', 'Orion Labs', 'Junior Penetration Tester', 'Pune', '₹5–7 LPA', 'Web application security testing with Burp Suite and OWASP Top 10, Nmap, Metasploit, report writing. OSCP is a plus.', 'Ashby', '', '2026-10-28'),
    J('j5', '2026-10-29', 'Delta Fintech', 'Security Operations Intern', 'Hyderabad', '₹25k/month', 'Assist the SOC with log analysis in Microsoft Sentinel, phishing triage, threat intelligence feeds.', 'SmartRecruiters', '', '2026-10-24'),
    J('j6', '2026-10-26', 'Brightpath', 'GRC Analyst', 'Chennai', '', 'ISO 27001 audits, risk assessment, policy documentation, Excel.', 'Workday'),
  ];
  d.jobs[0].status = 'Saved';
  d.cv = 'Test Person\ntest.person@jobs4you.vercel.app · +91 90000 00000 · Hyderabad\n\nEDUCATION\nB.Tech CSE (Cyber Security), Deccan Institute of Technology, 2022–2026\n\nPROJECTS\nHome SOC lab, Zero Trust cloud storage, Phishing URL checker\n\nSKILLS\nSIEM (Splunk, Wazuh), incident response, log analysis, Nmap, Wireshark, Burp Suite, Metasploit, OWASP Top 10, AWS IAM basics, Python, Bash, SQL, Linux\n\nCERTIFICATIONS\nCEH, Google Cybersecurity Certificate';
  const skills = mySkills(d);
  d.jobs.forEach(j => { const m = matchScore(j, skills, d.settings.keywords, d.settings.prefs.roles, d.settings.prefs.roleRange); Object.assign(j, { score: m.score, fit: Math.max(1, Math.round(m.score / 20)), matched: m.matched, missing: m.missing, skill_gap: m.missing[0] || 'None', why: m.matched.length ? `On your CV: ${m.matched.slice(0, 4).join(', ')}.` : '' }); });
  d.log = [{ at: '2026-10-28T15:00:00Z', msg: 'Update: 2 application updates, 3 new jobs' }];
  d.lastRunAt = '2026-10-28T15:00:00Z';
  return d;
}

