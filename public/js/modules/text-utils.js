/**
 * Text helpers shared by the browser modules.
 *
 * Kept deliberately dependency-free so any module can import it without
 * pulling in the rest of a page.
 */

/**
 * Escapes the five characters that can break out of HTML text or an attribute
 * value. Anything interpolated into an innerHTML template goes through here —
 * the incomplete variants this replaced left `'` or `"` intact, which is enough
 * to escape a single-quoted attribute.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
