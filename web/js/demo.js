/** Made-up sample data for ?demo. No real people, no real emails. */
import { emptyData, normalizeSettings } from './core.js';

export const DEMO_ME = { email: 'demo@example.com', name: 'Test Person', picture: '' };

const RESUME = {
  name: 'Test Person', headline: 'Security Analyst · SIEM, network security, incident triage',
  contact: ['test.person@example.com', '+91 90000 00000', 'Hyderabad', 'linkedin.com/in/example'],
  summary: 'Cyber security graduate with hands-on SIEM and network-monitoring projects. Comfortable with log analysis, Nmap and Wireshark, and writing clear incident notes. Looking for a fresher SOC analyst role.',
  skills: [
    { group: 'Security', items: ['SIEM basics', 'Log analysis', 'Vulnerability scanning', 'Incident triage'] },
    { group: 'Tools', items: ['Nmap', 'Wireshark', 'Burp Suite', 'Wazuh'] },
    { group: 'Languages', items: ['Python', 'Bash', 'SQL'] },
    { group: 'Platforms', items: ['Linux', 'Windows Server', 'AWS (basics)'] },
  ],
  experience: [{ title: 'Security Intern', org: 'Example Labs', dates: 'May–Jul 2025', bullets: ['Reviewed firewall and VPN logs daily and flagged unusual logins to the team lead.', 'Ran weekly Nmap scans on the lab network and tracked open ports in a shared sheet.'] }],
  projects: [
    { name: 'Home SOC lab', tech: 'Wazuh, Sysmon, Kali', dates: '2025', bullets: ['Built a small SIEM lab with three endpoints and wrote detection rules for brute-force logins.', 'Documented each alert with steps to reproduce and respond.'] },
    { name: 'Zero Trust cloud storage', tech: 'Node.js, FastAPI, MongoDB', dates: '2026', bullets: ['Risk-scored each login from IP, device and time; risky logins needed OTP.', 'Added per-device sessions so blocking one device did not log out others.'] },
    { name: 'Phishing URL checker', tech: 'Python, scikit-learn', dates: '2024', bullets: ['Trained a classifier on public URL datasets and wrapped it in a small CLI.'] },
  ],
  education: [{ school: 'Example University', degree: 'B.Tech, Computer Science (Cyber Security)', dates: '2022–2026', details: 'CGPA 8.1/10' }],
  certifications: ['Certified Ethical Hacker (CEH)', 'Google Cybersecurity Certificate'],
  extras: ['Runs the college security club CTF practice sessions'],
};

export function demoData(fresh) {
  const d = emptyData();
  if (fresh) return d; // ?demo=setup shows the wizard
  d.settings = normalizeSettings({
    onboarded: true, name: 'Test Person', city: 'Hyderabad',
    prefs: { roles: ['SOC Analyst', 'Security Analyst', 'Cloud Security'], level: 'fresher', jobType: 'both', paidOnly: true, minPay: '3 LPA', locations: ['Hyderabad', 'Remote', 'Bengaluru'], relocate: true, avoid: ['Sales', 'Telecalling'] },
    ai: [{ provider: 'gemini', key: 'demo-key-1234', model: 'gemini-flash-latest' }],
  });
  const rows = [
    ['Acme Security', 'SOC Analyst', 'LinkedIn', '2026-09-01', 'Interview', 'Interview', 'Prepare for the technical round'],
    ['Beta Labs', 'Security Intern', 'Naukri', '2026-09-03', 'Rejected', 'Screening', ''],
    ['Gamma Tech', '', 'Company site', '2026-09-20', 'Applied', 'Applied', ''],
    ['Delta Bank', 'Cyber Analyst', 'LinkedIn', '2026-10-10', 'Offer', 'Offer', ''],
    ['Epsilon', 'Pentest Intern', 'Naukri', '2026-10-12', 'Ghosted', 'Applied', ''],
    ['Zen Cloud', 'VAPT Trainee', 'Internshala', '2026-10-20', 'Screening', 'Screening', 'Complete the online test'],
    ['Orbit', 'Security Engineer', 'LinkedIn', '2026-10-22', 'Applied', 'Applied', ''],
  ];
  d.applications = rows.map(([company, role, channel, applied_on, status, furthest, next_step], i) => ({
    id: 'a' + i, company, role, channel, applied_on, status, furthest, last_update: applied_on, next_step, email_link: '', key: (company + '|' + role).toLowerCase(),
  }));
  d.jobs = [
    { id: 'j1', found_on: '2026-10-28', fit: 5, company: 'Kestrel Systems', role: 'Security Analyst (Fresher)', location: 'Hyderabad', pay: '₹4–5 LPA', why: 'Your SIEM project and CEH match the SOC duties.', skill_gap: 'Splunk', apply_by: '2026-11-05', link: 'https://example.com/job', details: 'Monitor alerts, triage incidents.', status: 'New', key: 'kestrel systems|security analyst (fresher)', resume: RESUME, resume_at: '2026-10-28T15:00:00Z' },
    { id: 'j2', found_on: '2026-10-28', fit: 4, company: 'Nimbus', role: 'Cloud Security Intern', location: 'Remote', pay: '₹20k/month', why: 'AWS coursework and IAM lab fit.', skill_gap: 'Terraform', apply_by: '', link: 'https://example.com/job2', details: 'IAM reviews, cloud posture checks.', status: 'New', key: 'nimbus|cloud security intern' },
    { id: 'j3', found_on: '2026-10-27', fit: 3, company: 'Pragati Infotech', role: 'Network Security Trainee', location: 'Bengaluru', pay: '', why: 'Networking basics from your degree.', skill_gap: 'Firewall config', apply_by: '', link: '', details: '', status: 'New', key: 'pragati infotech|network security trainee' },
  ];
  d.cv = 'Test Person\ntest.person@example.com · +91 90000 00000 · Hyderabad\n\nEDUCATION\nB.Tech CSE (Cyber Security), Example University, 2022–2026\n\nPROJECTS\nHome SOC lab, Zero Trust cloud storage, Phishing URL checker\n\nSKILLS\nNmap, Wireshark, Burp Suite, Wazuh, Python, Bash, SQL, Linux\n\nCERTIFICATIONS\nCEH, Google Cybersecurity Certificate';
  d.log = [{ at: '2026-10-28T15:00:00Z', msg: 'Update: 2 application updates, 3 new jobs' }];
  d.lastRunAt = '2026-10-28T15:00:00Z';
  return d;
}

export const DEMO_RESUME = RESUME;
