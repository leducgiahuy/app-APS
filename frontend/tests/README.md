# Gantt grid regression

## Searchable task selectors and creation modals

With the frontend dev server running, open `/tests/searchable-select.html`. The page runs automatically and reports `{ "passed": true }` plus the completed checks. It uses local fixtures and makes no backend requests or real data writes.

Checks cover opening the full list, Vietnamese search without accents, STT, phase/group keywords, mouse and keyboard selection, empty results, dynamically added tasks, disabled selectors, scrolling long dropdowns, and scrolling the background of a creation modal. Dropdowns render in a portal to avoid clipping inside forms.

When using a headless browser, keep its temporary user-data directory outside `frontend/` so Vite does not watch browser profile files.

## Project department summary

Open `/tests/project-departments.html` with the frontend dev server running. The automatic fixture checks department/member task counts and effort, approved OT, collapse/expand, department changes and employee deletion. It uses only fake data and makes no backend requests. The JSON result should have `passed: true`.

## Gantt grid

Run the frontend dev server, then open `/tests/gantt-grid.html`.
The result JSON reports assertions and median synchronous React commit times for
the previous day-cell grid and the optimized grid, using the same 40-row fixture.
It also displays both grids for visual comparison. Use `?dark=1` for dark mode.

Checks cover day spacing, calendar width, variable row heights, skipped project
and group rows, separators, theme colors, and unchanged week cell geometry.
The fixture uses no backend data and performs no application writes. Timing is
for the isolated grid, not the entire page or end-to-end interaction latency.

## Vietnamese calendar colors

Open `/tests/gantt-calendar.html` on the frontend dev server. Ten assertions check
holiday alignment, column widths at two zoom scales, background paint order and
bar hit testing. The fixture imports the actual calendar background component;
it uses no backend data. The preview shows April 2027, including Hung Kings Day.
Run `node --test backend/tests/vietnam-calendar.test.js` from the project root for
lunar dates, leap years, 2026/2027 official schedules and holiday/weekend priority.

## Gantt menus and long notes

Open `/tests/gantt-menu-note.html`. Fourteen browser assertions cover portal escape
from clipped containers, upward/downward placement, right edge constraints,
clickable actions, oversized menu scrolling, and multiline notes over 10,000
characters without maxlength or truncation, opening the large editor and saving
the complete edited text through the callback. The fixture performs no backend writes.

## Holiday/Sunday assignment confirmation

Open `/tests/assignment-calendar.html`. Eight browser assertions use the actual
confirmation and segmented Gantt components: interior holiday warning, both
choices, 16h versus 24h, the gap at 24/11/2026, progress over working days and no
warning on ordinary dates. The fixture performs no backend writes. Backend
tests in `assignment-calendar.test.js` cover API persistence and linked task
progress; `hr-shifts.test.js` checks task selection on excluded days.
