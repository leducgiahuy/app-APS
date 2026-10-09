# Gantt grid regression

## Searchable task selectors and creation modals

With the frontend dev server running, open `/tests/searchable-select.html`. The page runs automatically and reports `{ "passed": true }` plus the completed checks. It uses local fixtures and makes no backend requests or real data writes.

Checks cover opening the full list, Vietnamese search without accents, STT, phase/group keywords, mouse and keyboard selection, empty results, dynamically added tasks, disabled selectors, scrolling long dropdowns, and scrolling the background of a creation modal. Dropdowns render in a portal to avoid clipping inside forms.

When using a headless browser, keep its temporary user-data directory outside `frontend/` so Vite does not watch browser profile files.

## Gantt grid

Run the frontend dev server, then open `/tests/gantt-grid.html`.
The result JSON reports assertions and median synchronous React commit times for
the previous day-cell grid and the optimized grid, using the same 40-row fixture.
It also displays both grids for visual comparison. Use `?dark=1` for dark mode.

Checks cover day spacing, calendar width, variable row heights, skipped project
and group rows, separators, theme colors, and unchanged week cell geometry.
The fixture uses no backend data and performs no application writes. Timing is
for the isolated grid, not the entire page or end-to-end interaction latency.
