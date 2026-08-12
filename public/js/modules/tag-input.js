/** Chip input for tag lists. Enter or the add button commits, backspace removes. */
export default function tagInput(el) {
  const input = el.querySelector('input');
  const list = el.querySelector('[data-el="chips"]');
  const addBtn = el.querySelector('[data-el="add"]');

  function add(value) {
    const name = value.trim();
    if (!name) return;
    if ([...list.children].some((c) => c.dataset.value === name)) return;
    const chip = document.createElement('span');
    chip.className = 'zr-chip';
    chip.dataset.value = name;
    chip.innerHTML = `<span></span><button type="button" aria-label="Remove ${name}"><svg class="zr-icon zr-icon--sm"><use href="/icons.svg#i-x"/></svg></button>`;
    chip.firstElementChild.textContent = name;
    chip.querySelector('button').addEventListener('click', () => chip.remove());
    list.append(chip);
    input.value = '';
  }

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      add(input.value);
    }
    if (ev.key === 'Backspace' && !input.value && list.lastElementChild) {
      list.lastElementChild.remove();
    }
  });
  addBtn?.addEventListener('click', () => add(input.value));

  list
    .querySelectorAll('.zr-chip button')
    .forEach((btn) =>
      btn.addEventListener('click', () => btn.closest('.zr-chip').remove())
    );
}
