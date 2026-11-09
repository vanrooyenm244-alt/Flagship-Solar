# Shared app calendar

New app bookings are stored in the Google Calendar `mjflagship@gmail.com`.
The Apps Script deployment runs as its existing owner; phones use app accounts
and never receive Google credentials. Company and assignment checks remain on
the server. Existing TimeTree events, descriptions, recurrence and photo sources
are retained and displayed alongside Google bookings.

## Activation

Deploy the updated backend to the existing Apps Script web-app deployment.
In that project's editor, select `setupGoogleCalendar` and Run as the calendar
owner. Review Google's Calendar permission prompt. This verifies Calendar access
without creating a booking. If Google reports Calendar API disabled, enable
Google Calendar API in that script's associated Cloud project / add the Calendar
advanced service, then run the check again. Publish both frontends and install
their manual Update. Use Check Google Calendar in each app.

## Operation

- Calendar opens in Month; Agenda and day drill-down remain available.
- Assign active users, use all-day or start/end times, an optional end date,
  repeat interval, job number, address and notes.
- A deterministic Google event ID prevents duplicate creates after lost replies.
- Editing requires the latest Google etag. Conflicting changes require refresh.
- Google edits and cancellations are authoritative on successful reads; stale
  mirrored bookings cannot resurrect a cancelled or moved booking.
- Native Google bookings can be assigned to an app using a title prefix
  `[Flagship Solar]` or `[Hi Service]`. Unlabelled personal events are not exposed.
- Open a Google booking in the app to edit/cancel or create/open its Job Card.
  Editing an expanded recurrence changes that occurrence; editing the series
  from an all-history search keeps its original recurrence rule by default.
- Google popup reminders are set at 30 and 5 minutes. App notification polling
  remains available; this change does not add an independent background push
  service or recreate TimeTree's chat/photo-album product.
- Photos continue to use the existing Job Card / Drive and TimeTree source
  paths. Google Calendar is not used as binary photo storage.

## Verification

`node --test tests/google-calendar.test.cjs tests/quote-job-calendar.test.cjs tests/calendar*.test.cjs tests/performance-contract.test.cjs tests/timetree.test.cjs`

52 checks pass on 9 November 2026. The Hi Service suite passes 47 checks.
The larger Flagship suite retains unrelated pre-existing failures; the complete
suite is not reported as clean. A local Chromium launch was blocked by the
executor's process/socket restrictions, so production browser verification is
performed separately after deployment. Do not equate mocked tests with a live
Google write/read.

References: Google's Calendar Events insert/list/patch documentation and extended
properties guide; TimeTree's shared calendar, recurrence and labels help pages.
https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
https://developers.google.com/workspace/calendar/api/v3/reference/events/list
https://developers.google.com/workspace/calendar/api/guides/extended-properties
https://support.timetreeapp.com/hc/en-us/articles/900004492623
https://support.timetreeapp.com/hc/en-us/articles/204010389
