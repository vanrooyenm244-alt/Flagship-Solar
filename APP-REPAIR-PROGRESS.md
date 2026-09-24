# Application repair progress

This continues Repairs 1–3 under Michael's instruction to repair the existing app autonomously. No deployment, production writes, or destructive live collision tests are authorised by this work log.

## Current stopping point — 24 September 2026

Local candidate repaired and regression-tested. NOT deployed, NOT a declaration that every production workflow is complete. The next gate is an isolated staging Sheet/backend/frontend followed by the checklist in `APP-VERIFICATION-CHECKLIST.md`. The original Checkpoint 1 release hashes and claims that other modules are unchanged no longer describe this expanded candidate.

## Completed in this continuation

| Area | Local change and evidence | Remaining limit |
| --- | --- | --- |
| Startup/session | Only explicit invalid-account/password responses invalidate the cached login. Network/server/malformed responses retain it. Late responses from an earlier session are ignored. Role tiles update after validation. | Real deployed `me`, role and account-status tests outstanding. Password-based legacy authentication remains. |
| Browser storage | Writes capture input immediately and resolve only after IndexedDB transaction commit. Aborts reject. Memory fallback cannot report durable saves. | Browser storage is still device-local; no guarantee against device clearing/eviction. |
| Job Cards | Immediate captured saves; ordered Supabase requests; explicit matching submission acknowledgement; revision-bound transactional acceptance; later edits become drafts; failed saves do not submit; photos target original cards/items; common event handlers no longer accumulate. | Concurrent editing of the same card on separate devices/tabs still needs a conflict policy. No durable automatic Job Card retry queue was introduced. |
| Job Card refresh/hiding | Sheets fallback now reads `jobCards` when there is no Supabase session. Refresh imports only absent cards, preserving local edits/photos. Previous local-only Delete is labelled Hide locally and retains a local tombstone against reimport. | Existing local records deliberately do not merge remote edits. Hidden records remain in IndexedDB; no restore UI yet. Sheets submissions still exclude section photos. |
| Backend Job Cards | Exact technician names separated by comma/semicolon/newline replace substring authorization; workers cannot overwrite an existing card assigned to someone else; save/delete operations acquire a script lock. | Existing free-text technician formatting must be checked on a copy. Backend changes are not deployed. |
| Inspections/proposals | Save captures document ID and contents at input instead of reading another document after a timer. Inspection photo completion detects a switched document and requests re-adding instead of attaching to the wrong record. Proposal publish acknowledgement cannot modify a newly opened proposal. | PDF/camera/share and proposal customer acceptance require browser/device/staging checks. Navigation during an inspection photo conversion needs re-adding that photo. |
| Stock | Saves capture the current draft immediately. Responses clear only unchanged submitted values not listed as unknown; newer edits/other locations remain. Invalid response leaves counts intact. | Legacy backend confirms aggregate counts plus unknown names, not exact row revisions. Multi-device concurrent stock counts and ownership of old local drafts remain limited. |
| Quotes/Xero | Customer helper now accesses the actual IIFE-owned quote through a narrow bridge. Zero quantities no longer display/send as one. Invalid quantities/prices are blocked; exact quote/contact IDs required; stale quote/contact acknowledgements do not overwrite a new draft. Existing acknowledged quote cannot be recreated with the same button. Backend uses equivalent explicit numeric validation. Zero prices and negative adjustment prices remain possible. | Live contact/item/quote calls and tenant configuration unverified. Lost responses can still leave uncertain remote outcomes; check Xero before retrying. |
| Calendar | Exact personal assignment matching; calendar opens its linked Job Card and persists newly created links; correct `technicians` field and known job-type mapping. | Calendar remains local-only. Cross-device scheduling cannot be declared working without the backend/authentication design being resolved. |
| Supabase adapter | Removed duplicate list handler; corrected returning `select=*`; validates returned card identity; does not mutate raw input rows; retains client revision time. Mere configuration no longer intercepts Sheets submission without a Supabase session. | No production schema/RLS changes or new login architecture. Existing nullable company IDs retained in accordance with repository migration; live policies still unknown. |
| PWA | Cache `flagship-repairs-v86`; excludes external/API/query requests and unrelated same-origin paths; activation only removes Flagship-prefixed old caches; HTTP errors cannot replace cached navigation. | Actual old-to-new installed-phone upgrade/offline behaviour remains unverified. Runtime PDF libraries still depend on their external CDN. |

## Verification performed

- `node --test tests/*.test.cjs`: **225 individual checks passed**: Repair 1 61; Repair 2 58; Repair 3 52; integration 5; application-integrity 49. Node reports 165 test entries because Repair 1 runs its 61 assertions inside one entry. No failures. Captured output: `tests/latest-results.txt`.
- `node tests/check-static.cjs`: 21 JavaScript units and manifest JSON parsed. Private deployment config intentionally excluded.
- `git diff --check`: passed; only the Git LF/CRLF normalization notice appeared.
- Local browser, simulated endpoint only: session restored after reload; Job Card saved, acknowledged, retained after reload/reopen; editing accepted content returned it to Draft. Earlier simulated Timesheet rejection retained its row and reason. These are not Google/Supabase integration results.

## Files changed in this continuation

`index.html`, `supabase-client.js`, `xero-customer.js`, `sw.js`, `apps-script/Code.gs`, `tests/checkpoint-integration.test.cjs`, `tests/local-preview.cjs`; added `tests/application-integrity.test.cjs`, `tests/check-static.cjs`, `tests/latest-results.txt`, this log and `APP-VERIFICATION-CHECKLIST.md`. `timesheet-sync.js`, Repair 1–3 test source and `apps-script/Stock.gs` were not changed in this continuation. No SQL migration, private config or credential was added/edited.

The old frozen outside-Timesheet source-hash tests were intentionally replaced after authorization to repair other modules. They no longer assert byte identity with deployed source; behavioural tests cover the expanded edits. Existing calendar, PDF and bilingual proposal modules remain in the application.

## Outstanding issues — do not mistake these for completed repairs

1. Live Supabase schema/RLS and price tables may differ from the repository migration. The existing storage policies in that migration grant broad authenticated bucket access; do not deploy them without an agreed ownership policy and staging tests.
2. Legacy Apps Script login stores a reusable password locally and sends it on authenticated GETs. Replacing it with a session-token protocol needs a coordinated frontend/backend release, existing-session migration and staging verification; not silently substituted here.
3. Local jobs/cards/quotes/proposals/calendar caches are not fully separated per logged-in user. Timesheet queues ARE account/endpoint-bound by Repair 2. Do not approve shared-device privacy or replay behaviour for other modules yet.
4. Central photo persistence and multi-device conflict resolution are not complete. Sheets metadata success does not back up photos. Keep device data and PDF exports.
5. Xero/proposal writes lack proven idempotency for lost responses; proposal acceptance and subsequent conversion need staging end-to-end tests. Publishing a second time can create another proposal. Do not retry uncertain financial operations blindly.
6. Price/supplier import requires representative supplier files and the actual price source/schema to validate matching. No live price edits were made. A source parse is not a pricing/business-rule test.
7. Backend candidate must be deployed to staging with the supplied manifest/properties verified, without pointing stock, Sheet IDs, Xero or Supabase at production.

## Git state at this stopping point

Modified tracked files: `index.html`, `supabase-client.js`, `sw.js`. Untracked work includes all earlier audit/checkpoint/repair documents, `apps-script/`, `tests/`, `timesheet-sync.js`, `xero-customer.js` and the two new progress/checklist documents. Nothing committed, pushed or deployed. Tracked diff statistics alone omit these untracked files. All must be reviewed and intentionally included before a release.

## Confirmed test result
The local preview's `REJECT` note intentionally returns `Staging fixture rejection`. The frontend retained that row and its reason instead of acknowledging it. This is a simulated rejection, not a production server failure.

## External verification still required
- Live Supabase schema, RLS, membership/authentication and storage policies are not available locally. Do not invent or deploy policies.
- Xero integration requires a connected test organisation and credentials held by its owner. Do not create real financial records during local tests.
- Apps Script changes still require staging deployment and copy-based tests before release.
- Installed-phone offline/cache, camera, PDF and share behaviour require device checks.

Resume with staging preparation, preserving the untouched backup. Do not restart the repairs or ask Michael to repeat completed backups.
