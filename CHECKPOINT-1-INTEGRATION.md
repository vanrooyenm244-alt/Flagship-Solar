# Checkpoint 1 integration — Repairs 1–3 on deployed frontend

Implemented locally after Michael explicitly authorized the targeted integration. No deployment, live submission, data migration, historical recalculation, or Repair 4. The original checkpoint's operational safety procedure remains authoritative; this document supersedes its obsolete candidate manifest/cache/hash/status assertions.

## Result and scope

Base: GitHub Pages source commit f987198282d36e4170051e6c2bf73fa22a517e90, successful run #147. Existing deployed HTML outside the Timesheet integration is preserved exactly after excluding the added helper import and replaced timesheetAll helper. This includes calendar/IndexedDB v5, startup/authentication ordering, user activation behaviour, Job Card creation/PDF, cached prices/stock, stock creation, bilingual proposals and navigation. Restored deployed supabase-client.js and xero-customer.js byte-for-byte. Existing concerns in those files were not repaired.

Backend Code.gs retains Repairs 1 and 3; Stock.gs remains unchanged. Version 50 source backups agreed with supplied originals; Version 50 manifest correlation still needs completion.

Service worker: flagship-sc1-v85, retaining deployed assets and xero-customer.js while adding timesheet-sync.js. No cache clearing or IndexedDB downgrade. Deployed source ZIP is not the expired built Pages artifact; served-output and phone checks remain necessary.

## Timesheet read-back integration

The deployed timesheetAll capability now captures account, endpoint, credentials, cycle and load generation. Responses must identify the requested cycle. Account/cycle switches discard late responses. Imports serialize with local saves and use the same transactional account-scoped state as Repair 2; stale cycle versions are ignored. Returned dates are validated and constrained to the requested 25th–24th cycle. Local rows and queued references are never overwritten by read-back, including accepted, edited, failed and deleted-but-held submissions.

Previously unseen Sheet rows are displayed as `on Sheet` (internal state `recorded`), not as acknowledgement of a local submission. They have sent=false and are excluded from enqueue/unsent counts. Editing changes the revision and creates a draft, which must receive its own exact per-row acknowledgement. Removing a recorded row shows the existing warning that the Sheet row remains. Server rows do not trigger retrospective recalculation/writes. Display calculations use the Repair 3 rules; stored historical totals remain untouched.

Read-back intentionally does not refresh an already-local row from a remote edit: without server revisions, replacing it could discard local work or change an acknowledged snapshot. This is a conservative difference from the deployed sent-flag merge and should be checked in staging. No automatic conflict resolution or deletion synchronization was invented. Workers do not call the admin/technician-only timesheetAll operation. Legacy queue data remains held for reconciliation.

## Current changed runtime files

- index.html: deployed-source base plus Repairs 2–3 and safe server read-back.
- timesheet-sync.js: existing Repair 2 engine plus version-guarded server import and recorded-row enqueue exclusion.
- sw.js: deployed shell plus both helpers, fresh cache name.
- supabase-client.js: deployed-source copy, unchanged from archive.
- xero-customer.js: added deployed-source copy, unchanged from archive.
- apps-script/Code.gs: existing Repairs 1 and 3, unchanged during this integration.
- apps-script/Stock.gs: existing unchanged companion.

Existing manifest/assets/icons remain. supabase-config.js remains ignored and untouched. A byte comparison found the local config differs from the deployed archive; no values were disclosed. Staging must intentionally use its own reviewed configuration; production must retain its deployed configuration. Do not upload the local ignored config blindly or run any SQL migration.

Supporting files: tests/worker-tabs.test.cjs, tests/timesheet-sync.test.cjs, tests/timesheet-calculation.test.cjs, tests/checkpoint-integration.test.cjs; BACKEND-INVENTORY.md, apps-script/REPAIR-1.md, REPAIR-2.md, REPAIR-3.md, CHECKPOINT-1-DEPLOYED-COMPARISON.md, STABILISATION-CHECKPOINT-1.md and this document. Tests/docs/backend source are not browser dependencies. Historical audit documents describe their original source baseline; the comparison and integration reports identify the updated scope.

## Verification

- Repair 1: 61 checks passed.
- Repair 2 plus server-read integration: 58 tests passed (49 existing + 9 new).
- Repair 3: 52 tests passed.
- Source-preservation/dependency/database integration: 5 tests passed.
- Total 176 checks passed.
- All root JavaScript (including private config syntax only), .gs and test files parse. Inline application scripts parse in Repair 3 tests. Manifest JSON parses; every shell path exists; git diff --check passes.

Commands:
`node --test tests/checkpoint-integration.test.cjs tests/timesheet-sync.test.cjs tests/timesheet-calculation.test.cjs`
`node tests/worker-tabs.test.cjs`
`git diff --check`

New tests cover source preservation, v5 database opening without downgrade, runtime imports/cache, recorded-vs-accepted semantics, protecting local/queued rows, invalid/wrong-cycle dates, stale versions, account/cycle changes, and in-memory editing during server import. These are isolated mocks/static checks, not real browser/Google acceptance tests.

## Remaining gates

No production/staging execution was performed. Need real installed-browser v5/open/cache tests, original-backend manifest/config correlation, detailed Sheet backup verification and staging scenario runs from the checkpoint. The existing me startup failure distinction, helper global visibility, Supabase adapter duplicate method, cross-device ordering and historical payroll questions were deliberately left as existing concerns, not repaired.

Deployment remains on HOLD pending staging and explicit release authorization. No commits/tags/pushes were made. No reset or overwrite of the user's existing repair work was performed; its Timesheet block and backend safeguards were retained while restoring the confirmed deployed frontend around them.
