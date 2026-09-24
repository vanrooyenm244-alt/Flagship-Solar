# Checkpoint 1 — deployed frontend comparison

Status: HOLD deployment. Read-only source comparison; no application edits, deployments, live API requests or Sheet writes performed. This report supplements STABILISATION-CHECKPOINT-1.md and corrects its deployment-readiness assumptions. The previous local test results remain valid only for the local candidate.

## Sources and limits

- Local Git baseline: 71d14f26a96fd9e53d5b797df0a421625ba938fd.
- Local candidate: working tree containing Repairs 1–3, cache flagship-v46.
- Latest successful GitHub Pages run inspected: #147, https://github.com/vanrooyenm244-alt/Flagship-Solar/actions/runs/35689180026 . Commit f987198282d36e4170051e6c2bf73fa22a517e90, cache flagship-v84.
- Compared extracted source archive at C:/Users/User/Downloads/Flagship-Solar-f987198282d36e4170051e6c2bf73fa22a517e90/Flagship-Solar-f987198282d36e4170051e6c2bf73fa22a517e90.
- The Pages build artifact is expired. The saved ZIP is a source snapshot, not a byte-verified archive of generated/served Pages output. Current hosted bytes and individual installed-phone versions have not been verified.
- Supabase configuration values were not printed or copied into this report. New backend source/manifest/properties backups were confirmed saved by Michael but their local paths/content have not been compared against the earlier supplied scripts.

## File inventory against the local Git baseline

Changed: index.html, sw.js, supabase-client.js, README.md.
Additional in deployed source: supabase-config.js, xero-customer.js.
No baseline tracked files are absent from the archive. Remaining baseline tracked files match bytes, including assets/icons, manifest, price-updater HTML, install-check HTML and SQL migration.

The repaired local candidate additionally contains timesheet-sync.js, backend source copies, tests and repair/audit documentation. These local additions are not evidence that the deployed version includes Repairs 1–3.

## Functional differences and preservation requirements

Line references below refer to deployed-archive index.html unless stated otherwise.

| Area | Deployed source / difference | Consequence for checkpoint |
| --- | --- | --- |
| IndexedDB (1366–1399) | Opens flagship-inspections version 5; adds calendar store and memory fallback. Local candidate still opens version 4. | Blocking compatibility issue: a browser with version 5 rejects opening version 4. Candidate can enter its storage-failure/memory path; Repair 2 then refuses durable submission. Preserve version 5 and calendar store; never clear data as a workaround. |
| Calendar (779, 829, 1583–1610) | Home tile, monthly grid, schedule form, local persistence, technician filter, opening a related Job Card, back navigation. | Direct upload of local index removes this functionality. Preserve UI/store/navigation. Presence of source does not certify calendar behaviour or permission enforcement. |
| Job Cards (857, 1655, 1734, 1763–1844) | Adds pad2_ helper; exposes jcNew_ on window and uses inline onclick instead of previous listener; PDF renders a visible off-screen clone to canvas and slices it across A4 pages. | Keep creation wiring consistent (do not double-register), preserve PDF implementation unless separately repaired. Existing core save/submit/photo implementation is not repaired by this comparison. |
| Timesheet server read (2280–2303, showTime near 4260) | Adds timesheetAll cycle request; merges server rows when local row absent or sent, writes old cfg cycle record. | Local Repair 2 removes this deployed capability. Future integration must retain server read with captured owner/cycle and protect local draft revisions. Copying this function verbatim would bypass new transactional/account-scoped state and can apply a late response to the wrong mutable cycle. |
| Timesheet acknowledgements (4498–4604) | Deployed code already checks result status and keeps rejected queue rows; deduplicates by worker/date. | Earlier baseline audit overstates deployed defects: deployed rows are not unconditionally sent and successful batches do not simply discard all rejected rows. Still matches results by array position only, has no snapshot revision/account binding, no concurrent drain guard, and overwrites queue from captured batch. Repair 2 guarantees are still needed, integrated deliberately rather than two competing queues. |
| Timesheet lunch/calculator (4191 onward) | Deployed blank lunch already defaults to 30 in frontend, matching old backend. Old boundary/overnight formula remains. | Historical blank=0 mismatch applied to local baseline, not this deployed frontend. Retain Michael-approved explicit-lunch/review and starting-day rules from Repairs 2–3; do not reinterpret historical rows. |
| Startup/session (4608 onward) | Shows home immediately with saved session; validates me in background. Loads cfg/session and boot before seeding clauses. | Candidate restores older startup ordering and delayed home display. Preserve deployed startup as existing scope unless separately authorized. Both versions still clear session on any online me failure; background validation does not itself resolve that defect. |
| Users (4117) | Changing a role also sends status Active, unlike local baseline which preserves pending state for non-active users. | Security-relevant existing difference. Record/preserve knowingly; do not silently change user activation policy while porting Timesheet repairs. |
| Prices (loadPrices near 2731) | Reads pricecache first, shares PRICES/PCACHE, adds PRICES_LOADING guard and refreshes network cache. | Candidate would remove deployed cached-first loading and request guard. Preserve. |
| Value Proposals (3084, 3101, 3543, 3664, 3712) | Language-specific descEn/descriptionEn display/editing and item creation; improved Afrikaans button labels. Removes mandatory preselected Xero contact check at publication, retaining client/line checks. | Preserve bilingual behaviour and document changed publish prerequisite; do not silently restore the older restriction. |
| Stock (955, 3858–3940, 4658 onward) | Cached-first refresh; keeps selected-place rendering current, records savedAt. Admin/Technician add-item UI sends stockAdd with item/category/unit/price. | Candidate removes stock creation UI and changes caching. Preserve both; supplied backend contains stockAdd. |
| Xero helper (xero-customer.js) | Extra loaded/cached file adds a create-contact button and calls xeroCreateContact. It requires window.api and window.QB at init and later qbSave. | Keep file and import/cache dependency. Static inspection found no window.api/window.QB/window.qbSave exports in archive index (they are inside the main IIFE), so helper appears to return before installing the button. Record as a pre-existing concern, not a working feature certification or a fix authorized here. |
| Supabase adapter | Adds listPrices against price_items and another listJobCards definition. The two listJobCards definitions coexist; later one overrides earlier. | Preserve deployment interface during reconciliation; duplicate is pre-existing, outside Repairs 1–3. Live schema/RLS remains unverified. |
| Supabase config | Archive includes supabase-config.js despite .gitignore entry; local candidate excludes it from tracking. | Preserve deployment configuration separately and review its safety privately. Ignoring a file does not remove an already tracked file. No credential conclusions based solely on presence/absence. |
| PWA | Deployed v84 precaches xero-customer.js; candidate v46 precaches timesheet-sync.js instead. Extra mobile metadata/favicon in deployed HTML. | Future integrated shell needs both runtime helpers and all existing assets. Cache names are strings, not numeric upgrade rules: lower number alone does not block SW installation. Risk is stale/reused cache identity and missing dependencies. Use a fresh unique name only when code changes are authorized. |
| README | Adds deployment trigger date. | Minor documentation difference; old README deployment directions remain outdated. |

## Repair-specific assessment

Repair 1: local guards/tests have not changed. Frontend ZIP does not establish deployed backend equivalence. Compare the newly saved Code/Stock/manifest backup to the original supplied backend and candidate before any replacement. Keep reserved lists, preflight and inner rebuild guards.

Repair 2: keep immutable snapshots, transactional cfg state, owner/endpoint scope, revision-bound acknowledgement, selective removal, failed/rejected recovery and lock/cycle safeguards. Integration must explicitly accommodate deployed timesheetAll reads and existing version-5 database. Do not retain legacy auto-replay alongside the new engine.

Repair 3: equivalent local calculators and accepted payroll decisions remain the intended targeted change. Port calculation and review-reason behaviour onto the correct source while retaining unrelated deployed functionality. No new payroll rules or retrospective recalculation.

## Confirmed risks if current candidate is uploaded directly

1. Version-5 IndexedDB can fail to open under candidate's version-4 request, affecting startup and durable storage.
2. Calendar, stock creation, PDF export changes, language behaviour and Xero helper dependency can be lost.
3. Timesheet server read-back and startup behaviour would regress to the older local baseline.
4. Blindly copying deployed Timesheet read-back into Repair 2 would introduce a second persistence model and mutable-cycle race.
5. Uploading candidate files piecemeal could mix incompatible HTML/helpers/cache entries.

Local scope review was accurate relative to local HEAD only. It was insufficient to approve replacement of the actual deployed frontend. Checkpoint 1 must remain on HOLD pending source reconciliation and renewed verification.

## Checks performed

Read-only baseline/archive byte inventory; full baseline-to-archive HTML diff with focused review of changed modules; candidate-to-archive diff; adapter/helper/cache inspection. Parsed archived index inline scripts, sw.js, supabase-client.js and xero-customer.js successfully without executing them. Verified supplied local backend contains timesheetAll, stockAdd and xeroCreateContact names; this is not live contract verification. No need to rerun unchanged repair suites for this documentation-only comparison; previous passes do not cover a future combined build.

## Safe next order (not implemented)

1. Finish Step 1 evidence: compare current backend backup and deployment version, complete Sheet raw-value/formula/structure/metadata checks, verify frontend served-file backup and actual Pages settings. User has confirmed no local device data needs retaining; no device data was cleared.
2. Obtain explicit authorization before application changes: reconcile Repairs 1–3 onto the confirmed deployed source in an isolated candidate, preserving unrelated features and database version. No new defect repairs or redesign.
3. Rerun Repairs 1–3 plus migration/open-v5, Timesheet server-read races, existing-feature smoke and complete dependency/cache checks on that candidate.
4. Only after review and confirmation proceed to isolated staging under the checkpoint runbook. Never collision-test live data. No deployment authorization is implied by this report.

## Remaining information

Backend source paths have now been supplied and compared (see follow-up below). The saved manifest still needs verification where required; keep Script Properties private. Current served Pages bytes are not archived/compared yet. Sheet detailed verification, metadata fidelity and triggers owned by other accounts remain unverified. No need to request credentials, database passwords or OAuth tokens in chat.


## Follow-up: current backend source backups compared

Michael supplied these editor-source backup files:
- C:/Users/User/Desktop/NEXTGENWEBWORKS/code gs.txt
- C:/Users/User/Desktop/NEXTGENWEBWORKS/stock gs.txt

Both match the originally supplied attachments after normalization of BOM/line endings/outer whitespace; git diff --no-index reports no textual differences. Both parse successfully as JavaScript. Stock also has the same SHA-256 as the unchanged candidate Stock.gs. No unexpected backend source drift was found in these backups. Candidate Code.gs differs by the already reviewed worker-tab guards and calculation/review-reason changes; candidate Stock.gs is unchanged.

Backup SHA-256:
- code gs.txt: 1260cc3742839af57668878f2914928da740f3967e5f96a5de017c47e9e47c8a
- stock gs.txt: e258243df6df12c72473383fbda56764bc736121cb6c0b868dd6e8ddbd0c30bd

These are backups of editor source. Equality does not prove that the active versioned /exec deployment uses that same source; the selected deployment version and project-history source still need correlation. No live backend execution, code changes or deployment occurred. The frontend reconciliation HOLD remains in force.
## Follow-up: Version 50 bridge source supplied

Michael supplied the Code.gs text identified as Version 50 from Project history, attachment b1310d51-1295-47c4-b156-4415eda3e666/pasted-text.txt. Its SHA-256 is 1260cc3742839af57668878f2914928da740f3967e5f96a5de017c47e9e47c8a, identical to the current editor-source backup code gs.txt. It also matches the originally supplied bridge source and passes JavaScript parsing. The earlier screenshot shows Version 50 dated 22 September 2026, 07:02 selected in the deployment dialog. This establishes bridge-source agreement using the user-identified version export; it is not an independent live API/source export verification. Version 50 Stock.gs and appsscript.json still need comparison before claiming whole-project agreement. Frontend deployment remains on HOLD. No application code was changed.
## Follow-up: Version 50 Stock source supplied

The Stock.gs text supplied in the Version 50 verification step (attachment c32c49fe-0646-4494-9553-0a83c2c9c3fb/pasted-text.txt) is byte-identical to stock gs.txt and the candidate apps-script/Stock.gs. SHA-256: e258243df6df12c72473383fbda56764bc736121cb6c0b868dd6e8ddbd0c30bd. JavaScript parsing passed. Together with the previous Code.gs comparison, both supplied Version 50 source files agree with their editor backups. The Version 50 manifest comparison remains outstanding; no whole-project/configuration equivalence is claimed yet. No application changes or deployment performed.
