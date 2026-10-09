# Database storage

## Assignment calendar choices

Each task/Gantt assignee may store `excludeNonWorkingDays`: `true` means omit
Vietnamese holidays and Sundays from this assignment; `false` means include them.
An absent value preserves the old inclusive schedule. Save and restore this flag
along with the assignee date range. Calendar choices are applied again after date
changes; they do not store a hardcoded list of excluded dates.

`calendarAdjusted` marks task/Gantt records whose derived duration and planned
hours were recalculated. The backend normalizes these values on read/write.
Start/end dates remain the envelope, so a 23–25 range can contain two working
days. Existing work-session history is retained.

## Employee code sequence

`employeeCodeSequence` stores the highest issued employee number in the database.
New employees receive `NV-001`, `NV-002`, etc. from the server, independent of
the current employee count or any client-supplied code. Deletion never reduces
this counter. Keep it when backing up/restoring or transferring the database.

On read/write, duplicate, missing and malformed codes are repaired while valid
unique codes and employee IDs remain unchanged. The older duplicate keeps its
code based on `createdAt`, legacy timestamp IDs, or saved array order when no
timestamp exists. Historical creation order/deleted codes cannot be recovered
if the old data did not retain that information. Repairs use numbers above the
existing maximum. New records save `createdAt` for future ordering.

The backend stores live data outside the Git checkout by default:

```text
%LOCALAPPDATA%\APS Project Manager\db.json
```

On the first backend start after upgrading, it copies `backend/data/db.json` to that location if the external file does not exist. It leaves the original file in place during migration. If there is no existing database, it initializes from `backend/data/seed.json`.

Set `APS_DB_PATH` to an absolute file path to choose another location. The parent folder is created automatically. Keep the database file backed up separately from the source checkout.

`backend/data/db.json` is ignored for new Git checkouts. Since Git already tracks this file in existing checkouts, after confirming the external copy exists, remove it from the Git index once:

```powershell
git rm --cached backend/data/db.json
```

Commit that removal so future pulls stop updating the old in-repository copy. Do not run this step before verifying the external database file.

## Employee assignment synchronization (08/10/2026)

`backend/src/utils/employeeAssignments.js` removes references to missing employees from current task and Gantt assignments. `readDb()` repairs and persists old references; `writeDb()` applies the same cleanup to future writes, including employee deletion. Remaining co-assignees are retained, and legacy primary-assignee fields are updated or cleared. Employee IDs take precedence over names so a new employee with the same name does not inherit an old ID's assignments.

Tasks, project dates, progress, historical work sessions and activity logs are retained. The frontend reloads shared data after deleting an employee so Task and Gantt views update together. Restart the backend and reload the page after updating the code; existing stale assignments are repaired on the next database read.

Regression checks: `cd backend` then `npm.cmd test`. Assignment tests use a temporary database and do not modify the live database.
