# Flagship Solar — next verification steps

This is the expanded candidate after Checkpoint 1, not the unchanged Checkpoint 1 release. Follow its backup, deployment and rollback discipline, but use the updated file list and limitations in `APP-REPAIR-PROGRESS.md`. Nothing has been deployed.

## Next step: prepare isolated staging

1. Keep the existing `BACKUP DO NOT EDIT` Sheet untouched. Create a separate working test copy of the original/backup Sheet and label it `Flagship Solar STAGING`.
2. Confirm that the Apps Script project opened from that test Sheet is a separate project. Verify its active spreadsheet and every hardcoded spreadsheet ID. A copied script can still reference the original Sheet.
3. Before any execution, inspect copied Script Properties privately. Do not copy production Xero tokens, Supabase service-role access or external write destinations into staging. Retain the saved production properties for rollback, not test execution. Verify manifest/timezone and deployment execution identity.
4. Put the candidate `Code.gs` and unchanged `Stock.gs` in the matching staging project. Preserve other required project files. Do not run setup, time-repair, or worker rebuild utilities manually. Deploy a staging web-app version and record its ID/version separately.
5. Serve the candidate frontend from a separate origin; configure only the staging `/exec`. Verify `ping` and the signed-in identity. The current localhost preview at port 8766 is a **simulator**, not this real Apps Script staging environment.
6. Use only synthetic test workers/customers/items. Complete the tests below before deciding whether to deploy production. Financial tests require a Xero test/demo organisation, never real customer quotes.

## Must test on staging/a copy

- [ ] **Login/session:** valid worker/admin; wrong password; inactive account; role change; temporary server failure; offline reopen; logout/login as a second account during a delayed response. A transient failure must not erase the saved login.
- [ ] **Timesheets:** accepted, rejected and mixed batches; retry after offline; double-send; newer edit while an old request is pending; switch cycles mid-save; switch accounts with a queue. Only the exact accepted snapshot may be acknowledged; rejected rows retain the reason.
- [ ] **Calculations:** weekday 07–17 with lunch 0 = 10 normal hours; lunch 30 = 9.5 normal. Weekday 04–05 and 18–19 = 1 overtime hour with lunch 0. Weekday 22–02 = 4 overtime hours with lunch 0. Test 06:00 and 17:00 boundaries and one-minute crossings. Blank lunch must require input. Weekday lunch exceeding normal minutes requires review. Overnight uses the starting day's classification, as approved by Michael.
- [ ] **Worker-tab protection:** all reserved tabs including Users; case and whitespace variants; unrelated existing sheet with colliding name; legitimate worker. Compare row counts/values before and after. No destructive collision test against live data.
- [ ] **Historical records:** export/compare original master/Users/Stock/JobCards and derived tabs before/after synthetic tests. Historical rows must remain unchanged except explicitly identified test records.
- [ ] **Job Cards:** save/reload; multiple photos and captions; switch cards while an image processes; storage failure; submission rejection; exact acceptance; edit during submission; reopen accepted and edit to Draft; refresh must not overwrite local photos; Hide locally must not remove central records or reappear on refresh.
- [ ] **Job Card permissions:** worker Ann must not match Joann; cannot overwrite another worker's existing ID by assigning the payload to themselves; admin/technician operations still work. Check existing technician names against comma/semicolon/newline separation.
- [ ] **Calendar:** create/reopen an event; correct technician and type on its card; repeated opening reuses the linked card. Treat the calendar as device-local until central synchronization is implemented and verified.
- [ ] **Inspections:** rapidly edit/open another inspection; reopen original and verify text/severity/photo captions; camera and gallery input; remove/reorder photos; PDF pagination and share. Switching during image conversion must not attach it elsewhere.
- [ ] **Proposals:** Afrikaans/English; prices/totals; save/switch/reopen; PDF; publish a synthetic proposal; customer view/accept; rejected or repeated acceptance; convert accepted proposal to Xero test quote. Verify the draft being viewed cannot receive another proposal's late acknowledgement.
- [ ] **Quotes/Xero:** find existing contact; no-results customer creation; duplicate-contact handling; item matching by code; positive fractional quantity; zero quantity rejected; explicit zero price; existing adjustment prices; correct tax/account from configured source; matching QuoteID; new draft opened during submission. Check Xero before retrying an uncertain response.
- [ ] **Stock:** known/unknown mixed items; zero count; blank untouched item; newer value typed while sending; location switched mid-request; offline save/reopen/retry; add item; supplier upload preview and accepted/skipped/not-found totals. Other locations must remain unchanged.
- [ ] **Prices:** representative CSV/XLSX/PDF import preview; duplicate/unmatched codes; zero markup; explicit price overrides; admin CRUD versus technician/worker denial. Verify the actual Supabase/Sheet source matches the backend configuration.
- [ ] **Supabase:** compare live schema/RLS to migration; profiles/membership/company access; authenticated card insert/update/return shape; unauthenticated denial; other-company denial; private-photo ownership. Do not apply a guessed migration to make tests pass.
- [ ] **PWA/phone:** install previous version, update to candidate, close/reopen; confirm v86 shell; offline startup and stored work; camera/signature/PDF/share on Android/iOS as used; lost connectivity during sends. Never clear site storage to force an update without exporting unsent work.

## Safe to inspect in production without writes

- Deployment ID/version, source/configuration comparison, manifest/timezone, Sheet names/headers and backup inventory.
- Read existing records and compare exports without running repair/rebuild/setup functions.
- After a separately approved production deployment: normal login and read-only navigation, while watching for unexpected errors.

## Do not test against live data

- Reserved/unrelated worker-tab collisions, forced storage loss, destructive rebuild/setup or bulk deletion.
- Fabricated payroll, stock counts, supplier price imports, customer acceptances or financial records.
- Clearing IndexedDB/site storage while work exists, or weakening RLS to get a successful response.

## Release and rollback gate

Record candidate files/commit, staging deployment version, tests/results and unresolved issues first. The current working tree is not committed. Include untracked runtime/backend files deliberately; tests/docs are not production dependencies. Deploy backend and frontend as a reviewed pair only after approval. Preserve original version 50 deployment details and source backups. On failure stop new writes, restore the previous frontend and Apps Script version, retain unsent local work, and investigate affected test records rather than clearing or replaying queues. Rollback must not blindly restore a Sheet over legitimate new records.
