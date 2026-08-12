/**
 * Dashboard layout module.
 *
 * Lets the user rearrange the dashboard grid: drag a card by its head to
 * reorder, drag the corner grip to resize. Width snaps to the 12 grid columns
 * the cards already use via data-span, height is free pixels. The result is
 * stored per user through /api/dashboard/layout, so it follows them to another
 * browser.
 *
 * Below 861px the grid is a single column and every card spans the full width,
 * so editing is switched off there rather than storing a layout nobody can see.
 */

const LAYOUT_URL = '/api/dashboard/layout';
const GRID_COLUMNS = 12;
const MIN_SPAN = 3;
// Anything shorter than this hides the card's own head plus a line of content.
const MIN_HEIGHT = 140;
const MAX_HEIGHT = 2000;
const SAVE_DEBOUNCE_MS = 600;
const DESKTOP_QUERY = '(min-width: 861px)';
const REQUEST_TIMEOUT_MS = 15000;

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function dashboardLayout(grid, { toast } = {}) {
  const cards = [...grid.querySelectorAll('[data-widget]')];
  if (cards.length === 0) return undefined;

  const desktop = window.matchMedia(DESKTOP_QUERY);
  // The order and spans the server rendered. Reset means going back to these,
  // and it has to be captured before the stored layout is applied.
  const defaults = cards.map((card) => ({
    card,
    span: Number(card.dataset.span) || GRID_COLUMNS,
  }));

  let saveTimer = 0;
  let sortable = null;
  let resetButton = null;
  // Whether a stored layout exists — the reset control has nothing to offer
  // until the user has actually moved something.
  let hasStoredLayout = false;

  /* --- reading and writing the grid -------------------------------------- */

  function currentLayout() {
    return {
      widgets: [...grid.querySelectorAll('[data-widget]')].map((card) => ({
        id: card.dataset.widget,
        span: Number(card.dataset.span) || GRID_COLUMNS,
        height: Number(card.dataset.userHeight) || 0,
      })),
    };
  }

  function setSpan(card, span) {
    card.dataset.span = String(clamp(span, MIN_SPAN, GRID_COLUMNS));
  }

  function setHeight(card, height) {
    if (!height) {
      delete card.dataset.userHeight;
      card.style.removeProperty('height');
      return;
    }
    const px = clamp(Math.round(height), MIN_HEIGHT, MAX_HEIGHT);
    card.dataset.userHeight = String(px);
    card.style.height = `${px}px`;
  }

  function applyLayout(layout) {
    const widgets = Array.isArray(layout?.widgets) ? layout.widgets : [];
    const known = new Map(cards.map((card) => [card.dataset.widget, card]));

    widgets.forEach((entry) => {
      const card = known.get(entry.id);
      // A stored id the dashboard no longer ships is simply dropped; a card the
      // stored layout predates keeps its markup position at the end.
      if (!card) return;
      setSpan(card, Number(entry.span));
      setHeight(card, Number(entry.height) || 0);
      grid.appendChild(card);
      known.delete(entry.id);
    });
    known.forEach((card) => grid.appendChild(card));

    hasStoredLayout = widgets.length > 0;
    syncResetButton();
  }

  function applyDefaults() {
    defaults.forEach(({ card, span }) => {
      setSpan(card, span);
      setHeight(card, 0);
      grid.appendChild(card);
    });
    hasStoredLayout = false;
    syncResetButton();
  }

  /* --- persistence ------------------------------------------------------- */

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const layout = currentLayout();
      try {
        await fetchJson(LAYOUT_URL, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(layout),
        });
        hasStoredLayout = true;
        syncResetButton();
      } catch (error) {
        console.error('[dashboard-layout] saving failed', error);
        toast?.('Could not save the dashboard layout.', { tone: 'danger' });
      }
    }, SAVE_DEBOUNCE_MS);
  }

  async function reset() {
    clearTimeout(saveTimer);
    applyDefaults();
    try {
      await fetchJson(LAYOUT_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets: [] }),
      });
      toast?.('Dashboard layout reset.', { tone: 'ok' });
    } catch (error) {
      console.error('[dashboard-layout] reset failed', error);
      toast?.('Could not reset the dashboard layout.', { tone: 'danger' });
    }
  }

  /* --- reset control ----------------------------------------------------- */

  function syncResetButton() {
    if (!resetButton) return;
    resetButton.classList.toggle(
      'hidden',
      !hasStoredLayout || !desktop.matches
    );
  }

  function buildResetButton() {
    const bar = document.createElement('div');
    bar.className = 'zr-row zr-layoutbar';
    resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'zr-btn zr-btn--ghost hidden';
    resetButton.innerHTML =
      '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-refresh"/></svg><span>Reset layout</span>';
    resetButton.addEventListener('click', reset);
    bar.appendChild(resetButton);
    grid.parentNode.insertBefore(bar, grid);
  }

  /* --- resizing ---------------------------------------------------------- */

  // One column plus one gap: the distance the pointer travels per grid step.
  function columnStep() {
    const styles = getComputedStyle(grid);
    const gap = Number.parseFloat(styles.columnGap) || 0;
    const width = grid.getBoundingClientRect().width;
    return { gap, step: (width + gap) / GRID_COLUMNS };
  }

  function spanForWidth(width) {
    const { gap, step } = columnStep();
    return clamp(Math.round((width + gap) / step), MIN_SPAN, GRID_COLUMNS);
  }

  function startResize(card, event) {
    if (!desktop.matches) return;
    event.preventDefault();

    const grip = event.currentTarget;
    const rect = card.getBoundingClientRect();
    grip.setPointerCapture(event.pointerId);
    card.classList.add('is-resizing');

    const onMove = (moveEvent) => {
      setSpan(card, spanForWidth(moveEvent.clientX - rect.left));
      setHeight(card, moveEvent.clientY - rect.top);
    };
    const onUp = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      card.classList.remove('is-resizing');
      save();
    };

    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  }

  /* The grip is the keyboard path into everything the mouse can do: arrows
     resize, shift and arrows move the card, delete gives the height back. */
  function onGripKey(card, event) {
    const moving = event.shiftKey;
    const ordered = [...grid.querySelectorAll('[data-widget]')];
    const index = ordered.indexOf(card);
    let handled = true;

    switch (event.key) {
      case 'ArrowRight': {
        const after = ordered[index + 1];
        if (moving) {
          if (after) grid.insertBefore(after, card);
        } else {
          setSpan(card, (Number(card.dataset.span) || GRID_COLUMNS) + 1);
        }
        break;
      }
      case 'ArrowLeft': {
        const before = ordered[index - 1];
        if (moving) {
          if (before) grid.insertBefore(card, before);
        } else {
          setSpan(card, (Number(card.dataset.span) || GRID_COLUMNS) - 1);
        }
        break;
      }
      case 'ArrowDown':
        setHeight(
          card,
          (Number(card.dataset.userHeight) || card.offsetHeight) + 40
        );
        break;
      case 'ArrowUp':
        setHeight(
          card,
          (Number(card.dataset.userHeight) || card.offsetHeight) - 40
        );
        break;
      case 'Backspace':
      case 'Delete':
        setHeight(card, 0);
        break;
      default:
        handled = false;
    }

    if (!handled) return;
    event.preventDefault();
    // Moving the card re-inserts it, which drops the focus — without this the
    // second arrow press would go nowhere.
    event.currentTarget.focus();
    save();
  }

  function addGrip(card) {
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'zr-module__grip';
    grip.setAttribute(
      'aria-label',
      `Resize ${card.querySelector('.zr-module__title')?.textContent?.trim() || 'widget'}: arrow keys resize, shift and arrow keys move, delete restores the height`
    );
    grip.addEventListener('pointerdown', (event) => startResize(card, event));
    // A grip nobody dragged yet should still be able to give the height back.
    grip.addEventListener('dblclick', () => {
      setHeight(card, 0);
      save();
    });
    grip.addEventListener('keydown', (event) => onGripKey(card, event));
    card.appendChild(grip);
  }

  /* --- drag ordering ----------------------------------------------------- */

  function enableSorting() {
    if (sortable || !window.Sortable || !desktop.matches) return;
    sortable = window.Sortable.create(grid, {
      handle: '.zr-module__head',
      draggable: '[data-widget]',
      animation: 150,
      ghostClass: 'is-dragghost',
      chosenClass: 'is-dragging',
      // Buttons live in the head as well, so a click must not start a drag.
      filter: 'button, a, input, select',
      preventOnFilter: false,
      onEnd: save,
    });
    grid.classList.add('is-sortable');
  }

  function disableSorting() {
    if (!sortable) return;
    sortable.destroy();
    sortable = null;
    grid.classList.remove('is-sortable');
  }

  function syncMode() {
    if (desktop.matches) {
      enableSorting();
    } else {
      disableSorting();
    }
    grid.classList.toggle('is-editable', desktop.matches);
    syncResetButton();
  }

  /* --- start ------------------------------------------------------------- */

  buildResetButton();
  cards.forEach(addGrip);
  syncMode();
  desktop.addEventListener('change', syncMode);

  fetchJson(LAYOUT_URL)
    .then((result) => applyLayout(result?.data))
    .catch((error) => {
      // A dashboard that cannot read its layout still works — it just shows the
      // default arrangement.
      console.error('[dashboard-layout] loading failed', error);
    });

  return {
    destroy() {
      clearTimeout(saveTimer);
      disableSorting();
      desktop.removeEventListener('change', syncMode);
    },
  };
}
