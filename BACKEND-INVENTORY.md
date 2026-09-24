# Flagship Solar — Backend Inventory

Repair Step 1 · 23 September 2026 · Repository baseline: `71d14f2`

This inventory records the current contract, not a proposed replacement. No application behavior has been changed. Production services were not called. Michael has supplied the deployed Sheets bridge and Stock source; sections 6–10 compare that source with the frontend. Live Supabase schema/RLS, deployment settings and production records remain unverified. Sections 2–3 describe the frontend contract; the initial assumptions in section 4 are superseded by the confirmed backend map in section 6.

Sources: `index.html` (API/auth 2031–2189; Job Cards 1572–1671; prices 2451–2730; proposals 2864–3480; Quotes/Xero 3484–3601; Stock 3603–3786; users 3790–3859; Timesheets 3871–4290), `supabase-client.js`, `supabase/migrations/202609080001_flagship_ops.sql`, `README.md`, `sw.js`, and the alternate full application `Flagship_Price_Updater_V3_1 (1).html`. The alternate application adds no API actions.

## 1. Deployment and transport

- Main application: static `index.html`; service worker cache `flagship-v44`. Actual production URL, deployed revision and active entry points need confirmation.
- Apps Script endpoint: `CFG.url`, stored in IndexedDB `cfg/app`; supplied through Settings or an `#s=<deployment-id>` setup link. Expected shape: `https://script.google.com/macros/s/<deployment-id>/exec`. No single production endpoint is committed.
- GET: query parameters, including `action`. `apiGet()` appends `user` and `pass` when a legacy session exists.
- POST: JSON body with `Content-Type: text/plain;charset=utf-8`. `api()` / its alias `post()` inject `user` and `pass` when signed in. Login/register send their own credentials directly. `ping` is unauthenticated.
- Common response: JSON `{ok:true,...}`; rejection `{ok:false,error:string}`. Missing/falsy `ok` is treated as failure. All table response fields below are **in addition to `ok`** and describe fields consumed by the frontend, not a complete server schema. “Acknowledgement only” means no further field is read.
- Legacy identity: `{username,pass,name,role}` persisted at `cfg/session`. UI recognizes Admin, Technician and Worker; server role enforcement is unknown. There is no legacy server logout request.
- Supabase: `window.FLAGSHIP_SUPABASE_CONFIG={url,anonKey}` loaded from ignored `supabase-config.js`. Local configuration passes the adapter's enable check; this does not establish that the production site uses the same configuration or schema. No secret values are recorded here.

## 2. Apps Script actions — all 25

Parameters exclude the common `action,user,pass` fields described above. Object shapes are defined in section 3. Empty strings are frequently sent rather than omitted.

| Action | Method | Additional request parameters | Response consumed |
|---|---|---|---|
| `ping` | GET | None; no credentials | `ok`, failure `error` |
| `register` | POST | `user`, `pass`, `name` (name defaults to username) | `status`, `message`; `Active` distinguished from pending |
| `login` | POST | `user`, `pass` | `user:{username,name,role}` |
| `me` | GET | None | `user:{name,role}` |
| `workers` | GET | None | `workers:string[]` |
| `addWorker` | POST | `name:string` | Acknowledgement only |
| `timesheets` | POST | `rows:TimesheetRow[]` | Counts `written`, `updated`, `closed`, `blocked`; queue flush reads only `ok` |
| `prices` | GET | None | `prices:Price[]`, `categories:string[]`, `types:string[]`, `defaultMarkup:number` |
| `savePrice` | POST | `item:PriceInput` | Acknowledgement only, then refetch prices |
| `deletePrice` | POST | `id` from price row | Acknowledgement only |
| `updatePriceList` | POST | `updates:[{code,price:number}]`, `source:string` (uploaded filename) | Counts `updated`, `unchanged`, `notFound` |
| `stock` | GET | None | `stock:StockRow[]`, `places:string[]`, `categories:string[]` |
| `stockCount` | POST | `place:string`, `counts:{[itemName]:number}` | `changed:number`, `unknown:array` (only length consumed) |
| `users` | GET | None | `users:[{username,name,role,status,lastSeen?}]`, `roles:string[]` |
| `setUser` | POST | `target:username`, `status`; role changes also send `role` | Acknowledgement only; statuses sent: `Active`, `Pending`, `Suspended` |
| `resetPassword` | POST | `target:username`, `newPass:string` | Acknowledgement only |
| `deleteUser` | POST | `target:username` | Acknowledgement only |
| `jobCardSave` | POST | `jobCard:JobCard`, with section `img` properties stripped recursively | Acknowledgement only; used only when Supabase is not enabled |
| `xeroStatus` | GET | None | `xero:{connected,configured,tenantName,redirectUri,clientId}` |
| `xeroSetConfig` | POST | `clientId`, `clientSecret`, `salesAccount` (may be empty) | Acknowledgement only |
| `xeroStart` | POST | `returnUrl:location.origin+location.pathname` | `authUrl` used for navigation |
| `xeroContacts` | GET | `q:string` (customer search) | `contacts:[{contactID,name,email?,number?}]` |
| `xeroItems` | GET | None | `items:[{itemID,code,name,description?}]` |
| `xeroCreateQuote` | POST | `quote:XeroQuoteInput` | `quoteID`, `quoteNumber` |
| `proposalPublish` | POST | `proposal:Proposal` | `token`, `url`, `status` (defaults locally to `SENT`) |

The frontend expects return navigation with `#xero=connected`. The supplied backend now confirms callback and proposal routes (section 7); it contains no email delivery implementation. No frontend contact creation, Xero quote update/delete, remote inspection API, or Sheet Timesheet read-back exists.

## 3. Payload and response structures

- **TimesheetRow:** `{date,worker,job,timeIn,timeOut,lunch,note}`. Date is local `YYYY-MM-DD`; times are input strings such as `07:00`; lunch may be a number or numeric string. No immutable row ID/revision/idempotency key is sent. README describes replace-by-day behavior, recalculation, closed-cycle checks and Log entries; the exact server key and formulas are unverified.
- **PriceInput:** `{id,description,category,unit,supplier,code,type,cost,markup,install,spec,active}`. New `id` is empty; type is `Cost`/`Sell`; markup can be empty or numeric. **Price response** also supplies computed `sell`; optional `xeroItemID,xeroItemCode,xeroDescription` may exist from local enrichment. The frontend adds `install` to `sell` for quotation. Default markup fallback is 20.
- **StockRow:** `{item,category,unit,[placeName]:quantity}`. Default place names are `Store`, `GWM`, `NP200`; actual names can be returned by the server. Count identity is item name, not a stable ID. Blank means uncounted; zero is an explicit count.
- **XeroQuoteInput:** `{contactID,date,expiryDate,reference,title,summary,items:[{code,xeroItemCode,description,quantity,unitAmount}]}`. Dates use ISO date strings. No explicit tax type, currency, inclusive/exclusive flag, quote ID for update, or idempotency key is sent. The screen calculates 15% VAT; server account/tax defaults must be compared.
- **JobCard:** `{id,number,customer,site,date,technicians,types,status,signature,signatureName,signedAt,created,updated,sections}`; remote conversion adds `company_id,remote_id`. Local ID is `jc-<timestamp>-<random>`; created/updated are epoch milliseconds; signedAt is ISO; signature is a PNG data URL. `types` contains section IDs below. UI writes `DRAFT`/`SUBMITTED`.

| Job Card section | Fields |
|---|---|
| `panels` | `work`, `photo` |
| `fullsolar` | `work`, `before`, `after` |
| `descale` | `location`, `before`, `after`, `notes` |
| `plug` | `before`, `after`, `notes` |
| `firmware` | `version`, `photo`, `notes` |
| `coc` | `inverterSerial,batterySerial,snags,damages,ln,ne,le,dc,fuse`; photos `roof,inverterwall,dbBefore,changeover,earthNeutral,dbAfter,railEarth,roofRoute,damagePhoto,fusePhoto` |
| `custom` | `items:[{description,photo}]` |

Photos are `{img:<JPEG data URL>,cap:string}`; legacy string photo values are also accepted by rendering. `jobCardSave` strips section `img` properties but retains the top-level signature. Supabase receives the full card including photos.

- **Proposal:** `{lang,client,address,no,date,title,by,valid,bill,tariff,panels,watt,battery,sun,invkw,strings,pick,now,prop,items,showPrices,customerEmail,xeroContact,publishToken,publishUrl,publishStatus,incl,excl,steps,terms,scope}`. Language is `en`/`af`; numeric inputs commonly remain strings. `pick` holds selected Price objects by equipment role. `items` contain `{desc,unit,sell,spec,qty}` and may include `{role,custom}`. `xeroContact` uses the contact shape above. The local proposal store ID (`VPID`) is **not** included as a separate field in this publication request; the entire `VP` object is sent.

## 4. Initial frontend-only data assumptions — superseded by section 6

Frontend API property names are not proof of exact Sheet tab/header names. Only `Users`, `Prices`, and `Log` are explicitly named as tabs by README; remaining physical storage names must be obtained from deployed code.

| Logical dataset | Evidence / expected fields | Authority or unresolved dependency |
|---|---|---|
| Users / roles | Username, name, role, status, lastSeen; password validation/reset | Documented `Users` tab; password representation and role configuration unknown |
| Worker directory | Worker names | Could be a tab, Users-derived list, or configuration; unknown |
| Timesheets / pay cycles | TimesheetRow plus calculated normal/overtime/day type | Sheet intended as accepted-record authority; headers, key, formulas, timezone and closure rules unknown |
| Audit history | Prior/new Timesheet values | Documented `Log` tab; schema and coverage unknown |
| Prices / catalogue | Price fields, categories, types, default markup | Documented `Prices` tab; category/default storage and computed columns unknown |
| Stock | Item/category/unit, one quantity column per place | Sheet intended as authority; tab names, identity and concurrency rules unknown |
| Job Cards | Metadata and signature payload | `jobCardSave` implies remote storage, but tab/file arrangement and retrieval are unknown |
| Published proposals | Full proposal snapshot, token, link, status, recipient | Storage, email implementation and acceptance record unknown |
| Xero configuration/session | Client ID/secret, sales account, tenant selection, OAuth tokens/state | UI claims server-side secret storage; Script Properties/other actual storage unknown |
| Xero contacts/items/quotes | IDs and shapes in sections 2–3 | Xero is intended remote authority; backend caching/mapping unknown |

Local-only dependencies: IndexedDB `flagship-inspections` v4 contains `jobs` (inspection reports), `clauses`, `props`, `jobcards`, `cfg`, and an unused `quotes` store. `cfg` holds `app`, `session`, `workers`, `ts-YYYY-MM` (cycle ending month), `queue`, `pricecache`, `stockcache`, `stockdraft`, `quoteDraft`, and `xeroItemsCache`. Inspections serialize `{fields,grids,sevs}` with embedded photos. No remote backup is implemented for inspections or custom clauses. Local drafts/queues may be the only copies of unsent work; preserve site data during repair. The alternate HTML opens this same database at v3.

## 5. Supabase API contract

All requests use configured `url` plus the path below, `apikey:anonKey`, and `Authorization: Bearer <session.access_token or anonKey>`. REST returns row arrays; errors are read from `message`, `error_description`, or `hint`. There is no refresh-token request, Realtime subscription, Edge Function call, or `/rest/v1/rpc/` call.

| Adapter operation | Request | Expected result / integration state |
|---|---|---|
| `signIn(email,password)` | POST `/auth/v1/token?grant_type=password`, JSON `{email,password}` | Session with `access_token,user:{id,...}`; then profile lookup. Not called by app |
| `signUp(email,password,fullName)` | POST `/auth/v1/signup`, `{email,password,data:{full_name:fullName}}` | Raw Auth response; no frontend consumer |
| `restore(saved)` | GET `/auth/v1/user` with saved access token, then profile lookup | User then `{session,user,profile}`; null on failure. Not called by app |
| Profile lookup | GET `/rest/v1/profiles?id=eq.<user.id>&select=id,full_name,preferred_language` | First row or fallback profile using user email; adapter-only |
| `signOut()` | POST `/auth/v1/logout` | No result consumed; errors swallowed. Legacy logout does not call it |
| `memberships()` | GET `/rest/v1/company_memberships?user_id=eq.<session.user.id>&active=eq.true&select=company_id,role:roles(name),companies(name,slug)` | Rows with nested `role` and `companies`; returns empty without user session. Not called by app |
| `listJobCards()` | GET `/rest/v1/job_cards?select=*&order=updated_at.desc` | Rows converted to local cards; called on Job Card list opening if configured |
| `saveJobCard(card)` | POST `/rest/v1/job_cards?on_conflict=client_id&select=representation`; JSON `{client_id:card.id,company_id:card.company_id or null,status,data:card,updated_at:ISO}` | Expects row array; `Prefer: resolution=merge-duplicates,return=representation`; called after local saves/submission |
| `uploadJobCardPhoto(id,file,type)` | POST `/storage/v1/object/job-card-photos/job-cards/<encoded-id>/<timestamp>-<random>.jpg`; raw file, content type defaults `image/jpeg`, `x-upsert:false` | Constructs `{bucket:'job-card-photos',path}` after success. Not called by app |

Authentication requirements: save/upload explicitly require `session.user`; list requests can be sent anonymously but repository RLS does not authorize normal anonymous card reads. `signIn`/`restore` must establish a Supabase identity, which legacy Apps Script login currently does not do. Company permissions depend on active membership and role/override records. Storage requires authenticated role under the supplied policies. No photo download/signed-URL/delete or `files` metadata write is implemented.

### Directly referenced relational columns

| Table | Columns required by adapter or its relational join |
|---|---|
| `profiles` | `id` (Auth user UUID), `full_name`, `preferred_language` |
| `company_memberships` | `user_id,active,company_id`; `role_id` foreign key needed for `roles` join |
| `roles` | `id` join key, `name` |
| `companies` | `id` join key, `name,slug` |
| `job_cards` | Writes `client_id,company_id,status,data,updated_at`; reads `id,client_id,status,data,updated_at,company_id`; schema defaults `id,created_by,created_at` support inserts |

Contract mismatches to compare: `select=representation` requests a nonexistent column in the committed migration; `client_id` requires a unique constraint for upsert; ordinary new cards omit company/job/customer linkage; `job_id,customer_id` are never sent as relational columns. Remote refresh overwrites local cards without revision checks. There is no delete operation or persisted sync queue.

### Migration-only foundation and RLS dependencies

These are not additional frontend API calls. The migration is the exact reference for SQL types, defaults, constraints and full policy definitions; a live schema export is needed to compare them. `id` columns below are UUID unless noted. `created_at/updated_at` are timestamptz.

| Table | Committed columns (including directly used tables for completeness) |
|---|---|
| `companies` | `id,slug,name,branding,created_at` |
| `profiles` | `id,full_name,preferred_language,created_at,updated_at` |
| `roles` | `id,name,description` |
| `permissions`, `job_capabilities` | Each: `key,description` |
| `company_memberships` | `id,company_id,user_id,role_id,active` |
| `role_permissions` | `role_id,permission_key` |
| `membership_permissions` | `membership_id,permission_key,allowed` |
| `membership_capabilities` | `membership_id,capability_key` |
| `customers` | `id,company_id,name,phone,email,address,created_at,updated_at` |
| `jobs` | `id,company_id,customer_id,title,address,location,job_type,starts_at,ends_at,instructions,status,quote_reference,xero_reference,created_by,created_at,updated_at` |
| `job_assignments` | `job_id,user_id,assignment_role,assigned_at` |
| `job_cards` | `id,client_id,company_id,job_id,customer_id,status,data,created_by,created_at,updated_at` |
| `job_card_items` | `id,job_card_id,item_type,description,quantity,unit,data,created_at` |
| `files` | `id,company_id,job_id,job_card_id,bucket,path,content_type,created_by,created_at` |
| `timesheets` | `id,company_id,job_id,user_id,arrived_at,departed_at,arrival_location,departure_location,source,notes,created_at,updated_at` |
| `calendar_events` | `id,company_id,job_id,title,starts_at,ends_at,created_by,created_at` |
| `booking_requests` | `id,requesting_company_id,owning_company_id,requested_user_id,job_id,starts_at,ends_at,status,decision_by,decision_at,authorization_code_hash,authorization_expires_at,created_at` |
| `notifications` | `id,user_id,type,payload,read_at,created_at` |
| `audit_log` | `id` (bigint identity), `company_id,actor_id,entity_type,entity_id,action,before_data,after_data,created_at` |

- Extensions: `pgcrypto`, `postgis`; location columns use geography points. `profiles.id` references `auth.users.id`; profile trigger reads `auth.users.raw_user_meta_data.full_name` / email.
- RLS helper functions: `is_company_member(target_company uuid)`, `has_permission(target_company uuid,wanted text)`, `can_access_job(target_job uuid)`; these use `auth.uid()`, memberships, permission overrides and assignments. They are not frontend RPC calls.
- Trigger functions: `create_profile()` attached to Auth user insert; `audit_booking_decision()` attached to booking update. `touch_updated_at()` is defined but unattached.
- Permission keys: `jobs.manage,jobs.view_all,calendar.manage,calendar.view_all,job_cards.review,members.manage,quotes.create`. Roles seeded: Admin, Manager, Technician, Worker; role grants are not seeded. Companies seeded: `flagship-solar`, `hi-service`.
- Job Card status constraint: `DRAFT,IN_PROGRESS,COMPLETED,REVIEWED,SUBMITTED`; frontend primarily uses DRAFT/SUBMITTED. Supabase Timesheets use timestamps/location/source, unlike the Sheet daily-row contract.
- Storage bucket: `storage.buckets` row `{id:'job-card-photos',name:'job-card-photos',public:false}`. `storage.objects` policies permit authenticated insert/select by `bucket_id` only; no per-card/company ownership condition. No update/delete policy is supplied.
- RLS is enabled on all public tables above. `files` has no policies; Job Cards have no delete policy; assignment access does not require active membership. These and cross-company constraints need comparison before enabling writes. No Supabase Prices, Stock, Quotes or Proposal tables are supplied.

## 6. Deployed Apps Script comparison — source received

Evidence labels refer to attachment line numbers, not repository files:

- **Bridge**: `87fed70e-017d-46e0-a5dc-240c15388506/pasted-text.txt`, 1–1450 approximately; supplied as the deployed Sheets bridge.
- **Stock**: `dc94740e-f36a-4e74-a1bb-13f58a28f616/pasted-text.txt`; supplied as its companion Stock script.

Both parse as JavaScript. All **25 frontend actions have matching dispatch branches**. None is missing. The Stock hooks are present in Bridge `doGet`/`doPost`. This proves source coverage, not successful execution against production settings/data.

Every authenticated operation reads `Users` through `auth_()`; table below omits that repeated read. `Log` writes are best effort and errors are swallowed. POST dispatch acquires one script-wide lock (25-second wait); GET dispatch does not. Spreadsheet access uses `SpreadsheetApp.getActiveSpreadsheet()`, not a hard-coded spreadsheet ID. A missing standard tab may invoke `setup()` implicitly.

| Frontend action | Actual backend handler / source line | Authorization | Reads → writes; request/response comparison |
|---|---|---|---|
| `ping` GET | `doGet`, Bridge 1065 | Public | No tables; `{ok:true,pong:true}` compatible; does not test Users, Sheets, Supabase or Xero health |
| `register` POST | `register_`, 429 / dispatch 1205 | Public | Users → Users, Log; `user,pass,name` match; returns status, role, message. Username ≥3/password ≥4 |
| `login` POST | `doPost`, 1207 | Any active user | Users → Last Seen, Log; user response matches |
| `me` GET | `doGet`, 1071 → `auth_` 416 | Any active user | Users read; `{user:{username,name,role}}` matches; failure classification missing on both sides |
| `workers` GET | `doGet`, 1076 | Any active user | Workers read; active names → `workers[]`, compatible |
| `addWorker` POST | `doPost`, 1214 | Admin/Technician | Workers → Workers, Log; case-insensitive deduplication; name request/response compatible |
| `timesheets` POST | `doPost`, 1230 → `writeEntry_` 577 | Active; Worker own display name; non-Admin current cycle | Timesheets → Timesheets, worker-named tabs, Summary, Log; row parameters match. Returns counts **and results[]**, which frontend ignores |
| `prices` GET | `doGet`, 1155 → `supabasePriceRows_` 643 | Admin/Technician | **Supabase `price_items`**, not Prices; expected output shape largely matches. Technician cost/type/markup omitted |
| `savePrice` POST | `doPost`, 1292 → `findPrice_` | Admin | **Prices Sheet** → Prices, Log; input matches; returns id plus added/updated. Does not change the catalogue read by `prices` |
| `deletePrice` POST | `doPost`, 1372 | Admin | Prices → Prices, Log; ID matches only if present in Sheet; Supabase-only IDs yield `no such item` |
| `updatePriceList` POST | `doPost`, 1326 | Admin | Prices → Prices, Log; updates/source match; returns counts and changes. Writes Sheet, not Supabase |
| `stock` GET | `stockGet_`, Stock 202 → `stockRows_` 68 | Any active user | Stock read; response compatible; also returns purchase price/row/count metadata to all roles |
| `stockCount` POST | `stockPost_`, Stock 211 → `stockSave_` 101 | Any active user | Stock → selected Store/GWM/NP200 column, Counted, By, Total formulas, Log; compatible parameters; frontend discards unknown counts after partial success |
| `users` GET | `doGet`, 1174 | Admin | Users read; users/roles response compatible; hashes excluded |
| `setUser` POST | `doPost`, 1383 | Admin | Users → Users, Log; target/role/status match; status is not restricted to known values |
| `resetPassword` POST | `doPost`, 1417 | Admin | Users → hash, Log; target/newPass match; minimum four characters |
| `deleteUser` POST | `doPost`, 1405 | Admin | Users → row deletion, Log; target matches; own deletion denied; Timesheets untouched |
| `jobCardSave` POST | `jobCardSave_`, 944 / dispatch 1288 | Admin/Technician/Worker | JobCards → row upsert by ID, Log; also requires date, which frontend submit validation omits; response id/number/status is ignored beyond ok |
| `xeroStatus` GET | `doGet`, 1148 → `xeroStatus_` 856 | Any active user | Script Properties read; response matches and adds taxType; frontend does not restore salesAccount/taxType settings |
| `xeroSetConfig` POST | `xeroSetConfig_`, 737 | Admin | Script Properties read/write; clientId/clientSecret/salesAccount match; omitted taxType resets it to `OUTPUT3` |
| `xeroStart` POST | `xeroStart_`, 750 | Admin | Script Properties → state/return URL; request/response match; return URL restricted only to HTTPS |
| `xeroContacts` GET | `doGet`, 1150 → `xeroContacts_` 859 | Admin/Technician | Script Properties/Xero Contacts; q and mapped contacts match; only first remote page searched |
| `xeroItems` GET | `doGet`, 1149 → `xeroItems_` 915 | Admin/Technician | Script Properties/Xero Items; shape compatible; frontend ignores active/sales defaults and only enriches local cache |
| `xeroCreateQuote` POST | `xeroCreateQuote_`, 900 | Admin/Technician | Script Properties/Xero → Xero DRAFT quote, Log; request matches; optional clientName not sent (log only); may return ok with empty quoteID |
| `proposalPublish` POST | `proposalPublish_`, 972 | Admin/Technician | Proposals → new row/token each call, Log; request/response match; **no email is sent**, despite frontend success text |

### Confirmed Sheet structures

Columns are positional; live column reordering would break the handlers. Source constants provide the intended headers:

- `Users`: Username, Display Name, Role, Status, Password Hash, Created, Last Seen.
- `Timesheets`: Date, Day, Day Type, Worker, Job / Site, Time In, Time Out, Lunch (min), Normal Hours, Overtime Hours, Total Hours, Note, Submitted By, Timestamp.
- `Workers`: Name, Active, Added.
- `Prices`: ID, Category, Supplier, Code, Description, Unit, Cost, Type, Markup %, Install Cost, Spec, Active, Updated. Still writable, **no longer used for the `prices` read**.
- `Log`: Timestamp, User, Action, Detail, Was, Now.
- `Proposals`: Token, Proposal No, Customer, Customer Email, Status, Created, Updated, Accepted At, Xero Quote ID, Xero Quote Number, Data JSON.
- `JobCards`: ID, Job Card No, Customer, Site / Job, Date, Technicians, Types, Status, Created By, Created, Updated, Data JSON.
- `Stock`: Item, Category, Unit, Last Price, Store, GWM, NP200, Total, Counted, By. Total is `SUM(Erow:Grow)`; Stock setup is separate from `setup()`.
- Worker-named derived tabs: Date, Day, Day Type, Job / Site, Time In, Time Out, Lunch (min), Normal Hours, Overtime Hours, Total Hours, Note, Submitted By, Timestamp. Names are sanitized/truncated display names, not stable IDs.
- `Summary`: Pay Cycle, Worker, Days, Normal Hours, Overtime Hours, Total Hours; cleared and rebuilt from Timesheets.

### Additional live Supabase dependency discovered

Bridge 643–696 reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Script Properties, then GETs `/rest/v1/price_items?select=*&active=eq.true&order=category.asc,description.asc`. The service-role credential stays server-side; it must not be requested or copied into this repository.

Required/mapped columns: `id` (fallback `legacy_id`), `category,supplier,code,description,description_en` (fallback `descriptionEn`/description), `unit,cost,type,markup,install_cost,spec,active,updated_at`. The bridge computes sell price; there is no tenant filter, pagination, or Sheet fallback. No price writes to Supabase exist in either supplied file. The committed migration does **not** define `price_items`. The server project URL may differ from the browser-configured project; comparison is still required. Service-role reads bypass ordinary user RLS, so multi-company price isolation cannot be assumed.

## 7. Backend routes not called by the current application

“Unused by this frontend” does not mean safe to delete. Some are deliberately public browser/callback flows or useful recovery APIs.

| Action / method | Handler, parameters and result | Data / status |
|---|---|---|
| `entries` GET | `doGet` 1087; optional worker (defaults self), cycle; returns entries[{date,job,ti,to,lu,normal,ot,note}] | Timesheets read; Worker restricted to self; not used for local recovery |
| `timesheetAll` GET | `doGet` 1108; cycle required; returns cycle and entries[worker][date] | Timesheets read; Admin/Technician; frontend never merges this authoritative data |
| `jobCards` GET | `jobCardsList_` 932; credentials; returns jobCards[] metadata plus nested data | JobCards read; Workers filtered by substring in technicians; frontend lists only local/Supabase cards |
| `jobCardDelete` POST | `jobCardDelete_` 959; id; returns ok | Admin/Technician; deletes JobCards row/logs; frontend delete is local only |
| `changePassword` POST | `doPost` 1428; credentials,newPass; returns ok | Active user; Users hash update, Log; no frontend caller |
| `stockAdd` POST | `stockPost_` → `stockAdd_`; item:{item,category,unit,price}; returns added:{item} | Admin/Technician; Stock append, totals, Log; no caller |
| `stockUpload` POST | `stockUpload_`; place,rows:[{item or description,qty}],source,reference; returns added,skipped,notFound,source,reference | Admin; adds stock quantities; no caller; no cross-request invoice deduplication |
| `xeroCreateContact` POST/GET | `xeroCreateContact_` 869; contact:{name,email?,number?}; returns created,contactID,name,email,number | Admin/Technician; Xero read/create, Log. POST implemented; GET drops contact data and always fails required-name validation |
| `proposalSendToXero` POST/GET | `proposalSendToXero_` 999; token; returns status,quoteID,quoteNumber,customer | Admin/Technician; accepted Proposals → Xero contact/quote → Proposals/Log. POST implemented; GET drops token and always fails |
| `xeroCallback` GET / any GET with code | `xeroCallback_` 764; state,code/error | Public OAuth callback, state checked; Xero token exchange/connections → Script Properties; HTML redirect; indirect legitimate use |
| `proposalView` GET | `proposalPublicHtml_` 1046; token | Public bearer-link view of Proposals; renders acceptance form; indirect legitimate use |
| `proposalAccept` GET | `proposalAccept_` 985; token,name | Public bearer-link state change; Proposals/Log; HTML acknowledgement; indirect legitimate use |

Broken GET variants arise because `doGet` constructs `body={user:p.user,pass:p.pass}` and omits other parameters. They were reproduced with mocked auth and no network calls. POST variants receive complete JSON bodies.

Spreadsheet/editor utilities, not frontend APIs: `setup`, `setupStock`, `onOpen`, `fixExistingTimes`, `rebuildWorkerTabs`, `rebuildSummary`, `reloadSuppliers`, and `testPrices`; seed/helper functions remain internally used. `reloadSuppliers` actually deletes all Africo/ITS rows then reseeds built-in values, including overwriting their custom markups despite its reassuring comment. `testPrices` inspects the Sheet, not the Supabase catalogue actually returned to the app.

## 8. Confirmed behavior and risk findings

### Authentication and startup

- `me` correctly validates the Users row, password hash and Active status; it does not depend on Xero or Supabase. Invalid credentials return `unknown user or password`; suspended/pending status returns `account not approved yet`. Server exceptions become the same `{ok:false,error:string}` envelope, with no stable authentication/transient error code.
- Frontend startup discards the saved session for **any** failed `me` while `navigator.onLine` is true. A temporary Sheets/runtime failure therefore signs the user out. Requests have no client timeout. Offline startup instead trusts cached roles. There is no server session/token: credentials are checked on every call.
- Server passwords are SHA-256 of `flagship:<lowercase username>:<password>`: predictable salt and one fast digest, not a random per-user slow password hash. Minimum length is four; no throttling is present. Frontend still stores plaintext passwords and puts them in GET URLs.
- Public registration grants Admin solely when the unused username equals configured `michael`; it is not a one-time bootstrap flag. If that username is absent/deleted, it can be registered again as Active Admin. Exploitability depends on actual Users contents.
- Worker identity is editable/display-name based. Registration accepts arbitrary display names; approving two accounts with the same display name grants the same worker Timesheet identity. An Active account with an empty/unrecognized role passes generic auth and bypasses the Timesheet restriction that tests specifically for `Worker`.
- Settings endpoint changes/setup links can forward an existing saved password to a different Apps Script deployment. This earlier frontend finding remains applicable.
- Xero configuration is genuinely Admin-protected on the server; opening the setup UI alone does not bypass it. `setUser` protects self-demotion only for nonempty role values and permits self-suspension; no last-active-admin safeguard exists.

### Timesheets and derived tabs

- Row key is normalized worker name + date; latest matching master row is updated. Server responses already include `results:[{index,date,worker,status}]` with `added,updated,unchanged,skipped,blocked,closed`. A mixed valid/blocked batch was reproduced: `ok:true` plus one result of each status. Frontend `markSent(rows)` acknowledges both; `flushQueue()` deletes the entire queue. **Backend row rejection is working; frontend acknowledgement is not.**
- Invalid date/time or blank worker can be skipped; skipped count is also ignored. Stale queued edits can overwrite newer Sheet data because there is no revision precondition. Frontend queue drains can erase rows queued during the request or replay under a different user.
- Server `calc_` reproduces the same overtime defects: with lunch=0, 04:00–05:00 and 18:00–19:00 each become 2 hours; 22:00–02:00 becomes 9. Thus incorrect totals are actually written by this backend, not merely displayed locally.
- **Additional mismatch:** blank lunch is zero on the frontend but defaults to 30 minutes on the server (07:00–17:00 previews 10 hours, persists 9.5). Time parsing lacks hour/minute range validation; overnight shifts are classified entirely by starting day.
- `writeEntry_` determines unchanged status from a formatted summary that excludes lunch itself. A lunch edit with unchanged computed hours (for example an overtime-only shift) can be acknowledged unchanged without persisting the new lunch value.
- POST locking serializes requests but does not make a batch transactional. Master writes happen before derived-tab rebuilding. A rebuild failure returns overall failure after some/all master rows are saved; frontend queues the whole batch as a connection failure.
- **Critical backend data-loss path:** worker names are accepted without reserved-tab checks. `workerSheet_('Users')` reuses the real Users tab, and `rebuildWorkerTabs()` clears its existing data then writes Timesheet rows. `Timesheets`, `Prices`, `JobCards`, etc. are likewise exposed to collisions; different sanitized/truncated names can collide too. An Admin/Technician can create such a name through the current UI; crafted Timesheet rows do not need a Workers-directory entry. This is a confirmed destructive code path, not evidence that it has occurred in production.
- `rebuildSummary()` clears its entire tab; derived worker tabs clear their data area. Manual formulas/annotations in those areas are not preserved. Logs are best effort, not a guaranteed recovery record.

### Job Cards: exact persistence path in the supplied code

1. Editing/Save writes full card, section JPEG data URLs and PNG signature to browser IndexedDB `jobcards`. New-card creation is still blocked by missing frontend `pad2_`; the same-named **server** helper cannot satisfy browser code.
2. With Supabase configured, frontend attempts Supabase `job_cards` and does **not** call the Sheet handler. Browser Supabase auth remains unwired; no successful central persistence can be established from this path. Photo upload helper is unused.
3. Only when Supabase is disabled does explicit Submit call `jobCardSave`, after removing section `img` fields. Backend upserts `JobCards` by ID, saving metadata columns and the remaining JSON in `Data JSON`. The top-level signature is retained. No Drive file, separate image upload, image URL generation, or Supabase write occurs in either Apps Script file.
4. Therefore ordinary section photographs have **only the local browser copy** through the normal Sheets path; submitting does not back them up. Larger JSON/signature payloads are written into one cell without size validation or chunking. Explicitly downloaded/shared PDFs exist only wherever the user saves them; no automatic server PDF archive exists.
5. Backend provides list/delete, but frontend never calls them. Sheet cards cannot be recovered through current UI; local delete leaves the Sheet record intact. Backend deletion removes the entire row without a tombstone.
6. Backend requires customer/site/date; frontend omits date validation. It accepts arbitrary statuses and rewrites Created By to the latest editor. Worker authorization checks whether the **incoming, user-editable** technicians string contains their name, not ownership of the existing ID. A Worker who knows another ID can submit that ID with their own name and overwrite it. Admin/Technician can overwrite/delete any card. Substring matching can also expose similarly named technicians' cards. Local status is set SUBMITTED before acknowledgement.

### Prices, Stock and Xero

- **Split price authority:** read from Supabase `price_items`, edit/delete/import against Sheet `Prices`. A Supabase ID absent from Prices causes savePrice to append a parallel Sheet row; delete fails; successful Sheet edits do not change the next fetched catalogue. No synchronization bridge exists in supplied source. Supplier updates match first code and can change Sell rows too; the loaded `type` variable is never used as a filter.
- Frontend DC selection requests category `Dc String`; backend constants/seed use `DC string`. Matching is case-sensitive, so the seeded category is missed and the hard-coded R5900 fallback used unless live data independently uses the frontend spelling.
- Stock unknown items are returned explicitly, but frontend clears their pending counts. Server writes multiple cells sequentially; partial failure is possible. All active roles receive Stock `price` (last purchase cost), even though the Prices API hides cost from Technicians. Stock ownership/restrictions are global, not company-specific.
- OAuth source includes a UUID state check, code exchange, refresh tokens stored in Script Properties, expiry-based refresh and one 401 refresh/retry. It selects the **first returned connection**, not an explicitly chosen tenant. State is global, has no expiry, and concurrent connect attempts overwrite it. GET contact/item calls can refresh shared tokens without the POST lock. `connected` only means a refresh-token property exists, not a successful connection health check.
- Requested scopes in source: `openid profile email accounting.contacts accounting.invoices offline_access`. Live consent/scopes and API responses remain unverified; no claim is made that these scopes cover every current Xero endpoint.
- Contact search and duplicate checks read only `/Contacts?page=1&pageSize=1000`, then filter locally; later pages are never searched. Item retrieval loops at most 20 pages, assuming 1000-per-page behavior; no truncation warning or rate-limit backoff. Frontend ignores returned sales account/tax/price/active metadata and stores mappings only locally; subsequent `prices` fetch replaces them.
- Direct quote creation sends selected ContactID, Description/Quantity/UnitAmount, optional ItemCode, configured AccountCode/TaxType, `LineAmountTypes:'EXCLUSIVE'`, `Status:'DRAFT'`. Generic `code` is not used as ItemCode. Tax defaults to `OUTPUT3`; actual tenant meaning must be verified against 15% shown locally.
- Xero settings response omits salesAccount; UI does not restore it. Saving settings can clear an existing account code; omitted taxType always resets to OUTPUT3. Zero quantities become one in both frontend export and backend; positive/finite prices/quantities are not rigorously validated.
- `xeroCreateQuote_` returns ok even when no QuoteID was returned. Repeated requests and uncertain responses have no idempotency protection. The global POST lock prevents overlapping POST execution, not sequential duplicate quotes. `xeroRaw_` only checks HTTP status, not quote-level validation before declaring direct success.

### Proposal publishing, acceptance and Xero conversion

- Publish appends Proposals and returns a bearer link; **no MailApp/GmailApp/email call exists**. CustomerEmail is stored only. UI's “sent” message cannot establish delivery. Each publish creates a new independent token; prior versions remain accessible/acceptable. There is no expiry check despite invalid-link wording mentioning expiration.
- Public view renders a price table and totals, not the complete local proposal/terms/scope; `showPrices` and language choice are not honored. `escXeroHtml_` escapes &, <, > but not quotes although it is used in input attributes; quote-containing customer text can break attributes and permits HTML attribute injection.
- Acceptance is unauthenticated GET with token/name, has no POST lock, identity verification or token expiry, and allows framing. `name` is returned but never persisted in row/JSON/log as accepting identity. A bearer-link holder can accept; the source does not prove intended-customer acceptance.
- Acceptance records ACCEPTED but **does not create a quote**. Separate authenticated `proposalSendToXero` is required; current frontend never invokes it or polls proposal status. That handler ignores saved `xeroContact.contactID`, re-matches by name/email and may create another contact.
- Conversion checks existing XERO DRAFT CREATED status, but remote creation followed by failed Sheet write can still duplicate on retry. It overwrites Accepted At with conversion time and leaves Updated unchanged. `sh` and `now` are assigned without local declarations. Public acceptance lacks locking and can race conversion, clearing quote-link fields with an older snapshot.

### Cross-cutting input/storage risks

Untrusted text is passed to Sheets `setValue/setValues/appendRow` without systematic formula-neutralization (names, notes, sites, descriptions). Formula-like input may be evaluated instead of retained as literal text. This is a code-level risk; live execution was not attempted. Authentication errors and business/runtime failures share a free-text envelope; global POST lock failures (`busy, try again`) also become ordinary `ok:false` failures. No production write, deletion, registration, setup or Xero call was made during this audit.

## 9. Still missing information — reduced request

The two supplied backend sources satisfy the source request; do not resend them. Remaining evidence needed for deployed-system comparison:

- [ ] Production application URL/revision and Apps Script `/exec` deployment ID/version; `appsscript.json` and actual execute-as/access/trigger settings. Confirm whether the alternate HTML is still used. The provided source establishes intended deployment code, not these settings.
- [ ] Bound spreadsheet identity, actual headers/formats and script/spreadsheet timezones; anonymized representative rows only where needed. Include current worker-tab names to check reserved-name collisions and existing backup status. Header templates are now known and need not be retyped.
- [ ] Live Supabase schema/RLS/grants/functions/storage export **including `price_items`**, and the non-secret server `SUPABASE_URL`; confirm whether it matches the browser project. Presence of the server key can be confirmed without sharing it. Include any external price sync job only if one actually exists; otherwise confirm the split has no external reconciliation.
- [ ] Non-secret Xero settings: intended/selected tenant, registered redirect URI, sales account, tax type, granted scopes. These allow confirmation of the code's first-tenant/default-tax assumptions; no secret/token values are needed.
- [ ] Confirm which production devices have unsynced cards/photos/Timesheets and which central Job Card destinations actually contain records. Code establishes the local/Sheet paths above; it cannot inspect existing data or backups. Preserve site data.

No production passwords, service-role keys, Xero secrets/tokens, full payroll/customer exports, or live write-test credentials are required for this audit or the first isolated repair.

## 10. Recommended first code repair — not implemented

**First production safety patch: prevent worker-derived tabs from touching reserved/existing business tabs.** Validate worker identity and tab destination before writing any Timesheet master row; reject reserved names, sanitized-name collisions and existing tabs whose verified schema/ownership is not a worker tab. Add a second fail-closed check inside worker-tab rebuilding. Do not rename/delete existing tabs automatically. This is a small repair within the existing architecture and addresses a source-confirmed path to erasing Users/Timesheets/Prices/JobCards data.

Acceptance checks: reserved names and sanitized collisions cause no Sheet writes; legitimate worker tabs still rebuild; existing master records and unrelated tabs remain unchanged; failure responses do not claim acceptance. Test with in-memory/fixture Sheets before deployment, then verify against a backed-up copy.

**Next frontend patch:** consume existing Timesheet `results[]`; acknowledge only added/updated/unchanged rows of the exact submitted revision, preserve skipped/blocked/closed rows, and drain only the submitted queue snapshot with a single in-flight lock. This requires no invented backend acknowledgement contract. Follow with commit-aware local saves and startup failure classification; correct both shift calculators together. Price authority and live Supabase changes require the remaining configuration/schema evidence first.

Verification performed: source parsing; automatic comparison of all 25 frontend action literals with both dispatchers (none missing); mocked GET parameter-loss checks; isolated frontend/server calculation comparisons; mocked mixed-result Timesheet batch; worker-tab collision reproduction in an in-memory Sheet stub (worker `Users` caused clearContent and setValues against the Users tab). These were local JavaScript checks, not Apps Script deployment/integration tests. No application or backend source was edited.
