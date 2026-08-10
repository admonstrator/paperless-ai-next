/**
 * Setup wizard: keeps the step list, the panel and the footer in sync.
 * Steps marked data-optional get a Skip button; per-step checks (connection
 * test, code confirm) flip their own pill without blocking the rest of the form.
 */
export default function wizard(el) {
  const steps = [...el.querySelectorAll('[data-step]')];
  const panels = [...el.querySelectorAll('[data-panel]')];
  const prev = el.querySelector('[data-el="prev"]');
  const next = el.querySelector('[data-el="next"]');
  const skip = el.querySelector('[data-el="skip"]');
  const fill = el.querySelector('[data-el="fill"]');
  const counter = el.querySelector('[data-el="counter"]');
  const nextLabel = el.querySelector('[data-el="next-label"]');
  const mobileName = el.querySelector('[data-el="mobile-name"]');

  let index = 0;
  const done = new Set();

  function render(scroll) {
    steps.forEach((s, i) => {
      s.dataset.status = i === index ? 'active' : done.has(i) ? 'done' : 'todo';
      s.querySelector('[data-el="marker-text"]').hidden = done.has(i);
      s.querySelector('[data-el="marker-check"]').hidden = !done.has(i);
    });
    panels.forEach((p, i) => {
      p.hidden = i !== index;
    });

    prev.disabled = index === 0;
    skip.hidden = !steps[index].hasAttribute('data-optional');
    counter.textContent = `Step ${index + 1} of ${steps.length}`;
    fill.style.width = Math.round(((index + 1) / steps.length) * 100) + '%';
    nextLabel.textContent =
      index === steps.length - 1 ? 'Finish setup' : 'Continue';
    if (mobileName)
      mobileName.textContent =
        steps[index].querySelector('.zr-step__name').textContent;
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function go(to) {
    if (to < 0 || to >= steps.length) return;
    if (to > index) done.add(index);
    index = to;
    render(true);
  }

  next.addEventListener('click', () => go(index + 1));
  skip.addEventListener('click', () => go(index + 1));
  prev.addEventListener('click', () => go(index - 1));
  steps.forEach((s, i) =>
    s.addEventListener('click', () => {
      if (done.has(i) || i <= index) go(i);
    })
  );

  el.querySelectorAll('[data-check]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pill = el.querySelector(
        `[data-check-state="${btn.dataset.check}"]`
      );
      pill.className = 'zr-badge zr-badge--warn';
      pill.textContent = 'Testing…';
      setTimeout(() => {
        pill.className = 'zr-badge zr-badge--ok';
        pill.textContent = btn.dataset.checkOk || 'Connected';
      }, 900);
    });
  });

  // Segmented controls behave the same everywhere; kept here so the mockup reacts.
  el.querySelectorAll('.zr-segment').forEach((seg) =>
    seg.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      [...seg.children].forEach((b) =>
        b.setAttribute('aria-selected', String(b === btn))
      );
    })
  );

  render(false);
}
