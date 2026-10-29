/** Made-up sample data for ?demo. No real people, no real emails. */
import { emptyData, normalizeSettings } from './core.js';

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
    ai: [{ provider: 'gemini', key: 'demo-key-1234', model: 'gemini-flash-latest' }],
    companies: [{ ats: 'greenhouse', slug: 'zscaler', name: 'Zscaler' }, { ats: 'lever', slug: 'cred', name: 'CRED' }],
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
  d.jobs = [
    { id: 'j1', found_on: '2026-10-28', fit: 5, company: 'Kestrel Systems', role: 'Security Analyst (Fresher)', location: 'Hyderabad', pay: '₹4–5 LPA', why: 'Your SIEM project and CEH match the SOC duties.', skill_gap: 'Splunk', apply_by: '2026-11-05', link: '', details: 'Monitor alerts, triage incidents.', status: 'New', key: 'kestrel systems|security analyst (fresher)', source: 'Greenhouse' },
    { id: 'j2', found_on: '2026-10-28', fit: 4, company: 'Nimbus', role: 'Cloud Security Intern', location: 'Remote', pay: '₹20k/month', why: 'AWS coursework and IAM lab fit.', skill_gap: 'Terraform', apply_by: '', link: '', details: 'IAM reviews, cloud posture checks.', status: 'New', key: 'nimbus|cloud security intern', source: 'Lever' },
    { id: 'j3', found_on: '2026-10-27', fit: 3, company: 'Pragati Infotech', role: 'Network Security Trainee', location: 'Bengaluru', pay: '', why: 'Networking basics from your degree.', skill_gap: 'Firewall config', apply_by: '', link: '', details: '', status: 'New', key: 'pragati infotech|network security trainee', source: 'Job alert email' },
  ];
  d.cv = 'Test Person\ntest.person@jobs4you.vercel.app · +91 90000 00000 · Hyderabad\n\nEDUCATION\nB.Tech CSE (Cyber Security), Deccan Institute of Technology, 2022–2026\n\nPROJECTS\nHome SOC lab, Zero Trust cloud storage, Phishing URL checker\n\nSKILLS\nNmap, Wireshark, Burp Suite, Wazuh, Python, Bash, SQL, Linux\n\nCERTIFICATIONS\nCEH, Google Cybersecurity Certificate';
  d.log = [{ at: '2026-10-28T15:00:00Z', msg: 'Update: 2 application updates, 3 new jobs' }];
  d.lastRunAt = '2026-10-28T15:00:00Z';
  return d;
}

