# Google Sheets split migration — staging inventory (2026-10-29)

Status: **STAGING ONLY — NOT CUT OVER**. Source spreadsheet is still authoritative. Never switch reads/writes based only on these files.

Source spreadsheet ID: `1OtZIGMbX-mdaANNI9R8Ly9yFWlsYnME76eUCPCfD55w`
Destination account: `mjflagship@gmail.com`
Root folder ID: `1zTcp43h_dOGL-ec6l33uleNNkzSSJyC1`
Flagship folder ID: `1mOy5toEGoHOy0vChvMnl2jTMeNxsv65e`
Hi Service folder ID: `1CQF8V_ADBjCWPKCom0PrGelyKPdruurs`
Backups folder ID: `1lnT05p64r3aaS7I2-DQq2XKAL0fVyfxp`

## Copied source tabs (each currently a separate staging workbook)

| Source tab | New staging spreadsheet ID |
| --- | --- |
| Timesheets | `1ODBQHmm6K8l8G7BRI4yQXNtEGZ2KU52Evk13KfmXMx8` |
| Timesheet Audit | `1l3UeQAI9V3G4NKtIR9kt-cQr5qLW29p6uKn_hhWlq_Y` |
| Timesheet Approvals | `1WvDoU0APaV51rq0OwM1Ffq1wCerWqQzoV9_KP_pqRJg` |
| Hi Clock Events | `1nwWJRCZPECEZg-mkd7kYRYmuY_fan5NqHC1UqbNTlcA` |
| TimeTreeEvents | `1s_9tB67giobdXUZ0poGlKChDLEkDYRXET8IoupxcBzk` |
| TimeTreeHistory | `1e2kBkl3BQ5pDDmp_ydQBIWk-j0RoEsKIP1DDGLP1O94` |
| Stock | `1zhWI_SYGYo275o9r19WtKJhuEsjjYSDFieiI3x5F9ME` |
| Stock_Counts | `1aj7stY5JWY5ztlfAkwGJJ9Gm6OW8_eAe9vubGqcJin8` |
| HiService_Stock | `14LGYSmY0TNGOqfaKEe3cnujE4FVApm1tu9vSWkHWxQs` |
| HiService_Stock_Counts | `1Lwdpos3Uswtf97HRCJV3PbStJoJGiceIoo5nAh6arvc` |
| HiService_Stock_Movements | `1Zqc2R3GYGX7AN-9Oz-x6edj4W1Bp4SdyYQsoH7gWGhw` |

## Known incomplete items

- `TimeTreeSourceArchive` copy failed; source must remain available.
- These copies are snapshot tabs, not synchronized.
- Several other live tabs (Users, UserPermissions, worker tabs, JobCards, Prices, Proposals, Logs, etc.) not migrated.
- Existing modules mostly use `SpreadsheetApp.getActiveSpreadsheet()` or `sheet_()`; do not deploy individual routing edits without auditing every reader/writer.
- The six initially created per-company workbooks are empty placeholders. Do not confuse them with the staged copies.
- Cross-company scheduling data needs tenant-aware routing and preservation of source IDs.
- A script deployment and live verification are still required.

## Cutover checklist (must all pass)

1. Establish complete tab inventory with row counts, formulas, headers, validations, and fingerprints.
2. Back up entire original workbook; prove recovery.
3. Assemble the per-module destination workbooks, preserving all supporting tables; reconcile and verify counts.
4. Implement and test an explicit routing layer for every endpoint and scheduled trigger.
5. Handle clock-in, approvals, duplicate events, worker sheets, permissions, audits, and TimeTree import, including concurrent writes.
6. Dual-write or briefly freeze writes, reconcile changes since staging snapshot, and validate.
7. Deploy Apps Script with correct authorized account, test all endpoints, then switch production.
8. Retain the old workbook and defined rollback procedure.
