// Landing page motion: stagger the sample board, count the match up, and reveal each section's parts once.
document.documentElement.classList.add('js');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('.ui-card').forEach((el, i) => el.style.setProperty('--i', i));

const score = document.querySelector('.ui-match-top b');
if (score && !reduce) {
  const end = parseInt(score.textContent, 10);
  const t0 = performance.now() + 1100;
  const tick = (t) => {
    const k = Math.min(1, Math.max(0, (t - t0) / 900));
    score.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))) + '%';
    if (k < 1) requestAnimationFrame(tick);
  };
  score.textContent = '0%';
  requestAnimationFrame(tick);
}

const groups = ['.how h2, .steps li', '.features > h2', '.feature', '.privacy h2, .privacy-points > div', '.faq h2, .faq details', '.final > *'];
groups.forEach(sel => document.querySelectorAll(sel).forEach((el, i) => { el.dataset.reveal = ''; el.style.setProperty('--i', i % 4); }));
document.querySelectorAll('.feature').forEach(f => f.querySelectorAll('.ui-job, .ui-row, .thumbs figure').forEach((el, i) => { el.dataset.reveal = ''; el.style.setProperty('--i', i + 2); }));
const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => entries.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { rootMargin: '0px 0px -10% 0px' }) : null;
document.querySelectorAll('[data-reveal]').forEach(el => (io ? io.observe(el) : el.classList.add('in')));

// The phone menu closes once you pick a section.
document.querySelectorAll('.menu-list a').forEach(a => a.addEventListener('click', () => a.closest('details').removeAttribute('open')));
