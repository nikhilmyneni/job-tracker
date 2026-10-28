// ---------- Tailored resume (Google Doc → PDF in the user's Drive) ----------
function makeResume_(data, s, job) {
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
  if (!r || !r.name) throw new Error('Gemini did not return a resume');

  const doc = DocumentApp.create(`Resume – ${job.company} – ${job.role}`);
  const body = doc.getBody();
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(46).setMarginRight(46);
  const base = {}; base[DocumentApp.Attribute.FONT_FAMILY] = 'Georgia'; base[DocumentApp.Attribute.FONT_SIZE] = 10; base[DocumentApp.Attribute.FOREGROUND_COLOR] = '#111111';
  body.setAttributes(base);
  const para = (text, opts) => {
    const p = body.appendParagraph(text || '');
    p.setSpacingBefore(opts && opts.before || 0).setSpacingAfter(opts && opts.after || 0).setLineSpacing(1.05);
    if (opts && opts.center) p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    if (opts && opts.size) p.editAsText().setFontSize(opts.size);
    if (opts && opts.bold) p.editAsText().setBold(true);
    if (opts && opts.italic) p.editAsText().setItalic(true);
    if (opts && opts.color) p.editAsText().setForegroundColor(opts.color);
    return p;
  };
  const heading = (t) => {
    const p = para(t.toUpperCase(), { before: 9, after: 3, size: 10.5, bold: true });
    p.editAsText().setForegroundColor('#111111');
    body.appendHorizontalRule();
    return p;
  };
  const bullet = (t) => {
    const li = body.appendListItem(t);
    li.setGlyphType(DocumentApp.GlyphType.BULLET).setSpacingAfter(1).setLineSpacing(1.05).setIndentStart(14).setIndentFirstLine(4);
    li.editAsText().setFontSize(10).setBold(false).setItalic(false);
    return li;
  };
  const line = (left, right) => {
    left = String(left || '');
    right = String(right || '');
    const p = para(left + (right ? '   ' + right : ''), { before: 5 });
    const t = p.editAsText();
    if (left) t.setBold(0, left.length - 1, true);
    if (right) t.setItalic(left.length + 3, left.length + 2 + right.length, true).setForegroundColor(left.length + 3, left.length + 2 + right.length, '#555555');
    return p;
  };

  body.getChild(0).asParagraph().setText(r.name);
  const first = body.getChild(0).asParagraph();
  first.setAlignment(DocumentApp.HorizontalAlignment.CENTER).editAsText().setFontSize(20).setBold(false);
  first.setSpacingAfter(2);
  if (r.headline) para(r.headline, { center: true, italic: true, size: 10.5, after: 2 });
  if (r.contact && r.contact.length) para(r.contact.filter(Boolean).join('  •  '), { center: true, size: 9, color: '#444444', after: 4 });
  if (r.summary) { heading('Summary'); para(r.summary, { after: 2 }); }
  if (r.skills && r.skills.length) {
    heading('Skills');
    r.skills.forEach(g => { const grp = String(g.group || ''); const t = `${grp}: ${(g.items || []).join(', ')}`; const p = para(t, { after: 1 }); if (grp) p.editAsText().setBold(0, grp.length, true); });
  }
  if (r.experience && r.experience.length) {
    heading('Experience');
    r.experience.forEach(x => { line(`${x.title}${x.org ? ', ' + x.org : ''}`, x.dates); (x.bullets || []).forEach(bullet); });
  }
  if (r.projects && r.projects.length) {
    heading('Projects');
    r.projects.forEach(x => { line(`${x.name}${x.tech ? ' — ' + x.tech : ''}`, x.dates); (x.bullets || []).forEach(bullet); });
  }
  if (r.education && r.education.length) {
    heading('Education');
    r.education.forEach(x => { line(x.school || '', x.dates); if (x.degree) para(x.degree, { italic: true }); if (x.details) para(x.details); });
  }
  if (r.certifications && r.certifications.length) { heading('Certifications'); r.certifications.forEach(bullet); }
  if (r.extras && r.extras.length) { heading('Activities'); r.extras.forEach(bullet); }
  doc.saveAndClose();

  const folder = folder_();
  const safe = (x) => String(x || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const pdf = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(`${safe(r.name)}_Resume_${safe(job.company)}_${safe(job.role)}.pdf`);
  const file = folder.createFile(pdf);
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return file.getUrl();
}

