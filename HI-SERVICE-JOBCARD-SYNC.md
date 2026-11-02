# Hi Service TimeTree → Job Card link staging

This change runs **after** the existing `timeTreeSyncScheduled` READ (normally every 15 minutes) and does not change its trigger.

## Activate in a TEST Apps Script deployment

1. Add `apps-script/HiServiceTimeTreeJobCards.gs` to the *existing* Apps Script project along with updated `apps-script/TimeTreeSync.gs`.
2. Set script property `HI_SERVICE_APP_URL` to the **verified** Hi Service application HTTPS base URL (without a trailing slash). Do **not** assume that the app currently implements `/jobcard?source=timetree&booking=...`.
3. Run `timeTreeSyncScheduled` once and review `TimeTreeJobCardLinks`. Only approved Hi Service labels are staged; a stable booking identity avoids duplicate link rows.
4. Confirm Hi Service actually supports the generated deep link, authenticated booking lookup, job-card creation/opening, and the proposed data fields.
5. Test TimeTree event editing manually on a disposable authorized booking, identify a supported and safe write interface (if any), read-modify-write with source revision checks, then verify by reread.
6. Only after that test may an explicitly opt-in writer be developed and enabled. No production TimeTree writes are implemented here.

## Safety

The original TimeTree notes, events, stock, timesheets and job cards are never modified by this change. The link outbox is **not** a job card and does not guarantee the app route resolves. If the app URL is not configured, staging is skipped and reported as `missingAppUrl`. Sync returns a staging error separately without breaking the booking mirror.

## Remaining work

- Implement the actual Hi Service job-card page, persistence, permissions, client/address/contact autopopulation, before/after images, materials and work description.
- Integrate scheduler `Create / Open Job Card` with a single card per TimeTree booking.
- Verify and implement external TimeTree write-back; preserve pre-existing notes; deduplicate; handle concurrent edits, failed writes and safe retries.
- Test and deploy the changes in the real Apps Script project and both app frontends.

## Frontend implementation (Hi-Service branch)

The Hi Service frontend branch `feature/hi-service-jobcards-20261102` now has a calendar detail button and booking-prefilled Job Card form using the existing `jobCards` and `jobCardSave` backend actions. It supports client name/address/contact, technician, date, materials and work description. Before/after photo uploads, stock deductions, PDF generation, dedicated Hi Service storage isolation, production deployment and tested TimeTree WRITE remain outstanding. Treat as development-only, not production-ready.
