# Third-Party Notices

This repository includes vendored frontend assets under `public/vendor`.

## Vendored Frontend Assets

| Asset                            | Version | License  | Used for                         |
| -------------------------------- | ------- | -------- | -------------------------------- |
| Outfit (outfit-400/700.woff2)    | 1.100   | OFL-1.1  | Brand headings                   |
| sortablejs (Sortable.min.js)     | 1.15.6  | MIT      | Custom field drag ordering       |

The full Outfit license text ships alongside the fonts in
`public/vendor/fonts/outfit/Outfit-OFL.txt`.

Everything else the browser loads — the stylesheet, the icon sprite and the
JavaScript modules — is written in this repository and carries the project
license.

## Removed Assets

The UI framework rewrite dropped the vendored Tailwind runtime, FontAwesome,
Chart.js, DataTables, jQuery, SweetAlert2, Alpine, highlight.js, marked,
jquery-jsonview and Shepherd; the settings tooltips later replaced Tippy and
Popper with a dialog. None of them are shipped any more, and their entries have
been removed from the table above rather than kept as history.

## Backend Dependencies

Node dependencies are declared in `package.json` and pinned in
`package-lock.json`; their licenses are not duplicated here. Run `npm ls` or
consult the lockfile for the current set.

## Maintenance

When vendor assets change, this file must be updated in the same change.
