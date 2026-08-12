/** Scroll-spy for the settings section list. */
export default function sectionNav(el) {
  const links = [...el.querySelectorAll('a[href^="#"]')];
  const targets = links
    .map((a) => document.getElementById(a.getAttribute('href').slice(1)))
    .filter(Boolean);
  if (!targets.length) return;

  const visible = new Set();

  function highlight() {
    // Always the topmost section currently inside the reading band, not just
    // whichever one happened to change in this callback.
    const current = targets
      .filter((t) => visible.has(t))
      .sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
      )[0];
    if (!current) return;
    links.forEach((a) =>
      a.setAttribute(
        'aria-current',
        a.getAttribute('href') === '#' + current.id ? 'true' : 'false'
      )
    );
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) =>
        e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)
      );
      highlight();
    },
    { rootMargin: '-56px 0px -55% 0px', threshold: 0 }
  );
  targets.forEach((t) => io.observe(t));

  return {
    destroy() {
      io.disconnect();
    },
  };
}
