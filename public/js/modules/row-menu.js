/**
 * Row overflow menus.
 *
 * Table rows offer different actions depending on their state. Rendering all of
 * them inline made the action column change shape from row to row, so each row
 * now shows one labelled primary button plus a "…" that opens the rest here.
 *
 * The menu is a popover: it lives in the top layer, so the horizontally
 * scrolling table wrapper cannot clip it, and Escape and click-outside are
 * handled by the browser. Only the placement is ours — popover anchoring is not
 * portable yet.
 *
 * Markup contract, both inside the same actions cell:
 *   <button class="zr-btn zr-btn--ghost zr-btn--icon" popovertarget="ID"
 *           aria-label="More actions">…</button>
 *   <div id="ID" popover class="zr-menu"> <button class="zr-menu__item">…</button> </div>
 *
 * Attach once per page; it works for rows rendered later because the listener
 * sits on the document.
 */

const GAP = 4;
const EDGE = 8;

/** @returns {boolean} true while any part of the button is on screen */
function isAnchorVisible(anchor) {
  return (
    anchor.right > 0 &&
    anchor.left < window.innerWidth &&
    anchor.bottom > 0 &&
    anchor.top < window.innerHeight
  );
}

function place(menu, button) {
  const anchor = button.getBoundingClientRect();
  const menuBox = menu.getBoundingClientRect();

  // Right-aligned with the button, because the actions column sits at the end
  // of the table and a left-aligned menu would hang off the screen. A button on
  // the other half of the screen is the mirror case: aligning it right would
  // push the menu off the left edge, and the clamp would then park it a few
  // pixels beside its own trigger.
  const nearLeftEdge = anchor.left + anchor.width / 2 < window.innerWidth / 2;
  let left = nearLeftEdge ? anchor.left : anchor.right - menuBox.width;
  left = Math.min(
    Math.max(EDGE, left),
    window.innerWidth - menuBox.width - EDGE
  );

  let top = anchor.bottom + GAP;
  const fitsBelow = top + menuBox.height <= window.innerHeight - EDGE;
  if (!fitsBelow) {
    const above = anchor.top - GAP - menuBox.height;
    top = above >= EDGE ? above : window.innerHeight - menuBox.height - EDGE;
  }

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

export default function rowMenu(root) {
  const scope = root || document;

  // The popover is already open when `toggle` fires, so the box has a size to
  // measure. `beforetoggle` would report zero height.
  function onToggle(event) {
    const menu = event.target;
    if (!menu.classList?.contains('zr-menu')) return;
    if (event.newState !== 'open') return;

    const button = scope.querySelector(
      `[popovertarget="${CSS.escape(menu.id)}"]`
    );
    if (!button) return;

    // The queue tables scroll sideways on a narrow screen, so a button can sit
    // outside the visible area. Clamping the menu into the viewport would then
    // park it somewhere unrelated with nothing tying it to a row; closing is the
    // honest outcome.
    if (!isAnchorVisible(button.getBoundingClientRect())) {
      menu.hidePopover();
      return;
    }

    place(menu, button);
    menu.querySelector('.zr-menu__item')?.focus();
  }

  // An item click always dismisses the menu; the page script does the work via
  // its own delegated handler on the same button.
  function onClick(event) {
    const item = event.target.closest?.('.zr-menu__item');
    if (!item) return;
    item.closest('.zr-menu')?.hidePopover();
  }

  // A menu positioned against a button that has scrolled away would float on
  // its own, so close instead of chasing it.
  function closeOpen() {
    scope
      .querySelectorAll('.zr-menu:popover-open')
      .forEach((menu) => menu.hidePopover());
  }

  document.addEventListener('toggle', onToggle, true);
  document.addEventListener('click', onClick);
  window.addEventListener('resize', closeOpen);
  window.addEventListener('scroll', closeOpen, true);

  return {
    destroy() {
      document.removeEventListener('toggle', onToggle, true);
      document.removeEventListener('click', onClick);
      window.removeEventListener('resize', closeOpen);
      window.removeEventListener('scroll', closeOpen, true);
    },
  };
}
