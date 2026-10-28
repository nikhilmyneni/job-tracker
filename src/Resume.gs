// ---------- Tailored resume (written on request, shown and printed in the browser) ----------
/** Asks Gemini for a resume built only from the CV. Nothing is saved to Drive except the data file. */
function writeResume_(data, s, job) {
  const cv = clip_(data.cv, 12000);
  const r = gemini_(s, 'Write a one-page, ATS-friendly resume for this candidate, tailored to the job below.\n' +
    'STRICT HONESTY: use ONLY facts from the CV. Never invent experience, employers, dates, numbers, skills, tools or certifications. ' +
    'Tailor by choosing, ordering and wording true facts toward the job, using the job\'s wording only for things the candidate really has. Leave out date of birth, nationality and photos.\n' +
    'Return JSON: {"name":"","headline":"<target role + 2-3 true focus areas>","contact":["email","phone","city","links"...],' +
    '"summary":"<3-4 lines>","skills":[{"group":"","items":[""]}],' +
    '"experience":[{"title":"","org":"","dates":"","bullets":[""]}],' +
    '"projects":[{"name":"","tech":"","dates":"","bullets":[""]}],' +
    '"education":[{"school":"","degree":"","dates":"","details":""}],' +
    '"certifications":[""],"extras":[""]}. Keep it to one page: at most 4 skill groups, 3 projects with up to 4 bullets each, short bullets. Empty arrays for sections the CV does not support.\n\n' +
    `JOB: ${job.company} — ${job.role} — ${job.location || ''}\n${job.details || ''}\n\nCV:\n${cv}`, true);
  const clean = cleanResume_(r);
  if (!clean) throw new Error('Gemini did not return a resume. Try again.');
  return clean;
}

/** Keeps only the fields the page draws, as plain strings and short arrays. Null when there is no name. */
function cleanResume_(r) {
  if (!r || typeof r !== 'object') return null;
  const str = (v, n) => (v == null || typeof v === 'object' ? '' : String(v).trim()).slice(0, n || 300);
  const list = (v, max, fn) => (Array.isArray(v) ? v : []).map(fn).filter(Boolean).slice(0, max);
  const strs = (v, max, n) => list(v, max, x => str(x, n));
  const name = str(r.name, 80);
  if (!name) return null;
  return {
    name,
    headline: str(r.headline, 160),
    contact: strs(r.contact, 6, 120),
    summary: str(r.summary, 700),
    skills: list(r.skills, 4, g => {
      const items = strs(g && g.items, 14, 40);
      return items.length ? { group: str(g.group, 40), items } : null;
    }),
    experience: list(r.experience, 4, x => x && (x.title || x.org) ? { title: str(x.title, 100), org: str(x.org, 100), dates: str(x.dates, 40), bullets: strs(x.bullets, 4, 260) } : null),
    projects: list(r.projects, 3, x => x && x.name ? { name: str(x.name, 100), tech: str(x.tech, 120), dates: str(x.dates, 40), bullets: strs(x.bullets, 4, 260) } : null),
    education: list(r.education, 3, x => x && x.school ? { school: str(x.school, 120), degree: str(x.degree, 120), dates: str(x.dates, 40), details: str(x.details, 200) } : null),
    certifications: strs(r.certifications, 6, 140),
    extras: strs(r.extras, 4, 200),
  };
}
