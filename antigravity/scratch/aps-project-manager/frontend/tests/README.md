# Gantt grid regression

Run the frontend dev server, then open `/tests/gantt-grid.html`.
The result JSON reports assertions and median synchronous React commit times for
the previous day-cell grid and the optimized grid, using the same 40-row fixture.
It also displays both grids for visual comparison. Use `?dark=1` for dark mode.

Checks cover day spacing, calendar width, variable row heights, skipped project
and group rows, separators, theme colors, and unchanged week cell geometry.
The fixture uses no backend data and performs no application writes. Timing is
for the isolated grid, not the entire page or end-to-end interaction latency.
