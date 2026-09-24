# Repair 1: protect worker-tab destinations

`Code.gs` is the supplied deployed Sheets bridge with only the worker-destination safeguard added. `Stock.gs` is an unchanged copy of the supplied companion script. Neither file has been deployed from this workspace. The frontend, acknowledgement flow, calculations, and other audited issues are unchanged.

## Protection

Reserved names are derived from `Object.keys(SHEETS)`, plus `Summary`, `Sheet1` and `STOCK_SHEET` (fallback `Stock`): Users, Timesheets, Workers, Prices, Log, Proposals, JobCards, Summary, Sheet1, Stock. Comparison trims whitespace and ignores case after the existing filename sanitization/truncation. Distinct worker names resolving to one destination are rejected, not redirected.

Destination preflight runs before an incoming Timesheet batch writes its first row, on direct `writeEntry_`, before adding a worker, before time-column repair, on direct `workerSheet_`, and independently at the start of `rebuildWorkerTabs`. All destinations are checked before any legacy ownership metadata is added or any worker tab is created/rebuilt. Each destination is checked again in rebuilding.

Existing tabs must have exactly the worker schema with no extra populated columns. Owned tabs must carry matching `FLAGSHIP_WORKER_OWNER_V1` developer metadata. For backward compatibility, an unmarked legacy tab is recognized only if it is a nonempty, formula-free exact copy of that worker's projected master records (row order may differ). Only then is ownership metadata added. Header-only, stale, manually edited, or otherwise ambiguous unmarked tabs are rejected for manual review; they are never silently cleared or redirected. Identical schema/data is the legacy recognition evidence, not independent historical proof of who created the sheet.

Errors begin `Worker tab protection:` and are written to the Apps Script execution log. API dispatch returns its existing `{ok:false,error:...}` envelope and existing best-effort Log entry. The guard itself never invokes automatic Sheet setup while rejecting a destination.

## Local verification

Run from repository root:

```text
node tests/worker-tabs.test.cjs
```

Tests use a VM and in-memory Spreadsheet stubs. They exercise the supplied script, including direct helper, rebuild and POST dispatcher calls. No credentials, Google API, production Sheets, or Xero calls are used.

## Deployment and regression limits

- Production is unchanged. Review this Code.gs against the deployed source and use the existing Apps Script project's versioned deployment workflow when authorized; do not create a replacement project or run setup as part of this patch.
- First validate against a backed-up spreadsheet copy, especially legacy tabs containing older time-cell representations, formulas, manual edits or case-variant worker identities. An ambiguous destination stops the whole preflight rather than partially rebuilding earlier workers.
- The guard adds Sheet reads and developer-metadata access; real Apps Script permissions, quotas and timing are not verified by the mocks.
- Concurrent manual spreadsheet edits and external scripts are outside the protection of the existing POST script lock. No locking architecture was changed.
- No cleanup, rename, deletion, or automatic recovery of already-damaged tabs is attempted. Existing business data remains the source of truth.
