# Flagship — setup

Inspections, timesheets and prices, in one app on the phone.

## Files to upload (repo root)

```
index.html            <- the whole app, logo built in
manifest.webmanifest  <- name and icon for the home screen
sw.js                 <- makes it work offline
icon-192.png
icon-512.png
.nojekyll             <- stops GitHub Pages ignoring files; keep it
```

Six files. That is all of it.

**`app.js` and `app.css` are no longer part of the app.** They belonged to the
earlier inspections-only version. `index.html` does not load them — it carries
its own styles and script. Delete them from the repo; leaving them there only
invites someone to edit the wrong file.

## What changed in this version

**The app is now called Flagship.** Home screen icon, title bar, install
prompt — all just "Flagship", not "FS Inspections".

**The letterhead no longer prints on top of the content.** The old version
positioned the logo with `position: fixed`. A fixed element is repainted on
every page but nothing reserves space for it, so from page 2 onward it landed
across the text. The whole report now sits inside one `<table class="page">`
with the letterhead in `<thead>` and the contact strip in `<tfoot>`. Browsers
repeat `thead` on every printed page **and hold its vertical space open**, so
overlap is structurally impossible.

Do not put `position: fixed` back. That is the bug.

**Photo numbers no longer skip.** Numbering counted every slot, including the
empty ones — and empty slots are not printed. That is why the old reports ran
21 → 26. Only filled slots carry a number now; empty ones read "Empty slot" on
screen and vanish from the PDF.

**Captions are stored as plain text.** `contenteditable` hands back HTML, and
the old code stored it, so `&` was escaped on save and escaped again on render.
That is where `T&amp;amp;P valve` and `The Earth bar<div>no Visible
corrosion</div>` came from. Text now goes in and out through a single escape.
Old jobs are cleaned up as they load — open one and save it once.

**The manifest pointed at icons that were not there.** It asked for
`assets/icon-192.png` while the files sit in the repo root, so the home screen
icon never loaded. Fixed to `./icon-192.png`.

**The service worker no longer caches calls to the sheet.** Requests to
`script.google.com` now always go to the network, so a stale sign-in or an old
price list can't be served from cache.

## Getting it onto phones

The app needs an **https** address. Without https the browser will not install
it to the home screen and will not run offline.

**GitHub Pages** — make a repo, drop the six files in, Settings → Pages →
deploy from main branch. You get `https://yourname.github.io/reponame/`.

**From the phone only:** sign up at github.com in Chrome → new repository, set
it **Public** → Add file → Upload files → pick all six from Downloads →
Settings → Pages → Deploy from a branch, `main`, `/ (root)` → Save.

## Installing on a phone

**Android (Chrome):** open the address → menu (⋮) → *Add to Home screen*.

**iPhone (Safari — must be Safari):** open the address → Share → *Add to Home
Screen*.

Open it once on wifi before heading to a job so the offline copy is cached.

## Exporting a report

Tap **Save as PDF** on the report screen, then in Chrome's print sheet choose
**Save as PDF**. Set *Paper size* to **A4** the first time — Chrome remembers it.

Check the first export after this update: the logo should sit above the text on
every page with a blue rule under it, and the contact strip at the foot. If the
logo is over the text, the old cached copy is still running — see below.

## After you change any file

Bump `CACHE` in `sw.js` (`flagship-v13` → `-v14`). The service worker serves the
cached copy first, so without the bump phones keep running the old version.
This upload is already on v13, so phones will pick it up on their own.

## A note on the camera on Android

Chrome on Android 14 and 15 hides the Camera tile when a file input specifies
`accept` or `capture`. The photo slots therefore use a plain
`<input type="file">` with neither attribute. If a future Chrome changes this
again, that is the line to look at.

## Where the data lives

Inspections are stored in the browser's own database on that phone. Not sent
anywhere, not backed up.

- Photos survive closing the app or the phone going flat.
- Uninstalling, clearing site data, or "clear browsing data" wipes them.
- Nothing syncs between phones.
- Export each job to PDF when you finish it. Treat the PDF as the record.

Timesheets and prices live in the Google Sheet, not on the phone.

## Accounts and roles

Everyone signs in. Accounts live in the **Users** sheet and the script checks
them on every request. The app hides buttons a role can't use, but hiding is
only tidiness — the script is what enforces it.

- **Admin** — everything, plus the Users screen and cost prices. The only one
  who can change a closed cycle.
- **Technician** — inspections, timesheets, and sell prices without the cost or
  markup behind them.
- **Worker** — their own hours only, current cycle only.

### First run

1. In `Code.gs`, set `ADMIN_USERNAME` to the username you will use.
2. Run `setup`, then deploy.
3. In the app, tap **Create account** and register with that exact username.
   You come out as Admin, Active.
4. Everyone else registers and lands as **Pending** with no role. Open
   **Users**, give them a role, then set them Active.

### Inviting the team

Once you're signed in as Admin, Settings shows an **Invite the team** link with
a Copy button. Send it on WhatsApp. They open it, add it to the home screen,
create an account — nothing to paste.

The link carries only the address of the script, not a password, and it doesn't
let anyone in by itself. Every account still waits for your approval.

## Connecting the sheet

One-time setup, on a computer:

1. Open the Google Sheet on the work account.
2. Extensions → Apps Script. Paste in all of `Code.gs`.
3. Set `ADMIN_USERNAME` at the top.
4. Run → `setup` → Run. Approve the prompts.
5. Deploy → New deployment → Web app. Execute as **Me**, access **Anyone**.
6. Copy the `/exec` URL into the app under **Connection settings**.

**"Anyone" is required** — the phones aren't signed into Google, so the script
has to accept anonymous requests. The Users sheet is what controls access.

**After changing `Code.gs`:** Deploy → Manage deployments → pencil → Version:
**New version** → Deploy. The URL stays the same. Creating a *New deployment*
instead gives you a different URL and breaks every phone.

`Code.gs` is unchanged in this update. You do not need to redeploy.

## Timesheets

The screen shows one pay cycle at a time, 25th to 24th. Arrows move between
cycles. **Fill weekdays 07:00–17:00** stamps the whole cycle, then change only
the days that differ. Weekends are shaded — every hour on them is overtime.

Days you don't fill in are not sent. Sick days and days off go in the note line.

Everything is held on the phone as you type, so a month can be entered over
several sittings. Nothing reaches the sheet until **Send to sheet**.

Sending a day that already exists **replaces** the row rather than adding a
second one, and writes a line to the **Log** sheet with the old and new values
side by side.

### How hours are worked out

- Normal day 07:00–17:00, less lunch (30 min default, editable per person)
- Started before 06:00 → those minutes are overtime
- Arrived between 06:00 and 07:00 → recorded as the real time, counted as normal
- Worked past 17:00 → overtime
- Saturday and Sunday → every hour is overtime

The app deliberately does **not** apply 1.5x or 2x. It writes a `Day Type`
column and leaves the rate maths to a formula in the sheet, where you can see it.

### If times show as 12/30/1899

Sheets treats a bare "07:00" as a time value against its own 1899 epoch. Times
are written as text now, but rows sent before that change still look wrong. Run
**Flagship → Repair time columns** once.

## Prices

A **Prices** tab holds every price the quoting engine uses. Admin can edit;
Technicians see sell prices but not cost or markup.

- **Type** — `Cost` is a supplier price and markup is added on top. `Sell` is
  already what you charge and markup is not applied.
- **Markup %** — per item. Blank uses the 20% default.
- **Install cost** — added to the item but never marked up.
- **Spec** — what the line includes, printed under it on the quote.

When Africo send a new list, open the **Prices** tab in the sheet and paste the
cost column straight in — far quicker than forty taps.

### An honest limit

The app is public HTML — anyone can read its code. Sign-in decides what a normal
user sees, and the script refuses anything a role isn't allowed. But someone
technical with valid credentials could craft requests the app itself would never
send. For a team of five who know each other this is fine. It is not a system
for keeping out a determined outsider.

## The clause library

The seeded entries have **blank clause numbers** on purpose — I can't ship
verified numbers for a paywalled standard. They point you at the right standard
from plain-language search terms: type "neutral cable too thin" and it finds
SANS 10142-1, conductor sizing.

Fill the clause number in from your own copy once, using *Add your own*. It
saves on the phone and is there from then on.
