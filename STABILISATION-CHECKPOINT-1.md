> UPDATED CANDIDATE: Repairs 1–3 have now been reconciled onto deployed-source commit f987198282d36e4170051e6c2bf73fa22a517e90 with explicit user authorization. See CHECKPOINT-1-INTEGRATION.md for the current manifest, verification and limitations. Cache is now flagship-sc1-v85 and IndexedDB remains version 5. The historical v46 hashes, 13-file manifest and Git status below describe the earlier candidate and MUST NOT be used as current release identifiers. The backup/staging/deployment safety procedure still applies. No deployment has occurred.

# STABILISATION CHECKPOINT 1

Date: 2026-09-23. Scope: Repairs 1–3 only. Status: locally verified release candidate; NOT deployed, committed or tagged. Staging and device verification are required before production release. This checkpoint adds documentation only, no fixes.

## Combined review

- Repair 1 remains intact: normalized reserved names derive from SHEETS plus Summary, Sheet1 and Stock; preflight protects batch writes, worker creation, time repair and worker-tab creation. Rebuilding independently validates destinations before clearing. Existing ambiguous/unowned tabs fail closed. Tests cover case, whitespace, sanitization, ownership and unrelated tabs.
- Repair 2 remains intact: immutable account/endpoint/revision snapshots; exact per-row acknowledgement matching; only accepted queue entries removed; failed/rejected entries retained; transactional writes; concurrent-drain protection; stale-edit and cycle isolation. The helper contains no payroll calculation. No credentials are stored in its queue.
- Repair 3 cores are textually identical; parity and interval tests pass. Starting-day classification and excess-weekday-lunch review implement Michael's decisions. Missing lunch never becomes an implicit backend default.
- Compared index.html with Git HEAD: all content outside the Timesheet block is identical after normalizing line endings and removing the one new helper import. Reviewed Code.gs against the supplied production attachment: changes are worker-destination guards, calculator and skipped-row reason only. Stock.gs is byte-identical to its attachment. Other business modules, Supabase migration/client, authentication and Xero code are unchanged.
- sw.js changes only cache v44 -> v46 and inclusion of timesheet-sync.js. Every shell path exists. The helper loads before the application script. No test/docs/Node dependencies are loaded by production.
- No introduced live credentials found by diff review and common private-key/token-pattern scan. Test passwords are synthetic. This was a heuristic scan, not a dedicated comprehensive secret scanner. Existing ignored supabase-config.js is not part of this checkpoint; preserve the deployment's existing configuration privately. Existing session credential handling and backend Script Properties are unchanged.
- No package.json, configured lint/typecheck/build pipeline exists. Ran all available repair tests, git diff --check, JavaScript parser checks for all repository HTML inline scripts, root JS except private deployment config, both .gs files and all tests (15 script units), plus manifest JSON parsing. All passed. Private deployment config was not inspected or copied.

## Verification results

Commands: `node --test tests/timesheet-calculation.test.cjs tests/timesheet-sync.test.cjs` (101 pass: 52 Repair 3 + 49 Repair 2); `node tests/worker-tabs.test.cjs` (61 pass); `git diff --check` (pass, only Git CRLF conversion notices). Total: 162 passing checks. Parser, shell-path, scope and credential-pattern checks ran locally using Node. No Google services were called by tests.

Repair 2's old assertion freezing the defective calculator was intentionally superseded by Repair 3 equivalence checks; its remaining behavioral tests still run. REPAIR-1.md and REPAIR-2.md describe their historical stages; this checkpoint supersedes their earlier calculation/cache/deployment statements. README's old six-file/v13 deployment instructions are not the release manifest.

## Exact checkpoint manifest

Production changes:
- index.html (modified frontend)
- timesheet-sync.js (new, mandatory runtime helper)
- sw.js (modified, flagship-v46)
- apps-script/Code.gs (new repository copy of supplied backend, with Repairs 1 and 3)

Backend companion, included for reproducibility: apps-script/Stock.gs (new repository file; unchanged deployed source). Keep the deployed companion and all other existing project files/configuration; do not create a duplicate Stock implementation.

Verification/documentation included:
- tests/worker-tabs.test.cjs
- tests/timesheet-sync.test.cjs
- tests/timesheet-calculation.test.cjs
- apps-script/REPAIR-1.md
- REPAIR-2.md
- REPAIR-3.md
- BACKEND-INVENTORY.md
- STABILISATION-CHECKPOINT-1.md (this file)

These 13 files constitute the checkpoint. Tests, backend source and audit documents are not frontend runtime dependencies and need not be published to the static site. Existing supabase-client.js, manifest.webmanifest, icons, assets and production configuration must remain available. No SQL migration is part of this release. All new files are present on disk but remain untracked until a later authorized release/commit process includes them.

SHA-256 of runtime source bytes reviewed (line-ending conversion changes these hashes):

| File | SHA-256 |
| --- | --- |
| index.html | 04cf176c5ddecbb51e15771ee895f1dff257947743cf13799d82f1fc63e77c3f |
| sw.js | 4ec24bc0602a0bcf58268c708d9d0313d0e59532f6377d1cde94450ae93b7d70 |
| timesheet-sync.js | 026a06925922df304a5a96311266a9dbe801cfc74a6860ee93937a10c176d20e |
| apps-script/Code.gs | 356ccdf0521b9d9c443ec5d4db43a9b0029fc68dd2a966c733ed666f2256aef9 |
| apps-script/Stock.gs | e258243df6df12c72473383fbda56764bc736121cb6c0b868dd6e8ddbd0c30bd |

## SAFE TO TEST IN PRODUCTION

After backups and successful staging, with submissions paused:
- Valid login, reopen/refresh and role/menu checks using existing authorized accounts. Login writes its normal last-login timestamp/Log entry; it is not entirely read-only.
- Read-only comparison of Sheet data, served file versions, network responses and installed service-worker/cache status. Open Timesheets only on a reconciled account/device with no queued submissions: opening or reconnecting can auto-drain queued rows.
- A single real, approved current-cycle employee entry may be the final production acceptance check ONLY after confirming no existing worker+date row, recording the intended values, and coordinating all other writers. Use actual work, not fabricated payroll data. Submitting rebuilds derived worker tabs and Summary; staging must have established these tabs are safe. If this cannot be arranged, perform all write checks exclusively on staging.

## MUST TEST ON A COPY/STAGING ENVIRONMENT

All synthetic shifts, accepted/rejected/mixed batches, authorization failures, invalid credentials, simulated outages, concurrent tabs, stale revisions, different users, offline replay, legacy imports, collision cases and rollback rehearsal. Use a separate frontend origin/browser profile with its own storage and a separate script bound to the copied Sheet. Never point a production phone's existing queue at staging or change its endpoint to perform tests.

## DO NOT TEST AGAINST LIVE DATA

Never submit Users/users/USERS or any system-tab name as a worker; never seed collision rows into live Timesheets. Do not test deletes/clears/renames, setup/setupStock, repair-time commands, deliberate request loss/retries, old-cycle edits, whole-cycle fill/send, fake payroll entries, Xero writes, or destructive storage clearing on production. Do not manually stamp ownership metadata to bypass a rejection. Do not restore a whole backup over live data as an experiment.

## Deployment and verification runbook

### 1. Freeze and back up before changing anything

1. Agree a maintenance window and stop Timesheet writes from every phone/tab, manual Sheet editor, scheduled job and other integration. The repository contains no maintenance switch; this is an operational hold. Inventory active devices and any triggers before changes. Keep devices with unsaved edits open until those edits are preserved; record pending/failed/legacy queue rows and reconcile with the Sheet without resending.
2. In the production Sheet use File > Version history > Name current version: `Before Stabilisation Checkpoint 1 - <timestamp>`. Use File > Make a copy, name it similarly, place it in a restricted backup folder. Do not share copied Users/password-hash data broadly. Download an XLSX archival copy as a secondary backup, not the sole fidelity backup.
3. Verify the copy opens and contains every visible and hidden tab, including Users, Timesheets, Workers, Prices, Log, Proposals, JobCards, Summary, Stock and all worker/unrelated tabs. Record names, row/column counts, formulas, protections, named ranges and Sheet timezone. Preserve developer metadata separately if not retained in the copy. Save a restricted before-snapshot of all 14 Timesheets columns, formulas and raw values keyed by worker+date; row counts alone are insufficient.
4. Save all current Apps Script source files and appsscript.json. Record production Sheet ID, script project ID, deployment ID, current version, /exec URL, execute-as/access settings, timezone, libraries and triggers. Securely back up Script Properties separately in an access-controlled location; do not put secrets in Git or this report. A Sheet copy is not a complete deployment/configuration backup.
5. Archive the currently served frontend release, its sw.js/cache name, manifest/assets and environment configuration. Record hosting provider, deployment/release ID and rollback method. Preserve device site data; secure local drafts/queues through a verified browser-profile/IndexedDB backup process before any destructive recovery. There is no built-in full device backup in this repair. If important unsynced data cannot be preserved, stop the rollout for that device.

### 2. Stage and prove the candidate

1. Make a second copy from the untouched backup for testing. Confirm its spreadsheet ID differs from production. In Extensions > Apps Script confirm the bound project is the staging project. Remove/disable copied automation and external connections in staging only; do not copy production OAuth tokens or Xero credentials into it. Verify no external spreadsheet/Drive/integration references can write production before running it.
2. Keep a faithful restricted copy for legacy-tab preflight tests. Use dedicated staging-only users/workers and reset to another disposable copy between cases when necessary. Do not alter reserved tab schemas. Restrict access to the staging web app/source data appropriately; when anonymous transport is necessary, use sanitized data and staging-only credentials.
3. Apply candidate Code.gs to staging, retain Stock and other files/manifest. Create a staging versioned web-app deployment. Serve the candidate frontend on a separate HTTPS origin with all existing runtime assets, helper and staging-only configuration. Verify its requests go only to the staging /exec URL.
4. Run every verification below and record results, screenshots without credentials, row acknowledgements and before/after Sheet snapshots. Stop on an unexplained failure; this checkpoint does not authorize additional fixes.

### 3. Deploy Apps Script after staging passes

1. Recheck the deployed project against the backed-up source. If it differs from the supplied source outside Repairs 1–3, stop and compare; do not overwrite unknown production changes.
2. In the existing production project replace only the matching bridge file with reviewed Code.gs. Preserve Stock, appsscript.json, libraries, properties, ownership, timezone and triggers. Do not run setup, setupStock, fixExistingTimes or a manual rebuild.
3. Save. Choose Deploy > Manage deployments > select the existing production deployment > Edit > Version: New version. Description: `Stabilisation Checkpoint 1 - Repairs 1–3`. Preserve execute-as/access settings; deploy and record the new version. Confirm the /exec URL is unchanged. Do not create a new production deployment or use /dev on phones. This is Google's versioned-deployment workflow: https://developers.google.com/apps-script/concepts/deployments .
4. Keep all client submissions paused until the matching frontend is active and devices are verified. Test valid login against the unchanged URL; stop on permission or manifest errors.

### 4. Deploy frontend/PWA

1. Use the existing host's release mechanism and origin/path. Hosting configuration is not supplied, so record the actual dashboard/CI release ID before proceeding; do not invent a new host or architecture.
2. Prefer an atomic release containing index.html, timesheet-sync.js and sw.js alongside all existing assets. If only sequential upload is available, keep maintenance hold, upload timesheet-sync.js first, index.html second and sw.js last. Do not publish the old index as an alternate submission path.
3. Preserve existing supabase-client.js, manifest, icons, assets and private environment configuration. Do not apply Supabase migrations. Do not upload tests or backup credentials as public assets.
4. Fetch the served files bypassing HTTP cache; confirm their candidate bytes, JS MIME types, 200 responses, helper script import and `flagship-v46`. Verify every SHELL URL resolves at the deployed path. No test file or Node runtime should be requested.

### 5. Installed phone update

1. With pending edits safely saved/preserved and submissions still paused, close other app tabs/windows. Reopen online from the same installed origin. The existing worker installs the full shell, then skipWaiting/clients.claim activates it; it does not force an already-open page to reload.
2. Allow installation to finish; reopen/reload once more to obtain the matching HTML/helper. Using browser remote inspection where available, verify active sw.js contains v46, Cache Storage has flagship-v46, and cached index/helper match the release. Confirm there are no failed shell requests or missing FlagshipTimesheetSync errors.
3. Confirm local drafts and held queues remain. Do not uninstall, clear site data, reset IndexedDB, or import a legacy queue automatically. Cache replacement does not migrate/delete IndexedDB. Legacy rows require human reconciliation, not blind resend.
4. On staging phones first, reopen offline after the online update and confirm the app/helper load. Then check a reconciled production device offline without creating a queued test submission. Reconnect only when authorized to drain genuine queued work. Do not allow unverified older clients to submit after rollout.

### 6. Login/session regression

On staging: valid Admin/Technician/Worker login; close/reopen online and check successful `me`, same identity/role and correct screens. Log out/in as another user and confirm the first user's queue is not sent. Wrong password/pending or inactive account must fail. Simulate offline start, server 503 and invalid JSON separately. Compare with the pre-release build on the same staging fixtures.

Known unchanged limitation: boot clears the session on ANY `me` failure when navigator.onLine is true; offline startup trusts stored session. This checkpoint does not correct that distinction. Record it as a pre-existing risk, not a newly repaired guarantee. On production test only valid login/reopen and known-safe offline opening; do not change account status or inject failures. No source change to boot/auth was found, but live regression testing is still required.

### 7. Normal worker and historical-record preservation

On staging, choose a dedicated ordinary worker with no conflicting tab and an unused date in the current 25th–24th cycle. Use one row only: 07:00–17:00, lunch 30, note `SC1 staging normal`. Confirm draft -> queued -> in-flight -> accepted, one added master row, 9.5 normal/0 overtime/9.5 total, correct worker tab and Summary. A subsequent unchanged view must not send again.

Compare every pre-existing Timesheets row's 14 values/formulas to the frozen snapshot, not just totals/count. New row is the only permitted master-data difference. Review Log additions, Users last-login changes, expected derived worker-tab rebuilds/Summary and ownership metadata separately; unchanged historical master values does not imply no formatting/derived-tab writes. Compare reserved/unrelated tab records too. Repeat after all tests. For the optional live real-work acceptance check, use the same comparison and expect only the single approved genuine row plus documented operational/derived changes. Never reuse an existing worker/date: the backend intentionally updates that row.

### 8. Accepted/rejected and queue integrity

On staging inspect request and response without saving passwords. Match results index/date/worker to submitted rows. Added/updated/unchanged alone may accept; only those queue entries disappear. For backend rejection use a controlled staging request with weekday 18:00–19:00 lunch 30 (UI correctly blocks it) and confirm skipped/review reason, no master row. Use a staging Worker credential with a different synthetic worker for blocked. Exercise mixed accepted/rejected results in a staging test client or browser harness using the existing helper; do not modify production UI to bypass validation. Check rejected records remain recoverable with reasons.

Test offline queue then reconnect, failed request then explicit retry only after Sheet inspection, two concurrent tabs, a newer edit while a response is delayed, cycle change during a pending save, and account switching. Confirm no record disappears, no newer edit becomes accepted from an older acknowledgement, and no queue replays under another account. Reconcile uncertain server outcomes before retrying; backend has no revision/idempotency token.

### 9. Lunch and overtime matrix

Use separate unused staging dates/workers or reset the disposable copy; never overwrite real historical rows. For weekday-start rows, compare frontend preview, backend calculation and persisted columns:

| Shift | Lunch | Normal | Overtime | Total |
| --- | ---: | ---: | ---: | ---: |
| 07:00–17:00 | 0 | 10 | 0 | 10 |
| 07:00–17:00 | 30 | 9.5 | 0 | 9.5 |
| 04:00–05:00 | 0 | 0 | 1 | 1 |
| 18:00–19:00 | 0 | 0 | 1 | 1 |
| 22:00–02:00 | 0 | 0 | 4 | 4 |
| 04:00–08:00 | 0 | 2 | 2 | 4 |
| 16:00–19:00 | 0 | 1 | 2 | 3 |
| 04:00–19:00 | 30 | 10.5 | 4 | 14.5 |
| 06:00–17:00 | 0 | 11 | 0 | 11 |
| 05:59–06:01 or 16:59–17:01 | 0 | .02 | .02 | .03 |
| Friday 16:00–Saturday 08:00 | 0 | 3 | 13 | 16 |
| Sunday 16:00–Monday 08:00 | 30 | 0 | 15.5 | 15.5 |

Blank lunch must block; weekday overtime-only lunch greater than zero requires review. Lunch greater than total elapsed also blocks. Starting date classifies the whole overnight shift. Two-decimal category/total rounding can differ by .01. Equal start/end with zero lunch remains zero duration, not 24 hours.

### 10. Collision protection without risking Users

Run the 61 local mock checks first. Then ONLY on a disposable staging copy, save before-snapshots of every tab. Attempt each reserved name (Users, Timesheets, Workers, Prices, Log, Proposals, JobCards, Summary, Sheet1, Stock), lower/upper case and surrounding whitespace, via addWorker and Timesheet POST. Expect a controlled Worker tab protection error before master/target mutation. Rejection logging is allowed; do not misclassify a Log audit entry as target overwrite.

On a separate copy, seed a colliding master row solely to exercise direct rebuildWorkerTabs protection, then verify it throws before any destructive destination operation. Create an unrelated staging tab named `SC1Collision` with sentinel data; attempt that worker and confirm sentinel/structure unchanged. Verify valid new and exact legacy worker tabs still work. Compare Users cell values/formulas and tab structure before/after; never run these inputs against the production endpoint. A staging collision test must explicitly confirm the copied spreadsheet ID first.

### 11. Rollback on any failure

1. Stop all submissions/writers immediately. Preserve error responses, deployment IDs and device state; do not retry uncertain rows. Snapshot current production data AGAIN so valid post-release changes are not lost.
2. In the existing Apps Script deployment select the recorded prior version using Manage deployments > Edit and deploy it to the same URL. Restore the saved editor source too if triggers/editor functions use HEAD; deploying an older version does not necessarily restore that editable source. Restore only settings actually changed. Be aware that rollback restores old calculation/collision defects; keep Timesheet writes paused.
3. Restore the archived frontend release through the host. Rehearse cache rollback in staging: the rollback sw.js must have a fresh unique cache name (for example flagship-sc1-rollback-<timestamp>), with a shell matching the archived files. This is a future rollback operation, not a code change made here. Verify all phones update/reload as in step 5; do not assume serving old HTML replaces an active cached client.
4. Preserve new timesheet-v2 IndexedDB records and legacy queues. Old frontend code cannot read the new state and may replay old queues. Do not reopen Timesheets/reconnect an old client with pending queues until those records have been independently preserved and reconciled. Do not downgrade local data or clear it to make the UI look clean.
5. Code rollback does not reverse Sheet writes. Compare frozen and post-failure snapshots; isolate the exact unintended rows/cells. A responsible data owner must approve a targeted restoration while preserving legitimate new work. Do not restore the entire workbook version over intervening good data, delete accepted work, or swap the production Sheet ID casually. Validate worker metadata and derived tabs without forcing a rebuild.
6. Re-run staging checks and read-only production checks. Resume only after the cause is understood, payroll/data reconciliation is signed off and all devices run an approved consistent release. No further repair is authorized by this plan.

## Outstanding release gates

Live schema/tab ownership, Apps Script permissions/quotas, manifests/triggers, deployment settings, host release process and real phone storage/cache behaviour have not been verified here. Legacy tab discrepancies can block the whole preflight; no bypass is approved. A backend error after a partial write/rebuild can leave an unknown delivery outcome; inspect master rows before retry. Existing startup failure handling, cross-device request ordering and two-decimal rounding limits remain. Successful local tests do not constitute production acceptance.

Google references: [Versioned deployments](https://developers.google.com/apps-script/concepts/deployments), [web app deployment and /dev limitations](https://developers.google.com/apps-script/guides/web), [Sheet version history](https://support.google.com/docs/answer/190843). This runbook uses the existing deployment and a separately isolated staging copy.

## Final Git status

No files were staged, committed or tagged. Expanded status after adding this document:

```text
 M index.html
 M sw.js
?? BACKEND-INVENTORY.md
?? REPAIR-2.md
?? REPAIR-3.md
?? STABILISATION-CHECKPOINT-1.md
?? apps-script/Code.gs
?? apps-script/REPAIR-1.md
?? apps-script/Stock.gs
?? tests/timesheet-calculation.test.cjs
?? tests/timesheet-sync.test.cjs
?? tests/worker-tabs.test.cjs
?? timesheet-sync.js
```
