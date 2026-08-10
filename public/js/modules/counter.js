/** Counts a KPI up from zero once it scrolls into view. */
export default function counter(el) {
  const target = Number(el.dataset.value || 0);
  const suffix = el.dataset.suffix || '';
  const fmt = new Intl.NumberFormat();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const paint = (v) => {
    el.textContent = fmt.format(Math.round(v)) + suffix;
  };

  if (reduced || target === 0) {
    paint(target);
    return;
  }

  const run = () => {
    const dur = 520;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      paint(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        io.disconnect();
        run();
      }
    },
    { rootMargin: '0px 0px -10% 0px' }
  );
  io.observe(el);
}
