# Calendar, stock and TimeTree request performance

The phone apps now request a calendar date window or one booking/job card rather
than downloading the complete history for each view. A derived
`TimeTreeCalendarIndex` contains view JSON without the raw source payload. It is
rebuilt lazily after an import changes data. The first request after an import
therefore still pays the indexing cost; later requests read small date metadata
and only matching booking JSON. Recurring definitions remain available for the
existing recurrence renderer. Source events, history and archives are preserved.

TimeTree credentials and session cookies remain in server Script Properties.
Calendar and photo requests share one session. Only HTTP 401 triggers one renewal;
400/403 do not. Failed login attempts use increasing cooldowns (15 minutes up to
6 hours). A repeatedly unauthorized renewed session also receives a cooldown.
This change does not establish the cause of TimeTree error -496 or guarantee that
TimeTree will accept a new login while its web endpoint is failing.

Photo manifests in the existing private Drive folder allow already archived
images to be read without TimeTree authentication. Older cached images can be
recovered by their exact booking description. Explicit refresh still requests
TimeTree. Incomplete activity pagination is rejected rather than saved as a
complete manifest. Existing media size/count limits are unchanged.

Hi Service stock changes load one catalogue snapshot, validate all movement lines,
write adjacent quantity/timestamp rows together and append audit rows in a batch.
The stock request holds a script lock. Duplicate codes, noninteger quantities,
negative stock and duplicate movement request IDs retain their prior protections.
The shared deployment now includes the version-controlled HiService.gs module.

Hi Service GETs have a 45-second deadline and share identical in-flight reads.
Writes have a deadline but are never automatically retried: timeout means the
outcome may be unknown and must be checked before resubmission.

## Validation

- 25 TimeTree/calendar/photo/session contract tests pass, including a 1,002-event
  synthetic archive where a second monthly query reads no raw-source JSON and
  only the two matching/recurring view records.
- All 47 Hi Service tests pass. A 100-line stock count reads the catalogue once
  and writes all 100 audit rows without per-item appendRow calls.
- Both apps' JavaScript/manifest syntax checks pass.
- The broad Flagship suite has existing failures on the unchanged baseline
  (staging harness, timesheet expectations, service-worker fixtures, and local
  missing git/binary asset context). The performance changes introduce no new
  failing test names versus that baseline. They are not a clean full-suite pass.
- No production speed improvement in seconds has yet been measured. Live
  TimeTree verification remains dependent on its web sign-in endpoint recovering.

Deploy the shared backend before the new frontends. Old clients retain their
legacy full-calendar API contract during rollout. The first windowed request
creates the derived index; no source migration or destructive cleanup is needed.
