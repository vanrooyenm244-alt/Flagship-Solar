# Repair 2 — Timesheet acknowledgement and queue integrity

Scope: frontend Timesheet persistence, submission and acknowledgement only. Existing Apps Script per-row `results[]` contract is unchanged. No deployment, overtime calculation repair, backend changes, or unrelated module refactor.

## Implemented contract

- Explicit states: `draft`, `queued`, `in-flight`, `accepted`, `rejected`, `failed`; row/queue displays include rejection or error text. `sent` is true only for the current accepted revision.
- Enqueue immutable payload/revision snapshots. Accept only `added`, `updated`, or `unchanged` with exactly one result matching submitted index, date and worker. Aggregate counts, missing results, malformed responses and rejected statuses cannot acknowledge a row.
- Remove only explicitly accepted queue IDs. New entries added during a request remain. Superseded/deleted revisions remain recoverable as rejected references and are not replayed. Old in-flight acknowledgements cannot mark a newer local revision sent.
- All direct sends use the queue. A single in-flight promise, durable batch ownership and (when supported) an origin-wide Web Lock prevent competing drains. A restarted interrupted batch remains held; explicit recovery under the Web Lock changes it to failed/unconfirmed, not accepted or automatically resent.
- Only queued rows auto-drain. Rejected/failed rows require an explicit retry of a still-current local revision. Unknown delivery outcomes tell users to check the Sheet before retrying.
- Account key includes normalized username and exact Apps Script URL. Credentials are captured for the request, never persisted inside this queue, and never substituted from a different user during a drain. Existing legacy credential storage is outside this repair.
- Drafts, queue and acknowledgement changes use one record in the existing IndexedDB `cfg` store per account/endpoint (`timesheet-v2:<account key>`). Read-modify-write is transactional and success waits for transaction completion. Database schema/version is unchanged.
- Every draft save captures its owner, cycle and contents immediately. Saves are serialized, not debounced against mutable globals. Cycle navigation waits for pending commits. Cycle loading disables interaction until complete. Save failure blocks navigation/submission; optimistic cycle versions reject conflicting writes from another tab.
- Existing unowned `ts-YYYY-MM` drafts remain intact. Copying them into the current account requires explicit confirmation and treats them as drafts, not accepted records. Legacy `cfg/queue` is retained and displayed for manual review; no owner/revision is guessed and none of those records is automatically replayed. Do not discard legacy records until reconciliation.
- API authorization/validation errors retain their actual server message. HTTP failures, invalid JSON and transport errors have distinct descriptions; transport failures explicitly say delivery is unconfirmed. No generic “No connection” fallback converts server rejection into apparent success.

## Lunch: no new business default

Existing new-row controls still visibly initialize lunch to 30 minutes. Explicit zero is valid and is transmitted as numeric zero. A blank/missing/invalid lunch value is excluded from preview totals, visibly flagged, and blocks submission until a person enters minutes. This prevents the frontend-zero/backend-30 disagreement without interpreting historical blanks. Legacy queue rows are held, including any ambiguous blank lunches.

No new policy decision is needed for explicitly entered values. Michael/payroll must decide what historical blank lunches meant before any retrospective correction. Existing frontend `calcShift` and backend overtime calculations are untouched; automated comparison confirms the frontend function is identical to HEAD. The known overtime defects remain for Repair 3. Backend `unchanged` detection still has its previously audited limitations; this repair consumes its explicit result rather than claiming independent Sheet read-back verification.

## Validation

```text
node --test tests/timesheet-sync.test.cjs
node tests/worker-tabs.test.cjs
git diff --check
```

Repair 2 tests cover accepted/rejected/mixed results, explicit reasons, missing/mismatched acknowledgements, offline/reconnect/retry, concurrent drains including separate engine instances, in-flight newer edits, newly queued records during a drain, removed/superseded rows, account/endpoint switches, cycle-bound persistence/navigation, storage commit/abort/failure, legacy hold, explicit lunch zero and ambiguous lunch rejection. Repair 1's reserved-tab suite remains unchanged.

## Regression and deployment limits

- First use requires reconciling old unowned drafts/queue; a legacy `sent` flag is not trusted as proof of acceptance. Review Sheet records before resubmitting historical rows.
- Changed data layouts stay inside the existing cfg store, but older app versions do not understand the new account-scoped state. Update devices together; keep legacy data and browser backups. Do not use the alternate old HTML for Timesheet submission during rollout.
- `timesheet-sync.js` must be served with `index.html`; service worker v45 precaches it. Cache version change prepares a later deployment only.
- Failed local saves leave current edits in memory with an error; do not close/reload before recovery. Tabs with conflicting versions fail closed rather than merging or overwriting unseen edits.
- Without Web Locks, persistent batch ownership still prevents a second drain, but interrupted-batch recovery is deliberately unavailable. Preserve records for reconciliation; a different browser does not automatically share this browser's IndexedDB.
- A lost network response cannot reveal whether Google committed the rows. Backend provides no revision precondition or idempotency token. The frontend holds such rows for explicit review; it cannot guarantee ordering against unknown server execution, other devices, manual Sheet edits, or older application versions. Those require backend/reconciliation work outside this targeted repair.
- No production Sheets/API calls were made. Real mobile IndexedDB behavior, browser locking, installed-PWA update paths and live row responses still need staging/device verification. No Apps Script changes are needed for this frontend contract repair.
