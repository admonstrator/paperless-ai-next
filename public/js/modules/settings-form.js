/**
 * Tracks unsaved changes across the whole settings form and drives the sticky
 * action bar.
 *
 * Saving itself stays in settings.js, which owns the submit handler and the
 * restart flow — this module only reports state and resets it after a save.
 */
export default function settingsForm(root, { confirmDialog }) {
  const form = root.querySelector('#setupForm');
  const bar = root.querySelector('[data-el="actionbar"]');
  if (!form || !bar) return;

  const status = bar.querySelector('[data-el="status"]');
  const saveBtn = bar.querySelector('[data-el="save"]');
  const resetBtn = bar.querySelector('[data-el="reset"]');
  const restartNote = bar.querySelector('[data-el="restart"]');

  const fields = [...form.querySelectorAll('input, select, textarea')].filter(
    (field) => field.type !== 'hidden'
  );
  const initial = new Map(
    fields.map((field) => [
      field,
      field.type === 'checkbox' ? field.checked : field.value,
    ])
  );

  const valueOf = (field) =>
    field.type === 'checkbox' ? field.checked : field.value;

  function dirtyFields() {
    return fields.filter((field) => initial.get(field) !== valueOf(field));
  }

  // A field needs a restart when its own hint says so — the hints are the single
  // source of truth for that in this form.
  function needsRestart(field) {
    const scope = field.closest('.zr-field, .zr-formgrid, .zr-row');
    return Boolean(scope && /restart required/i.test(scope.textContent || ''));
  }

  function sync() {
    const dirty = dirtyFields();
    bar.dataset.dirty = dirty.length ? 'true' : 'false';
    saveBtn.disabled = dirty.length === 0;
    resetBtn.disabled = dirty.length === 0;
    status.textContent = dirty.length
      ? `${dirty.length} unsaved change${dirty.length > 1 ? 's' : ''}`
      : 'All changes saved';
    restartNote.classList.toggle('hidden', !dirty.some(needsRestart));

    fields.forEach((field) => {
      const row = field.closest('.zr-field');
      if (!row) return;
      row.toggleAttribute('data-dirty', dirty.includes(field));
    });
  }

  form.addEventListener('input', sync);
  form.addEventListener('change', sync);

  resetBtn.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Discard changes?',
      body: 'All unsaved edits on this page are reverted to the values currently in use.',
      confirmLabel: 'Discard',
      tone: 'danger',
    });
    if (!confirmed) return;

    fields.forEach((field) => {
      if (field.type === 'checkbox') field.checked = initial.get(field);
      else field.value = initial.get(field);
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
    sync();
  });

  // settings.js handles the request; once it succeeds the current values become
  // the new baseline.
  form.addEventListener('submit', () => {
    setTimeout(() => {
      fields.forEach((field) => initial.set(field, valueOf(field)));
      sync();
    }, 0);
  });

  sync();
}
