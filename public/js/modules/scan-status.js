/**
 * Live scan module. In the real app this subscribes to the SSE progress stream;
 * here it fakes a run so the states (idle / running / done) can be seen.
 */
export default function scanStatus(el, { toast }) {
  const dot = el.querySelector('[data-el="dot"]');
  const label = el.querySelector('[data-el="label"]');
  const detail = el.querySelector('[data-el="detail"]');
  const fill = el.querySelector('[data-el="fill"]');
  const count = el.querySelector('[data-el="count"]');
  const startBtn = el.querySelector('[data-el="start"]');
  const stopBtn = el.querySelector('[data-el="stop"]');
  const meter = el.querySelector('[data-el="meter"]');

  const docs = [
    'Stadtwerke Muenchen — Jahresabrechnung 2025',
    'Techniker Krankenkasse — Beitragsbescheid',
    'Amazon EU — Rechnung 402-8891233',
    'Finanzamt Hamburg — Steuerbescheid 2024',
    'Telekom — Mobilfunkrechnung Juli',
    'Allianz — Police Hausrat',
  ];

  let timer = null;
  let i = 0;

  function setState(state) {
    el.dataset.scan = state;
    startBtn.hidden = state === 'running';
    stopBtn.hidden = state !== 'running';
    meter.hidden = state !== 'running';
    dot.className =
      'zr-dot ' + (state === 'running' ? 'zr-dot--live' : 'zr-dot--ok');
  }

  function stop(done) {
    clearInterval(timer);
    timer = null;
    setState('idle');
    label.textContent = done ? 'Scan finished' : 'Scan stopped';
    detail.textContent = done
      ? `${i} documents processed just now`
      : 'Waiting for the next run';
    if (done) toast(`Scan finished — ${i} documents processed`, { tone: 'ok' });
    i = 0;
  }

  startBtn.addEventListener('click', () => {
    i = 0;
    setState('running');
    timer = setInterval(() => {
      if (i >= docs.length) return stop(true);
      label.textContent = 'Processing document';
      detail.textContent = docs[i];
      i += 1;
      const pct = Math.round((i / docs.length) * 100);
      fill.style.width = pct + '%';
      count.textContent = `${i} / ${docs.length}`;
    }, 900);
  });

  stopBtn.addEventListener('click', () => stop(false));
  setState('idle');

  return {
    destroy() {
      clearInterval(timer);
    },
  };
}
