/**
 * Page-level action bar, collapsed into one menu on a phone.
 *
 * A row of bulk actions is fine on a wide screen and far too much on a narrow
 * one: five buttons fill a third of the viewport before the first document is
 * visible. Below the breakpoint they move into a popover behind a single
 * "Actions" button, the same shape the table rows already use.
 *
 * The buttons are moved, not copied. Their ids and their listeners belong to the
 * page script, so a second set would either need duplicate ids or a second round
 * of wiring; moving the elements keeps both intact, including a disabled state
 * or a label the page script swapped mid-request.
 *
 * Markup contract: <div class="zr-btnbar" data-module="toolbar-menu"> holding
 * .zr-btn children, optionally with an empty .zr-grow spacer marking where the
 * separator goes.
 */

import rowMenu from './row-menu.js';

const PHONE = '(max-width: 860px)';

let seq = 0;

/** @returns {string} the menu class matching a button's variant */
function itemClass(button) {
  return button.classList.contains('zr-btn--danger')
    ? 'zr-menu__item zr-menu__item--danger'
    : 'zr-menu__item';
}

export default function toolbarMenu(bar) {
  const order = [...bar.children];
  const buttons = order.filter((el) => el.classList.contains('zr-btn'));
  if (buttons.length < 2) return undefined;

  const original = new Map(buttons.map((b) => [b, b.className]));
  const menuId = `zr-toolbar-menu-${++seq}`;

  const menu = document.createElement('div');
  menu.id = menuId;
  menu.className = 'zr-menu';
  menu.setAttribute('popover', '');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'zr-btn';
  trigger.setAttribute('popovertarget', menuId);
  trigger.innerHTML =
    '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-dots"/></svg><span>Actions</span>';

  let collapsed = false;

  function collapse() {
    if (collapsed) return;
    order.forEach((el) => {
      if (el.classList.contains('zr-btn')) {
        el.className = itemClass(el);
        menu.append(el);
        return;
      }
      // The spacer separates the destructive buttons on a wide screen; in the
      // menu that same break is a rule between the groups.
      if (el.classList.contains('zr-grow') && !el.textContent.trim()) {
        const sep = document.createElement('div');
        sep.className = 'zr-menu__sep';
        sep.dataset.fromSpacer = 'true';
        menu.append(sep);
      }
    });
    bar.append(trigger, menu);
    bar.classList.add('zr-btnbar--collapsed');
    collapsed = true;
  }

  function expand() {
    if (!collapsed) return;
    if (menu.matches(':popover-open')) menu.hidePopover();
    original.forEach((className, button) => {
      button.className = className;
    });
    // Re-appending in the recorded order moves the buttons back out of the menu
    // and restores the row exactly as the template wrote it.
    bar.append(...order);
    trigger.remove();
    menu.remove();
    menu.querySelectorAll('[data-from-spacer]').forEach((el) => el.remove());
    bar.classList.remove('zr-btnbar--collapsed');
    collapsed = false;
  }

  const phone = window.matchMedia(PHONE);
  const apply = () => (phone.matches ? collapse() : expand());
  apply();
  phone.addEventListener('change', apply);

  // Placement, Escape and click-outside come from the row menu behaviour; the
  // scope is this bar, so it only ever answers for its own trigger.
  const placement = rowMenu(bar);

  return {
    destroy() {
      phone.removeEventListener('change', apply);
      expand();
      placement.destroy();
    },
  };
}
