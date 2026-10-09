# Database storage

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
