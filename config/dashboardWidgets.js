/**
 * The dashboard cards, in the order they are rendered when nobody has
 * rearranged anything.
 *
 * Adding a widget is two steps: drop one partial into views/partials/widgets/
 * named after its id, and add one entry here. The route hands this list to
 * views/dashboard.ejs, which includes each partial and passes it its entry, so
 * the span lives here and nowhere else.
 *
 * The display title deliberately stays out of this file: it is already in the
 * partial's .zr-module__title, and the edit tray reads it from the DOM. Two
 * places for one string is one place too many — they drift.
 */
module.exports = [
  { id: 'task-runner', span: 12 },
  { id: 'document-types', span: 4 },
  { id: 'entities', span: 4 },
  { id: 'token-usage', span: 4 },
  { id: 'token-distribution', span: 4 },
  { id: 'language-mix', span: 4 },
  { id: 'processing-status', span: 4 },
];
