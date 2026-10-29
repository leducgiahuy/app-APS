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

## Delivery workflow and role views

Open `/tests/delivery.html?shell` to inspect the compact Gantt workflow with the application shell, or `/tests/delivery.html` for the isolated page. The fixture covers task rows, detail drawer, legal/CR/month tabs, persistent bottom horizontal scrollbar, column presets and role-sensitive controls. It uses a mocked delivery API and does not write live project data.

Open `/tests/delivery-roles.html` to compare employee, leader, manager/accounting and director views. Checks verify that employee/leader responses hide financial fields, “Chỉ việc của tôi” follows the linked employee, role preview is read-only and management controls only appear for permitted roles.

## Executive dashboard

Open `/tests/executive.html`. The fixture checks the six director KPIs, prioritized actions, six-month cash display, project rows and role-based financial masking. Its records are isolated examples and are not imported into `db.json`.

## Operations pages

Open `/tests/operations.html`. The fixture renders Giờ công, Phân quyền and Từ điển with mock operations data. Use it to check tabs, tables, approval flows, the permission picker and editable matrix notes without changing the active database.

## Workforce planning

Open `/tests/workforce-planning.html`. It checks six-month capacity/demand, position and employee views, recruitment stages, temporary plans and additional demand. The fixture does not create employees, tasks or recruitment records in the backend.

## Sidebar animation smoothness

Open `/tests/sidebar-perf.html` with the frontend dev server running. It renders the whole app with a 160-task fake project (no backend requests), opens the project page, toggles the left menu three times each way and records frame times, plus 3 seconds idle. The result lists `maxFrameMs` and `slowFrames` (> 34 ms) per toggle; a smooth result keeps frames near 16 ms with no slow frames after the first toggle. Frame timing needs real time, so run it in a visible or CDP-driven browser rather than with `--virtual-time-budget`.

## My work order across projects

Open `/tests/my-work-order.html`. It checks that tasks from several projects share one timeline ordered by due date (not grouped by project), that same-day tasks sort by project name then task code (A1.2 before A1.10), that tasks without a due date come last, and that completed tasks are hidden. It reports `{ "passed": true }`.

## Permission matrix: pages & sections

Open `/tests/page-access-matrix.html`. It renders the permission matrix with fake data and checks that the five menu pages are the tall header bars, sections sit inside their page, sub-sections nest under their section and collapse / expand (one by one and all at once), the role columns and "Ghi chú" stay, edit cells only offer X / S / —, saving sends the changed cell, and that the old "Quyền thao tác" tab is gone. It reports `{ "passed": true }`.

## Page access applied live

Open `/tests/page-access-live.html`. It renders the whole app with fake data, changes the "Trang & mục" matrix and the signed-in role while the page is open, and checks that the left menu, the Công việc sections and the current page hide / switch immediately: a hidden page leaves the menu, a hidden open section falls back to the first visible one, an all-hidden role sees a notice, a role change to Giám đốc shows Tổng quan, and Admin always sees every page. It reports `{ "passed": true }`.

Headless Edge can stop producing output while Edge updates itself; Chrome (`chrome.exe --headless --dump-dom …`) runs the same fixtures.

## Project picker

Open `/tests/project-picker.html`. It checks the "Dự án đang xem" picker: clicking anywhere on it (including the small label) opens the list, the list is exactly as wide as the picker, the current project is marked, choosing / ↑ ↓ Enter / Esc / clicking outside behave correctly. It reports `{ "passed": true }`.
