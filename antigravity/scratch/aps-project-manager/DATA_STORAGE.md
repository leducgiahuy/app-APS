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
