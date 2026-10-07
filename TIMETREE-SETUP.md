# TimeTree → Flagship and Hi Service

Bookings are created and changed in TimeTree. This change adds a one-way mirror to
both apps using their existing shared Google Apps Script project. Hi Service gets
a new Calendar screen; Flagship retains its existing calendar and manual bookings.
Imported bookings open their details and an original TimeTree link. They do not
create job cards, change stock, or write anything to TimeTree.

## Activate the native scheduled connector

1. Back up the current Apps Script source and workbook before deployment. Retain
   the existing Users, Calendar, stock, job-card and timesheet sheets.
2. In the **existing** Apps Script project, replace `Code.gs` with the complete
   `apps-script/Code.gs` in this branch. Add `apps-script/TimeTree.gs` and
   `apps-script/TimeTreeSync.gs`. Keep the existing `Stock.gs` and `HiService.gs`.
   Do not run a setup/reset function or create a replacement workbook.
3. Project Settings → Script Properties: set `TIMETREE_EMAIL` and
   `TIMETREE_PASSWORD` using the TimeTree account. Keep these out of GitHub,
   browser code, logs and screenshots. Script editors can access these properties.
4. The approved business calendar IDs default to `63108444,96534365`.
   Personal calendars are excluded. Override `TIMETREE_ALLOWED_CALENDAR_IDS` only
   after checking the account's calendar IDs.
5. Both business calendars default to both apps. To separate them, set
   `TIMETREE_ROUTES_JSON` to:

   ```json
   {"Scheduling Calender":["Flagship Solar"],"Service and Repair":["Hi Service"]}
   ```

   Routing changes are applied to existing mirror records on the next complete
   run. The frontend of a target that loses access must be refreshed/reloaded.
6. Run `timeTreeSyncScheduled` once and check its result, `TimeTreeEvents`,
   `TimeTreeHistory`, `TimeTreeSourceArchive`, and `TIMETREE_LAST_RUN_STATUS`.
   Authorize the normal Apps Script external-request access using the owner account.
7. Run `installTimeTreeSync` once. It creates a 15-minute timer only if one does
   not already exist. Other project triggers remain untouched.
8. Manage deployments → edit the **existing** web-app deployment → **New version**.
   Keep the current `/exec` URL and existing execution/access settings.
9. Merge/deploy the corresponding frontend changes in both repos. In Admin → Users,
   enable Hi Service's `calendar.view` for accounts with saved explicit grants.
   Role-default grants include calendar viewing; Workers see only bookings whose
   TimeTree attendee name matches their app display name.
10. Verify a known booking in both apps, then change its time/notes in TimeTree and
    wait for the next import. Verify one updated row, a retained prior revision,
    the correct technician, repeating dates and the original TimeTree link.

To pause, disable only the `timeTreeSyncScheduled` timer. Keep mirror/history/archive
sheets. Roll back app code if necessary; do not delete imported or original records.

## Preservation and limits

- Existing manual Calendar rows, stock, timesheets and job cards are never changed
  by the connector. The mirror uses namespaced calendar/event identities.
- Every received event field remains in raw JSON; full calendar metadata/source pages
  are archived in ordered text chunks before the mirror changes. Reconstruct chunks
  by Run ID + Calendar ID, ordered by Part. Unchanged sources do not duplicate archives.
- Every changed normalized revision is appended before the current row changes.
  Retries do not duplicate mirror rows. A failed response never deletes missing rows.
- Explicit TimeTree deactivation marks a booking ARCHIVED; the record stays stored.
- Notes, labels, attendees, source timezone, dates, recurrence rules and attachment
  references are retained. Comments and attachment binaries remain in TimeTree and
  are accessible through the original link; this release does not copy them.
- Recurrences expand for the visible calendar window. Unrecognized recurrence syntax
  is reported for review. Multi-day dates follow TimeTree's inclusive date convention.
- TimeTree's official developer API closed in 2023. This connector uses the unofficial
  authenticated web interface, verified read-only on 7 October 2026. It stops on an
  HTTP/schema/pagination error, preserving previous data. Monitor timer failures.
- A native run reserves four minutes for reading; initial large accounts may need a
  longer-running worker. Monitor Apps Script quotas and workbook cell capacity as
  append-only archives grow. Back up history; do not purge it automatically.
- GitHub changes alone cannot modify the live Apps Script deployment or set secrets.
  A live Google owner/editor session is required to complete activation.

## Optional standalone read-only scraper / import worker

`connector/sync.cjs` requires Node 22+. Install its pinned dependencies using the
package lock. Supply `TIMETREE_EMAIL`, `TIMETREE_PASSWORD`, and an optional private
`TIMETREE_DATA_DIR` outside a public web root. Running `node connector/sync.cjs`
archives the business calendars locally and prepares normalized JSON without writes.

To publish from the worker, set `APPS_SCRIPT_URL` and a random
`TIMETREE_CONNECTOR_TOKEN`. Store only that token's SHA-256 hex digest in the Apps
Script property `TIMETREE_CONNECTOR_TOKEN_SHA256`. Run with `--publish`. Batches
require exact ID acknowledgements. Keep credentials and private archives out of
version control. `--from-snapshot <file>` supports a preserved-source replay.

The native timer is the default deployment path and needs no external worker token.
Excel export can be added to the same source archive in the next phase.

## Verification

- Read-only real login and complete pagination: 7,282 Scheduling Calender records
  plus 214 Service and Repair records, 7,496 unique source identities.
- Full private-data simulation preserved every raw record through the actual
  mirror/history functions; replay created no extra rows. No production sheet writes.
- Mocked native timer verifies archival, unchanged retries, and partial-read failures.
- Hi Service's complete suite and Flagship's complete suite pass. Older test mocks
  were aligned with existing resume/visibility handlers; test servers close idle
  connections so the current Node runtime finishes cleanly.
- Both calendar screens were checked in an isolated browser preview using synthetic
  data. Live Apps Script deployment and cross-device production behavior await activation.
