# Repair 3 — Timesheet calculation correctness

Implemented locally only; not deployed. No historical Sheet rows were recalculated.

## Root cause
The old weekday overtime formula measured the distance to 06:00/17:00 even when the employee did not work that interval. Overnight end times were extended past midnight but normal-time intersection covered only the first day. Backend blank lunch also defaulted to 30 while the frontend used zero.

## Calculation model
- Strict calendar date and 00:00–23:59 time validation; elapsed wall-clock minutes from start to end. An earlier end is next day; equal times remain zero duration, not an inferred 24-hour shift.
- Preserve the existing 06:00–17:00 weekday normal window (07:00 is the form default, not the classification boundary). Intersect the worked interval with each daily window; overtime is elapsed minus those intersections.
- Michael confirmed that the starting date classifies the whole shift: weekday-start shifts use normal windows on both dates, even Friday into Saturday; weekend-start shifts remain entirely overtime, even Sunday into Monday. One starting date/day type remains on the row.
- Explicit finite nonnegative lunch only, including zero. Missing lunch requires review; no backend default is applied. Lunch cannot exceed actual elapsed minutes.
- Weekday lunch subtracts from normal time only. Michael confirmed that excess requires review; the row is not submitted/accepted and no excess is assigned to overtime. Weekend lunch subtracts from overtime as before.
- Compute in minutes, then preserve existing two-decimal hour outputs. Total derives independently from elapsed minus lunch; rounded categories can differ from rounded total by 0.01 hour.

## Changes and compatibility
Identical calculation cores in index.html and apps-script/Code.gs, with existing public function names retained. The UI displays validation/review reasons. Backend invalid rows retain the existing skipped acknowledgement status and now include a reason, which Repair 2 already displays and retains for recovery. No queue, revision, account, acknowledgement matching or concurrency implementation was changed. Cache version advanced to v46 so a future deployment refreshes the frontend.

The obsolete Repair 2 assertion freezing the defective calculator to the pre-repair Git baseline was replaced by Repair 3 frontend/backend equivalence checks. All other Repair 2 behavioral assertions remain.

## Verification
- Repair 3: 52 tests, including 169 sampled interval combinations, frontend/backend parity, exact boundaries, short shifts, midnight, month/year rollover, explicit lunch, approved review/classification rules, invalid inputs and a mocked backend write/acknowledgement path.
- Repair 2: 49 tests.
- Repair 1: 61 isolated checks.
- Syntax: all inline frontend scripts, root JavaScript files, and both Apps Script files parse successfully.

Commands: `node --test tests/timesheet-calculation.test.cjs tests/timesheet-sync.test.cjs` and `node tests/worker-tabs.test.cjs`.

Reproduced failures with lunch zero now yield 04:00–05:00 = 1 overtime hour, 18:00–19:00 = 1 overtime hour, and 22:00–02:00 = 4 overtime hours. No time outside the worked interval is added.

## Remaining verification and risks
Live Apps Script/Sheets execution, production timezone settings and installed-phone cache updates remain unverified; no deployment or production writes were performed. Input represents wall-clock times, not timezone-offset timestamps, and cannot express shifts of 24 hours or longer. Existing inaccurate historical totals remain untouched. Older clients sending blank lunch will receive skipped/review results once this backend is deployed; frontend and backend need coordinated deployment in a separately authorized step. The existing two-decimal rounding convention is retained.

No further business-rule decision is required for this repair after Michael's two confirmations.
