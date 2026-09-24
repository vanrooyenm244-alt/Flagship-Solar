/**
 * Flagship Solar — Sheets bridge
 * ==================================================================
 * SETUP
 *   1. Set ADMIN_USERNAME below to the username you will register with.
 *   2. Run  setup()  once. Approve the prompts.
 *   3. Deploy > New deployment > Web app
 *        Execute as:      Me
 *        Who has access:  Anyone
 *      Copy the /exec URL into the app's Settings screen.
 *
 * "Anyone" is required because phones are not signed into Google.
 * Access is controlled by the Users sheet and checked on every request
 * here in the script — not in the app. The app only hides buttons;
 * this file is what actually decides.
 *
 * AFTER CHANGING ANYTHING HERE
 *   Deploy > Manage deployments > pencil > Version: New version > Deploy
 *   The URL stays the same. Without this, the old code keeps running.
 * ==================================================================
 */

// The first person to register with this username becomes Admin.
// Everyone else lands as Pending until you approve them.
var ADMIN_USERNAME = 'michael';

// Normal working day. Anything outside counts as overtime.
var DAY_END       = 17 * 60;   // 17:00
var OT_BEFORE     = 6 * 60;    // only earlier than 06:00 earns overtime
var LUNCH_DEFAULT = 30;

var ROLES = ['Admin', 'Technician', 'Worker'];

var SHEETS = {
  Users: ['Username', 'Display Name', 'Role', 'Status', 'Password Hash', 'Created', 'Last Seen'],
  Timesheets: [
    'Date', 'Day', 'Day Type', 'Worker', 'Job / Site',
    'Time In', 'Time Out', 'Lunch (min)',
    'Normal Hours', 'Overtime Hours', 'Total Hours',
    'Note', 'Submitted By', 'Timestamp'
  ],
  Workers: ['Name', 'Active', 'Added'],
  Prices: ['ID', 'Category', 'Supplier', 'Code', 'Description', 'Unit',
           'Cost', 'Type', 'Markup %', 'Install Cost', 'Spec', 'Active', 'Updated'],
  Log: ['Timestamp', 'User', 'Action', 'Detail', 'Was', 'Now'],
  Proposals: ['Token','Proposal No','Customer','Customer Email','Status','Created','Updated','Accepted At','Xero Quote ID','Xero Quote Number','Data JSON'],
  JobCards: ['ID','Job Card No','Customer','Site / Job','Date','Technicians','Types','Status','Created By','Created','Updated','Data JSON']
};

/* Categories the quoting engine understands. The engine keys off these,
   so adding one here is what makes it available on the quote screen. */
var CATEGORIES = ['Inverter', 'Battery', 'Panel', 'Heat pump', 'Changeover',
                  'Roof structure', 'DC string', 'Labour', 'Consumable', 'Other'];

// Applied when an item leaves Markup % blank.
var DEFAULT_MARKUP = 20;

/* 'Cost'  = a supplier price; markup gets added.
   'Sell'  = already your selling price; markup is NOT added.
   Getting this wrong is how a R5900 board quotes at R7080. */
var PRICE_TYPES = ['Cost', 'Sell'];

var WORKER_COLS = [
  'Date', 'Day', 'Day Type', 'Job / Site',
  'Time In', 'Time Out', 'Lunch (min)',
  'Normal Hours', 'Overtime Hours', 'Total Hours',
  'Note', 'Submitted By', 'Timestamp'
];

var SEED_WORKERS = ['Frank', 'Michael', 'Jacobus', 'Ian', 'Sangwani'];
var MONTHS_ = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var DAYS_ = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* ================= setup ================= */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var want = SHEETS[name];
    var lastCol = sh.getLastColumn();
    var have = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    want.forEach(function (h, i) { if (have[i] !== h) sh.getRange(1, i + 1).setValue(h); });
    sh.getRange(1, 1, 1, want.length).setFontWeight('bold')
      .setBackground('#1F4E79').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  });

  var u = ss.getSheetByName('Users');
  u.setColumnWidth(1, 130); u.setColumnWidth(2, 150);
  try { u.hideColumns(5); } catch (e) {}   // password hashes

  fixFormats_();

  var w = ss.getSheetByName('Workers');
  if (w.getLastRow() < 2) {
    var now = new Date();
    w.getRange(2, 1, SEED_WORKERS.length, 3)
     .setValues(SEED_WORKERS.map(function (n) { return [n, 'Yes', now]; }));
  }

  var pr = ss.getSheetByName('Prices');
  pr.setColumnWidth(5, 260); pr.setColumnWidth(11, 160);
  if (pr.getLastRow() < 2) { seedPrices_(); seedSuppliers_(); }

  var s1 = ss.getSheetByName('Sheet1');
  if (s1 && ss.getSheets().length > 1 && s1.getLastRow() === 0) ss.deleteSheet(s1);

  log_('system', 'setup', 'sheets checked', '', '');
  return 'Setup done.';
}

/** Times are written as text; tell Sheets to leave them alone. */
function fixFormats_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var ts = ss.getSheetByName('Timesheets');
  if (ts && ts.getMaxRows() > 1) {
    ts.getRange(2, 6, ts.getMaxRows() - 1, 2).setNumberFormat('@');   // Time In / Out
    ts.getRange(2, 1, ts.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  }

  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (['Timesheets','Users','Workers','Log','Summary','Sheet1'].indexOf(name) !== -1) return;
    if (sh.getMaxRows() < 2) return;
    if (String(sh.getRange(1, 1).getValue()) !== 'Date') return;      // only worker tabs
    sh.getRange(2, 5, sh.getMaxRows() - 1, 2).setNumberFormat('@');   // Time In / Out
    sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  });
}

/** Repairs times already written as 1899 datetimes. */
function fixExistingTimes() {
  preflightWorkerTabs_([]);
  var sh = sheet_('Timesheets');
  var n = sh.getLastRow() - 1;
  if (n < 1) return 'No data.';

  fixFormats_();
  var rng = sh.getRange(2, 6, n, 2);
  var vals = rng.getValues();
  var changed = 0;

  var out = vals.map(function (r) {
    return r.map(function (v) {
      if (v instanceof Date) {
        changed++;
        return pad2_(v.getHours()) + ':' + pad2_(v.getMinutes());
      }
      return String(v);
    });
  });

  if (changed) rng.setValues(out);
  rebuildWorkerTabs();
  return 'Repaired ' + changed + ' time cells.';
}

/* Your own fixed prices, from QU-0475. These are Sell prices — what you
   charge — so no markup is added. Supplier lists (Africo, ITS) go in as
   Cost and get marked up. */
function seedPrices_() {
  var now = new Date();
  var seed = [
    ['Changeover', 'Flagship', '', 'AC Switch gear — 40A single phase',
     'each', 5900, 'Sell', '', 0,
     '18way steel DB board, 4x 40A D/P breakers, 1x 40A changeover switch, 2x pilot lights, cables to and from inverter'],
    ['Changeover', 'Flagship', '', 'AC Switch gear — 3 phase 30/50kW',
     'each', 13500, 'Sell', '', 0, 'Three phase changeover assembly'],
    ['DC string', 'Flagship', '', 'DC Switch gear — one string',
     'each', 5900, 'Sell', '', 0,
     '18way DB board, 30m 6mm DC cable red & black, MC4 connectors, 1x DC surge, 1x 16A DC breaker, DC disconnect'],
    ['Roof structure', 'Flagship', '', 'Roof structure — tiles',
     'per panel', 450, 'Sell', '', 0, 'Roof hooks, rails, end clamps, mid clamps'],
    ['Roof structure', 'Flagship', '', 'Roof structure — kliplock',
     'per panel', 450, 'Sell', '', 0, 'Kliplock brackets, rails, clamps'],
    ['Roof structure', 'Flagship', '', 'Roof structure — hanger bolts',
     'per panel', 600, 'Sell', '', 0, 'Hanger bolts, rails, clamps'],
    ['Consumable', 'Flagship', '', 'Installation hardware',
     'per job', 3000, 'Sell', '', 0,
     'Consumables, screws, bootlaces, trunking, sealant, stainless bolts & nuts'],
    ['Labour', 'Flagship', '', 'Labour — 5kW system', 'per job', 8500, 'Sell', '', 0, 'Suggested'],
    ['Labour', 'Flagship', '', 'Labour — 8kW system', 'per job', 12500, 'Sell', '', 0, 'Suggested'],
    ['Labour', 'Flagship', '', 'Labour — 12kW system', 'per job', 16400, 'Sell', '', 0, 'Suggested'],
    ['Panel', '', '', 'Solar panel', 'per watt', 2.15, 'Cost', 20, 0,
     'Cost per watt. Multiply by panel wattage.']
  ];
  var rows = seed.map(function (s) {
    return [priceId_(), s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9], 'Yes', now];
  });
  sheet_('Prices').getRange(2, 1, rows.length, 13).setValues(rows);
  log_('system', 'seedPrices', rows.length + ' items', '', '');
}

/* Supplier lists as uploaded. These are Cost prices — markup is added.
   Africo: TRADE PRICE column (18% account discount already applied),
   from the June 2026 list. ITS heat pumps: Dealer's Price, November 2025.
   Both change often. Update them in the Prices tab or on the app's
   Prices screen; nothing here needs editing. */
function seedSuppliers_() {
  var listDate = new Date();
  var seed = [
    ['Inverter', 'Africo', 'SUN-5K-SG01LP-EU', 12320, 'each', 'Cost', '', 0, '', 'Deye - 5Kw Single Phase Hybrid Inverter'],
    ['Inverter', 'Africo', 'SUN-6K-SG04LP1-EU', 13440, 'each', 'Cost', '', 0, '', 'Deye - 6Kw Single Phase Hybrid Inverter'],
    ['Inverter', 'Africo', 'SUN-8K-SG01LP1-EU', 17920, 'each', 'Cost', '', 0, '', 'Deye - 8Kw Single Phase Hybrid Inverter'],
    ['Inverter', 'Africo', 'SUN-10K-SG02LP1-EU-AM3', 23520, 'each', 'Cost', '', 0, '', 'Deye - 10Kw Single Phase Hybrid Inverter'],
    ['Inverter', 'Africo', 'SUN-12K-1PHASE', 26320, 'each', 'Cost', '', 0, '', 'Deye - 12Kw Single Phase Hybrid Inverter'],
    ['Inverter', 'Africo', 'SUN-12K-SG04LP3', 26320, 'each', 'Cost', '', 0, '', 'Deye - 12Kw Three Phase Hybrid Inverter'],
    ['Inverter', 'Africo', 'SUN-15K-SG01LP1-EU', 30800, 'each', 'Cost', '', 0, '', 'Deye - 15kW Three Phase Hybrid Inverter'],
    ['Inverter', 'Africo', 'SUN-16K-SG01LP1-EU', 33040, 'each', 'Cost', '', 0, '', 'Deye - 16kW Single Phase Hybrid Inverter'],
    ['Inverter', 'Africo', 'SUN-18-1P', 37520, 'each', 'Cost', '', 0, '', 'Deye - 18kW Single Phase Hybrid Inverter'],
    ['Inverter', 'Africo', 'SUN-20K-SG05LP3-EU-SM2', 43120, 'each', 'Cost', '', 0, '', 'Deye - 20kW Three Phase Hybrid Inverter LV'],
    ['Inverter', 'Africo', 'SUN-20K-SG01HP3-EU', 31360, 'each', 'Cost', '', 0, '', 'Deye - 20kW Three Phase Hybrid Inverter HV'],
    ['Inverter', 'Africo', 'SUN-30K-SG01HP3-EU', 45920, 'each', 'Cost', '', 0, '', 'Deye - 30kW Three Phase Hybrid Inverter HV'],
    ['Inverter', 'Africo', 'SUN-50K-SG01HP3-EU', 66080, 'each', 'Cost', '', 0, '', 'Deye - 50kW Three Phase Hybrid Inverter HV'],
    ['Inverter', 'Africo', 'SUN-80K-SG01HP3-EU', 98560, 'each', 'Cost', '', 0, '', 'Deye - 80kW Three Phase Hybrid Inverter HV'],
    ['Inverter', 'Africo', 'SUN-125K-SG01HP3-EU', 140000, 'each', 'Cost', '', 0, '', 'Deye - 125kW Three Phase Hybrid Inverter HV'],
    ['Inverter', 'Africo', 'DEYE-6KW-OG', 6720, 'each', 'Cost', '', 0, '', 'Deye - 6Kw Off Grid inverter IP65'],
    ['Inverter', 'Africo', 'S6-EH1P6K-L-PLUS', 12305.22, 'each', 'Cost', '', 0, '', 'Solis S6 6kw single phase hybrid inverter'],
    ['Inverter', 'Africo', 'S6-EH1P8K-L-PLUS', 17767.68, 'each', 'Cost', '', 0, '', 'Solis S6 8kw single phase hybrid inverter'],
    ['Inverter', 'Africo', 'S6-EH1P10K-L-PLUS(21A)', 21156.80, 'each', 'Cost', '', 0, '', 'Solis S6 10kw single phase hybrid inverter'],
    ['Inverter', 'Africo', 'S6-EH1P12K03-NV-YD-L', 23050.72, 'each', 'Cost', '', 0, '', 'Solis S6 12kw single phase hybrid inverter'],
    ['Inverter', 'Africo', 'S6-EH1P16K03-NV-YD-L', 32556.38, 'each', 'Cost', '', 0, '', 'Solis S6 16kw single phase hybrid inverter'],
    ['Inverter', 'Africo', 'S6-EH3P18K02-NV-YD-L', 31380.16, 'each', 'Cost', '', 0, '', 'Solis S6 18kw three phase hybrid inverter'],
    ['Inverter', 'Africo', 'S6-EH3P30K-H', 38541.44, 'each', 'Cost', '', 0, '', 'Solis S6 30kw 3Ph Hybrid Inverter'],
    ['Inverter', 'Africo', 'S6-EH3P50K-H', 58876.61, 'each', 'Cost', '', 0, '', 'Solis S6 50kw 3Ph Hybrid Inverter'],
    ['Inverter', 'Africo', 'LUX-SNA5000WPV', 5824, 'each', 'Cost', '', 0, '', 'LuxPower - Inverter 5Kw Eco Hybrid / Off Grid'],
    ['Inverter', 'Africo', 'LUX-SNA6000WPV', 6048, 'each', 'Cost', '', 0, '', 'LuxPower - Inverter 6Kw Eco Hybrid / Off Grid'],
    ['Inverter', 'Africo', 'LUX-SNA12000WPV-WB', 14560, 'each', 'Cost', '', 0, '', 'LuxPower - Inverter 12Kw Eco Hybrid with breaker'],
    ['Inverter', 'Africo', 'LUX-LXP6K-LV', 10640, 'each', 'Cost', '', 0, '', 'LuxPower - Inverter 6Kw Hybrid Single Phase'],
    ['Inverter', 'Africo', 'LUX-LXP-LB10K', 17360, 'each', 'Cost', '', 0, '', 'LuxPower - Inverter 10Kw Hybrid Single Phase'],
    ['Inverter', 'Africo', 'LUX-GEN2-LB12K', 18480, 'each', 'Cost', '', 0, '', 'LuxPower - Inverter 12Kw Hybrid Single Phase Gen2'],
    ['Inverter', 'Africo', 'LUX-12-3P-HV', 28000, 'each', 'Cost', '', 0, '', 'LuxPower - Inverter 20Kw Hybrid 3Phase HV'],
    ['Inverter', 'Africo', 'VOLTA-LV-12', 28560, 'each', 'Cost', '', 0, '', 'Volta - 12kW Single Phase Hybrid Inverter'],
    ['Inverter', 'Africo', 'VOLTA-LV-15', 34160, 'each', 'Cost', '', 0, '', 'Volta - 15kW Three Phase Hybrid Inverter'],
    ['Battery', 'Africo', 'DEYE-LV-5.32-SE-G', 12320, 'each', 'Cost', '', 0, '', 'Deye - Battery Lithium Ion SE-G 5.32kWh 51.2V 100Ah'],
    ['Battery', 'Africo', 'DEYE-SE-F5.1', 11760, 'each', 'Cost', '', 0, '', 'Deye - Battery SE-F 5.12kWh'],
    ['Battery', 'Africo', 'DEYE-SE-F5.1-PLUS', 12320, 'each', 'Cost', '', 0, '', 'Deye - Battery SE-F PLUS 5.12kWh'],
    ['Battery', 'Africo', 'DEYE-RW-G/F-10.6', 23520, 'each', 'Cost', '', 0, '', 'Deye - Battery RW-F/G 10,6kWh'],
    ['Battery', 'Africo', 'DEYE-LV-11,8', 24080, 'each', 'Cost', '', 0, '', 'Deye - Battery Lithium Ion 11,8kWh 51V 208Ah'],
    ['Battery', 'Africo', 'DEYE-LV-16', 28000, 'each', 'Cost', '', 0, '', 'Deye - Battery Lithium Ion SE-F16 16kWh'],
    ['Battery', 'Africo', 'DEYE-HV-5.12-BOS-G', 13440, 'each', 'Cost', '', 0, '', 'Deye - Battery High Voltage 5.12kWh BOS-G Pro'],
    ['Battery', 'Africo', 'DEYE-HV-7.68-BOS-A', 19040, 'each', 'Cost', '', 0, '', 'Deye - Battery High Voltage 7.68kWh BOS-A'],
    ['Battery', 'Africo', 'DEYE-HV-14,3-BOS-B', 27440, 'each', 'Cost', '', 0, '', 'Deye - Battery High Voltage 14,3kWh BOS-B Single'],
    ['Battery', 'Africo', 'DYN-DL-2,5', 5992, 'each', 'Cost', '', 0, '', 'Dyness - Battery Lithium Ion DL 2,56kWh'],
    ['Battery', 'Africo', 'DYN-DL5.0-1C', 11760, 'each', 'Cost', '', 0, '', 'Dyness - Battery Lithium Ion DL5 5.12kWh 10yr'],
    ['Battery', 'Africo', 'DYN-DL-PRO', 11200, 'each', 'Cost', '', 0, '', 'Dyness - Battery Lithium Ion DL PRO 5.12kWh'],
    ['Battery', 'Africo', 'DYN-PB-10,2', 22960, 'each', 'Cost', '', 0, '', 'Dyness - Battery Lithium Ion 10,24kWh PowerBox Pro'],
    ['Battery', 'Africo', 'DYN-PB-14,3', 26880, 'each', 'Cost', '', 0, '', 'Dyness - Battery Lithium Ion 14,3kWh PowerBrick'],
    ['Battery', 'Africo', 'DYN-PB-16,07', 28000, 'each', 'Cost', '', 0, '', 'Dyness - Battery Lithium Ion 16,076kWh PowerBrick MAX'],
    ['Battery', 'Africo', 'HINAESS-POWERGEM', 10640, 'each', 'Cost', '', 0, '', 'Hina ESS - Battery Lithium Ion 5.1kWh PowerGem'],
    ['Battery', 'Africo', 'HINAESS-POWERGEMPLUS', 24080, 'each', 'Cost', '', 0, '', 'Hina ESS - Battery Lithium Ion 14.3kWh PowerGemPlus'],
    ['Battery', 'Africo', 'VOLTA-S1-2NDGEN', 10976, 'each', 'Cost', '', 0, '', 'Volta - Battery Lithium Ion 5.1kW 48V 100Ah Stage 1 2nd Gen'],
    ['Battery', 'Africo', 'VOLTA-S3-2NDGEN', 20160, 'each', 'Cost', '', 0, '', 'Volta - Battery Lithium Ion 10.2kW 48V 200Ah Stage 3 2nd Gen'],
    ['Battery', 'Africo', 'VOLTA-S4-2NDGEN', 24640, 'each', 'Cost', '', 0, '', 'Volta - Battery Lithium Ion 14.3kW 51.2V 200Ah Stage 4 2nd Gen'],
    ['Battery', 'Africo', 'SDA10-48100', 10080, 'each', 'Cost', '', 0, '', 'Shoto - Battery Lithium Ion 5.1kW 48V 100Ah'],
    ['Battery', 'Africo', 'SHOTO-16', 22400, 'each', 'Cost', '', 0, '', 'Shoto - Battery Lithium Ion 16,07kW'],
    ['Battery', 'Africo', 'SMDSS4143', 44788.80, 'each', 'Cost', '', 0, '', 'Solar MD - Battery Lithium Ion 14.3kWh 51.2V'],
    ['Heat pump', 'ITS', 'ITS-3.6HD', 10810, 'each', 'Cost', '', 15000, 'Includes pipes, fittings and installation', 'ITS-3.6HD 3.6kW domestic heat pump'],
    ['Heat pump', 'ITS', 'ITS-4.5HDsuper', 12595, 'each', 'Cost', '', 15000, 'Includes pipes, fittings and installation', 'ITS-4.5HDsuper 4.5kW high temp domestic heat pump'],
    ['Heat pump', 'ITS', 'ITS-5.4HD', 12070, 'each', 'Cost', '', 15000, 'Includes pipes, fittings and installation', 'ITS-5.4HD 5.4kW domestic heat pump'],
    ['Heat pump', 'ITS', 'ITS-6.3HDsuper', 14233, 'each', 'Cost', '', 15000, 'Includes pipes, fittings and installation', 'ITS-6.3HDsuper 6.3kW high temp domestic heat pump'],
    ['Heat pump', 'ITS', 'ITS-7.6HD', 13750, 'each', 'Cost', '', 15000, 'Includes pipes, fittings and installation', 'ITS-7.6HD 7.6kW domestic heat pump'],
    ['Heat pump', 'ITS', 'ITS-11HD', 18895, 'each', 'Cost', '', 0, '', 'ITS-11HD 11kW heat pump 1 Phase'],
    ['Heat pump', 'ITS', 'ITS-22HD3', 28345, 'each', 'Cost', '', 0, '', 'ITS-22HD3 22kW heat pump 3 Phase'],
    ['Heat pump', 'ITS', 'ITS-50VD3pro', 88195, 'each', 'Cost', '', 0, '', 'ITS-50VD3pro 50kW heat pump 3 Phase'],
  ];
  var rows = seed.map(function (s) {
    // [category, supplier, code, cost, unit, type, markup, install, spec, description]
    return [priceId_(), s[0], s[1], s[2], s[9], s[4], s[3], s[5], s[6], s[7], s[8], 'Yes', listDate];
  });
  sheet_('Prices').getRange(sheet_('Prices').getLastRow() + 1, 1, rows.length, 13).setValues(rows);
  log_('system', 'seedSuppliers', rows.length + ' items', '', '');
  return rows.length;
}

/** Wipes Africo and ITS rows and re-seeds them from the built-in lists.
 *  Your own prices, markups and any items you added are left alone. */
function reloadSuppliers() {
  var sh = sheet_('Prices');
  var all = priceRows_();
  var kill = all.filter(function (p) {
    return p.supplier === 'Africo' || p.supplier === 'ITS';
  }).map(function (p) { return p.row; }).sort(function (a, b) { return b - a; });
  kill.forEach(function (r) { sh.deleteRow(r); });
  var n = seedSuppliers_();
  return 'Removed ' + kill.length + ', loaded ' + n + '.';
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Flagship')
    .addItem('Rebuild summary', 'rebuildSummary')
    .addItem('Rebuild worker tabs', 'rebuildWorkerTabs')
    .addItem('Repair time columns', 'fixExistingTimes')
    .addItem('Reload supplier price lists', 'reloadSuppliers')
    .addSeparator()
    .addItem('Check sheets / setup', 'setup')
    .addToUi();
}

/* ================= helpers ================= */

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) { setup(); sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
  return sh;
}

function log_(user, action, detail, was, now) {
  try { sheet_('Log').appendRow([new Date(), user || '', action, detail || '', was || '', now || '']); }
  catch (e) {}
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Salted SHA-256, so the sheet never holds a readable password. */
function hash_(username, password) {
  var raw = 'flagship:' + String(username).toLowerCase() + ':' + String(password);
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function dateStr_(d) {
  if (d instanceof Date) return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
  return String(d);
}

/* Repair 3: keep this calculation core identical in index.html and Code.gs.
 * Wall-clock minutes; an earlier end means the following day, equal times
 * mean zero duration. The starting date classifies the entire shift.
 * Weekday lunch comes only from normal time; excess requires review. */
function shiftMinutes_(value) {
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  var p=value.split(':'), h=Number(p[0]), m=Number(p[1]);
  return h<24 && m<60 ? h*60+m : null;
}
function shiftCalculation_(dateStr,inStr,outStr,lunchMin,dayNames,normalStart,normalEnd) {
  function invalid(message){return {error:message};}
  if(typeof dateStr!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))return invalid('Enter a valid shift date.');
  // UTC is used only for calendar validation/day-of-week, not elapsed time.
  var date=new Date(dateStr+'T00:00:00Z');
  if(isNaN(date.getTime())||date.toISOString().slice(0,10)!==dateStr)return invalid('Enter a valid shift date.');
  var a=shiftMinutes_(inStr), b=shiftMinutes_(outStr);
  if(a===null||b===null)return invalid('Enter valid start and end times (00:00 to 23:59).');
  if(b<a)b+=1440;
  if((typeof lunchMin!=='number'&&typeof lunchMin!=='string')||String(lunchMin).trim()===''||!isFinite(Number(lunchMin))||Number(lunchMin)<0)
    return invalid('Enter explicit lunch minutes (0 is valid).');
  var lunch=Number(lunchMin), elapsed=b-a;
  if(lunch>elapsed)return invalid('Review required: lunch exceeds the actual shift duration.');
  var day=date.getUTCDay(), dayType=day===0?'Sunday':(day===6?'Saturday':'Weekday');
  var normal=0, overtime=0;
  if(dayType==='Weekday'){
    // Intersect [start,end) with each day's [06:00,17:00) window.
    for(var offset=0;offset<b;offset+=1440){
      normal+=Math.max(0,Math.min(b,offset+normalEnd)-Math.max(a,offset+normalStart));
    }
    overtime=elapsed-normal;
    if(lunch>normal)return invalid('Review required: weekday lunch exceeds normal-time minutes. No excess has been assigned to overtime.');
    normal-=lunch;
  }else{
    overtime=elapsed-lunch;
  }
  var hours=function(minutes){return Math.round(minutes/60*100)/100;};
  return {day:dayNames[day],dayType:dayType,lunch:lunch,
          normal:hours(normal),overtime:hours(overtime),total:hours(elapsed-lunch)};
}
function mins_(hhmm){return shiftMinutes_(hhmm);}
function shiftTimeText_(value){
  return value instanceof Date ? pad2_(value.getHours())+':'+pad2_(value.getMinutes()) : value;
}
function calc_(dateStr,inStr,outStr,lunchMin){
  var result=shiftCalculation_(dateStr,shiftTimeText_(inStr),shiftTimeText_(outStr),lunchMin,DAYS_,OT_BEFORE,DAY_END);
  return result.error?null:result;
}
function shiftReviewReason_(dateStr,inStr,outStr,lunchMin){
  return shiftCalculation_(dateStr,shiftTimeText_(inStr),shiftTimeText_(outStr),lunchMin,DAYS_,OT_BEFORE,DAY_END).error||'';
}

/** Pay cycle runs the 25th to the 24th. Named by the month it ends in. */
function cycleOf_(d) {
  var y = d.getFullYear(), m = d.getMonth();
  if (d.getDate() >= 25) { m++; if (m > 11) { m = 0; y++; } }
  return { y: y, m: m };
}
function cycleKey_(c) { return c.y + '-' + pad2_(c.m + 1); }
function cycleLabel_(y, m) {
  var sm = m - 1; if (sm < 0) sm = 11;
  return '25 ' + MONTHS_[sm] + ' - 24 ' + MONTHS_[m] + ' ' + y;
}
function isCurrentCycle_(ds) {
  var d = new Date(ds + 'T00:00:00');
  if (isNaN(d)) return false;
  return cycleKey_(cycleOf_(d)) === cycleKey_(cycleOf_(new Date()));
}

/* ================= users ================= */

function findUser_(username) {
  var sh = sheet_('Users');
  var n = sh.getLastRow() - 1;
  if (n < 1) return null;
  var rows = sh.getRange(2, 1, n, 7).getValues();
  var key = String(username).trim().toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === key) {
      return { row: i + 2, username: String(rows[i][0]), name: String(rows[i][1]),
               role: String(rows[i][2]), status: String(rows[i][3]), hash: String(rows[i][4]) };
    }
  }
  return null;
}

/** Every request goes through here. Returns the user or throws. */
function auth_(body, needRole) {
  var u = findUser_(body.user || '');
  if (!u) throw new Error('unknown user or password');
  if (u.hash !== hash_(u.username, body.pass || '')) throw new Error('unknown user or password');
  if (u.status.toLowerCase() !== 'active') throw new Error('account not approved yet');

  if (needRole) {
    var need = [].concat(needRole);
    if (need.indexOf(u.role) === -1) throw new Error('not allowed');
  }
  return u;
}

function register_(body) {
  var username = String(body.user || '').trim();
  var pass = String(body.pass || '');
  var name = String(body.name || '').trim() || username;

  if (username.length < 3) throw new Error('username must be at least 3 characters');
  if (pass.length < 4) throw new Error('password must be at least 4 characters');
  if (findUser_(username)) throw new Error('that username is taken');

  var isFirst = username.toLowerCase() === String(ADMIN_USERNAME).toLowerCase();
  var role = isFirst ? 'Admin' : '';
  var status = isFirst ? 'Active' : 'Pending';

  sheet_('Users').appendRow([username, name, role, status, hash_(username, pass), new Date(), '']);
  log_(username, 'register', name, '', status);

  return { ok: true, status: status, role: role,
           message: isFirst ? 'Admin account created. You can sign in now.'
                            : 'Account created. An admin must approve it before you can sign in.' };
}

/* ================= worker tabs and summary ================= */

/** Whatever a time cell holds, give back "HH:MM". */
function timeTxt_(v) {
  if (v instanceof Date) return pad2_(v.getHours()) + ':' + pad2_(v.getMinutes());
  return String(v || '');
}

function tabName_(worker) {
  var clean = String(worker).replace(/[\[\]\*\/\\\?:]/g, '').trim().slice(0, 90);
  return clean || 'Unnamed';
}

// A worker destination must never be inferred from its name alone.
var WORKER_TAB_OWNER_ = 'FLAGSHIP_WORKER_OWNER_V1';
function workerTabError_(message) {
  var text = 'Worker tab protection: ' + message;
  console.error(text); // Do not call sheet_()/setup() while rejecting a destination.
  throw new Error(text);
}
function workerTabKey_(name) { return String(name).trim().toLowerCase(); }
function reservedWorkerTabs_() {
  return Object.keys(SHEETS).concat(['Summary', 'Sheet1',
    typeof STOCK_SHEET === 'string' ? STOCK_SHEET : 'Stock']).map(workerTabKey_);
}
function workerMasterRows_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Timesheets');
  return sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 14).getValues() : [];
}
function workerProjection_(r) {
  return [r[0],r[1],r[2],r[4],timeTxt_(r[5]),timeTxt_(r[6]),r[7],r[8],r[9],r[10],r[11],r[12],r[13]];
}
function workerRowFingerprint_(row) {
  return JSON.stringify(row.map(function(v) {
    return v instanceof Date ? {date:v.getTime()} : v;
  }));
}
function validateWorkerTab_(worker, master) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), name = tabName_(worker);
  var owner = String(worker).trim(), key = workerTabKey_(name);
  if (!owner || !String(worker).replace(/[\[\]\*\/\\\?:]/g, '').trim())
    workerTabError_('empty worker destination.');
  if (reservedWorkerTabs_().indexOf(key) !== -1)
    workerTabError_('reserved tab "' + name + '" cannot be used by worker "' + owner + '".');
  var matches = ss.getSheets().filter(function(sh) { return workerTabKey_(sh.getName()) === key; });
  if (matches.length > 1) workerTabError_('ambiguous existing tab "' + name + '".');
  var sh = matches[0];
  if (!sh) return {name:name, owner:owner, sheet:null, claim:false};
  var head = sh.getRange(1, 1, 1, WORKER_COLS.length).getValues()[0];
  if (sh.getLastColumn() !== WORKER_COLS.length || JSON.stringify(head) !== JSON.stringify(WORKER_COLS))
    workerTabError_('existing tab "' + sh.getName() + '" is not a verified worker tab.');
  var tags = sh.getDeveloperMetadata().filter(function(m) { return m.getKey() === WORKER_TAB_OWNER_; });
  if (tags.length) {
    if (tags.length !== 1 || tags[0].getValue() !== owner)
      workerTabError_('existing tab "' + sh.getName() + '" belongs to another worker.');
    return {name:name, owner:owner, sheet:sh, claim:false};
  }
  // Legacy tabs have no ownership marker. Accept only an exact, nonempty
  // derived copy of this worker's master records; never adopt a blank/template tab.
  var expected = master.filter(function(r) { return String(r[3] || '').trim() === owner; })
    .map(function(r) { return workerRowFingerprint_(workerProjection_(r)); }).sort();
  var actual = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow()-1, WORKER_COLS.length).getValues() : [];
  var formulas = actual.length ? sh.getRange(2,1,actual.length,WORKER_COLS.length).getFormulas() : [];
  if (!expected.length || formulas.some(function(r) { return r.some(function(v) { return !!v; }); }) ||
      JSON.stringify(actual.map(workerRowFingerprint_).sort()) !== JSON.stringify(expected))
    workerTabError_('existing tab "' + sh.getName() + '" has unverified legacy contents; review it manually.');
  return {name:name, owner:owner, sheet:sh, claim:true};
}
function preflightWorkerTabs_(additional) {
  var master = workerMasterRows_(), owners = Object.create(null), names = [];
  master.map(function(r) { return r[3]; }).concat(additional || []).forEach(function(w) {
    var owner = String(w || '').trim(); if (!owner) return;
    var key = workerTabKey_(tabName_(owner));
    if (owners[key] !== undefined && owners[key] !== owner)
      workerTabError_('workers "' + owners[key] + '" and "' + owner + '" resolve to the same tab.');
    if (owners[key] === undefined) { owners[key] = owner; names.push(owner); }
  });
  var checked = names.map(function(w) { return validateWorkerTab_(w, master); });
  // No mutation until every destination has passed. Mark proven legacy copies
  // before master edits so their previous contents remain recognizable.
  checked.forEach(function(d) { if (d.claim) d.sheet.addDeveloperMetadata(WORKER_TAB_OWNER_, d.owner); });
}

function workerSheet_(worker) {
  preflightWorkerTabs_([worker]);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var destination = validateWorkerTab_(worker, workerMasterRows_());
  var name = destination.name;
  var sh = destination.sheet;
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.addDeveloperMetadata(WORKER_TAB_OWNER_, destination.owner);
    sh.getRange(1, 1, 1, WORKER_COLS.length).setValues([WORKER_COLS])
      .setFontWeight('bold').setBackground('#1F4E79').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 95);
    sh.setColumnWidth(4, 170);
    log_('system', 'newTab', name, '', '');
  }
  return sh;
}

function sortWorkerTab_(sh) {
  var n = sh.getLastRow() - 1;
  if (n > 1) sh.getRange(2, 1, n, WORKER_COLS.length).sort({ column: 1, ascending: true });
}

function rebuildSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = sheet_('Timesheets');
  var sh = ss.getSheetByName('Summary') || ss.insertSheet('Summary');
  sh.clear();

  var head = ['Pay Cycle', 'Worker', 'Days', 'Normal Hours', 'Overtime Hours', 'Total Hours'];
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground('#1F4E79').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 130);

  var n = src.getLastRow() - 1;
  if (n < 1) return 'No data yet.';

  var data = src.getRange(2, 1, n, 11).getValues();
  var bucket = {};
  data.forEach(function (r) {
    var d = (r[0] instanceof Date) ? r[0] : new Date(String(r[0]) + 'T00:00:00');
    if (isNaN(d)) return;
    var worker = String(r[3] || '').trim();
    if (!worker) return;
    var c = cycleOf_(d);
    var label = cycleLabel_(c.y, c.m);
    var k = label + '||' + worker;
    if (!bucket[k]) bucket[k] = { label: label, worker: worker, sort: c.y * 100 + c.m, days: 0, n: 0, o: 0 };
    bucket[k].days++;
    bucket[k].n += Number(r[8]) || 0;
    bucket[k].o += Number(r[9]) || 0;
  });

  var rows = Object.keys(bucket).map(function (k) { return bucket[k]; });
  rows.sort(function (a, b) {
    if (a.sort !== b.sort) return b.sort - a.sort;
    return a.worker.localeCompare(b.worker);
  });

  var out = rows.map(function (r) {
    return [r.label, r.worker, r.days, Math.round(r.n * 100) / 100,
            Math.round(r.o * 100) / 100, Math.round((r.n + r.o) * 100) / 100];
  });
  if (out.length) sh.getRange(2, 1, out.length, 6).setValues(out);
  return 'Summary rebuilt: ' + out.length + ' lines.';
}

function rebuildWorkerTabs() {
  // Independent full preflight: direct/editor callers cannot bypass protection.
  preflightWorkerTabs_([]);
  var src = sheet_('Timesheets');
  var n = src.getLastRow() - 1;
  if (n < 1) return 'No data yet.';

  var data = src.getRange(2, 1, n, 14).getValues();
  var byWorker = Object.create(null);
  data.forEach(function (r) {
    var w = String(r[3] || '').trim();
    if (!w) return;
    if (!byWorker[w]) byWorker[w] = [];
    byWorker[w].push([r[0], r[1], r[2], r[4], timeTxt_(r[5]), timeTxt_(r[6]),
                      r[7], r[8], r[9], r[10], r[11], r[12], r[13]]);
  });

  var count = 0;
  Object.keys(byWorker).forEach(function (w) {
    validateWorkerTab_(w, workerMasterRows_());
    var sh = workerSheet_(w);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, WORKER_COLS.length).clearContent();
    sh.getRange(2, 5, byWorker[w].length, 2).setNumberFormat('@');
    sh.getRange(2, 1, byWorker[w].length, WORKER_COLS.length).setValues(byWorker[w]);
    sortWorkerTab_(sh);
    count++;
  });
  rebuildSummary();
  return 'Rebuilt ' + count + ' worker tabs.';
}

/* ================= timesheet writes ================= */

/** Finds an existing row for this worker + date on the master sheet. */
function findEntry_(worker, ds) {
  var sh = sheet_('Timesheets');
  var n = sh.getLastRow() - 1;
  if (n < 1) return null;
  var rows = sh.getRange(2, 1, n, 4).getValues();
  var w = String(worker).trim().toLowerCase();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (dateStr_(rows[i][0]) === ds && String(rows[i][3]).trim().toLowerCase() === w) return i + 2;
  }
  return null;
}

/**
 * Writes one day. Replaces an existing row for the same worker + date
 * rather than adding a second one, and logs what changed so an edit
 * can always be traced back.
 */
function writeEntry_(user, r) {
  preflightWorkerTabs_([r.worker]);
  var c = calc_(r.date, r.timeIn, r.timeOut, r.lunch);
  if (!c) return { skipped: true, reason: shiftReviewReason_(r.date, r.timeIn, r.timeOut, r.lunch) };

  var worker = String(r.worker || '').trim();
  if (!worker) return { skipped: true };

  var sh = sheet_('Timesheets');
  // times go in as text — as real values Sheets renders them against
  // its 1899 epoch, which looks like "12/30/1899 7:00:00"
  var row = [r.date, c.day, c.dayType, worker, r.job || '',
             "'" + r.timeIn, "'" + r.timeOut, c.lunch, c.normal, c.overtime, c.total,
             r.note || '', user.username, new Date()];

  var at = findEntry_(worker, r.date);
  if (at) {
    var old = sh.getRange(at, 1, 1, 14).getValues()[0];
    var wasTxt = old[5] + '-' + old[6] + '  ' + old[8] + 'n / ' + old[9] + 'ot' +
                 (old[4] ? '  ' + old[4] : '') + (old[11] ? '  (' + old[11] + ')' : '');
    var nowTxt = r.timeIn + '-' + r.timeOut + '  ' + c.normal + 'n / ' + c.overtime + 'ot' +
                 (r.job ? '  ' + r.job : '') + (r.note ? '  (' + r.note + ')' : '');
    if (wasTxt !== nowTxt) {
      sh.getRange(at, 1, 1, 14).setValues([row]);
      log_(user.username, 'edit', worker + ' ' + r.date, wasTxt, nowTxt);
      return { updated: true };
    }
    return { unchanged: true };
  }

  sh.appendRow(row);
  log_(user.username, 'add', worker + ' ' + r.date, '',
       r.timeIn + '-' + r.timeOut + '  ' + c.normal + 'n / ' + c.overtime + 'ot');
  return { added: true };
}

/* ================= prices ================= */

function priceRows_() {
  var sh = sheet_('Prices');
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var vals = sh.getRange(2, 1, n, 13).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0] && !r[4]) continue;                 // blank row
    out.push({
      row: i + 2,
      id: String(r[0]),
      category: String(r[1] || ''),
      supplier: String(r[2] || ''),
      code: String(r[3] || ''),
      description: String(r[4] || ''),
      unit: String(r[5] || ''),
      cost: Number(r[6]) || 0,
      type: String(r[7] || 'Cost'),
      markup: (r[8] === '' || r[8] == null) ? '' : Number(r[8]),
      install: Number(r[9]) || 0,
      spec: String(r[10] || ''),
      active: String(r[11]).toLowerCase() !== 'no',
      updated: r[12] ? dateStr_(r[12]) : ''
    });
  }
  return out;
}

function supabasePriceRows_() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  var key = String(props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || '');

  if (!url || !key) {
    throw new Error('Supabase server settings are missing.');
  }

  var endpoint = url +
    '/rest/v1/price_items?select=*&active=eq.true&order=category.asc,description.asc';

  var r = UrlFetchApp.fetch(endpoint, {
    method: 'get',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key
    },
    muteHttpExceptions: true
  });

  var code = r.getResponseCode();
  var text = r.getContentText() || '';

  if (code < 200 || code >= 300) {
    throw new Error('Supabase price request failed (' + code + '): ' + text.slice(0, 500));
  }

  var rows;
  try {
    rows = JSON.parse(text || '[]');
  } catch (e) {
    throw new Error('Supabase returned invalid price data.');
  }

  return rows.map(function (x) {
    return {
      id: String(x.id || x.legacy_id || ''),
      category: String(x.category || ''),
      supplier: String(x.supplier || ''),
      code: String(x.code || ''),
      description: String(x.description || ''),
      descriptionEn: String(x.description_en || x.descriptionEn || x.description || ''),
      unit: String(x.unit || ''),
      cost: Number(x.cost) || 0,
      type: String(x.type || 'Cost'),
      markup: (x.markup === '' || x.markup == null) ? '' : Number(x.markup),
      install: Number(x.install_cost) || 0,
      spec: String(x.spec || ''),
      active: x.active !== false,
      updated: x.updated_at ? dateStr_(x.updated_at) : ''
    };
  });
}

function findPrice_(id) {
  var all = priceRows_();
  for (var i = 0; i < all.length; i++) if (all[i].id === String(id)) return all[i];
  return null;
}

/** Sell price for one item at a given markup override. */
function sellPrice_(item, overrideMarkup) {
  if (item.type === 'Sell') return item.cost;      // already your price
  var m = (overrideMarkup === '' || overrideMarkup == null)
    ? (item.markup === '' ? DEFAULT_MARKUP : item.markup)
    : Number(overrideMarkup);
  if (isNaN(m)) m = DEFAULT_MARKUP;
  return item.cost * (1 + m / 100);
}

function priceId_() {
  return 'P' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
}

var XERO_TOKEN_URL_='https://identity.xero.com/connect/token';
var XERO_API_='https://api.xero.com/api.xro/2.0';
var XERO_CONN_='https://api.xero.com/connections';
var XERO_AUTH_='https://login.xero.com/identity/connect/authorize';
var XERO_SCOPES_='openid profile email accounting.contacts accounting.invoices offline_access';

function xeroProps_(){ return PropertiesService.getScriptProperties(); }
function xeroCfg_(){
  var p=xeroProps_();
  return {clientId:p.getProperty('XERO_CLIENT_ID')||'',clientSecret:p.getProperty('XERO_CLIENT_SECRET')||'',
          returnUrl:p.getProperty('XERO_RETURN_URL')||'',salesAccount:p.getProperty('XERO_SALES_ACCOUNT')||'',
          taxType:p.getProperty('XERO_TAX_TYPE')||'OUTPUT3'};
}
function xeroHtmlRedirect_(url,msg){
  var u=JSON.stringify(String(url||''));
  return HtmlService.createHtmlOutput('<!doctype html><html><body style="font-family:Arial;padding:30px">'+
    '<p>'+escXeroHtml_(msg||'Returning to Flagship…')+'</p><script>window.top.location.replace('+u+');</script></body></html>');
}
function escXeroHtml_(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}
function xeroSetConfig_(body){
  auth_(body,'Admin');
  var id=String(body.clientId||'').trim(), secret=String(body.clientSecret||'');
  if(!id) throw new Error('Xero Client ID is required');
  if(!secret){
    var old=xeroCfg_(); secret=old.clientSecret;
  }
  if(!secret) throw new Error('Xero Client Secret is required');
  var p=xeroProps_(); p.setProperty('XERO_CLIENT_ID',id); p.setProperty('XERO_CLIENT_SECRET',secret);
  p.setProperty('XERO_SALES_ACCOUNT',String(body.salesAccount||'').trim());
  p.setProperty('XERO_TAX_TYPE',String(body.taxType||'OUTPUT3').trim()||'OUTPUT3');
  return {ok:true};
}
function xeroStart_(body){
  auth_(body,'Admin');
  var c=xeroCfg_(); if(!c.clientId||!c.clientSecret) throw new Error('Save the Xero Client ID and Client Secret first.');
  var returnUrl=String(body.returnUrl||'').trim();
  if(!/^https:\/\//i.test(returnUrl)) throw new Error('Invalid return URL');
  var state=Utilities.getUuid(); var p=xeroProps_();
  p.setProperty('XERO_OAUTH_STATE',state); p.setProperty('XERO_RETURN_URL',returnUrl);
  var authUrl=XERO_AUTH_+'?'+[
    'response_type=code','client_id='+encodeURIComponent(c.clientId),
    'redirect_uri='+encodeURIComponent(ScriptApp.getService().getUrl()),
    'scope='+encodeURIComponent(XERO_SCOPES_),'state='+encodeURIComponent(state)
  ].join('&');
  return {ok:true,authUrl:authUrl};
}
function xeroCallback_(p){
  var cfg=xeroCfg_(), state=String(p.state||''), saved=xeroProps_().getProperty('XERO_OAUTH_STATE')||'';
  if(!state||state!==saved) return HtmlService.createHtmlOutput('<p>Invalid Xero OAuth state. Start the connection again.</p>');
  if(p.error) return HtmlService.createHtmlOutput('<p>Xero authorisation was cancelled: '+escXeroHtml_(p.error)+'</p>');
  var code=String(p.code||''); if(!code) return HtmlService.createHtmlOutput('<p>No Xero authorisation code received.</p>');
  var basic=Utilities.base64Encode(cfg.clientId+':'+cfg.clientSecret);
  var tokenResp=UrlFetchApp.fetch(XERO_TOKEN_URL_,{method:'post',contentType:'application/x-www-form-urlencoded',
    headers:{Authorization:'Basic '+basic},payload:{grant_type:'authorization_code',code:code,redirect_uri:ScriptApp.getService().getUrl()},muteHttpExceptions:true});
  var tc=tokenResp.getResponseCode(), tj={}; try{tj=JSON.parse(tokenResp.getContentText()||'{}')}catch(e){}
  if(tc<200||tc>=300) return HtmlService.createHtmlOutput('<p>Xero token exchange failed ('+tc+'): '+escXeroHtml_(tj.error_description||tokenResp.getContentText())+'</p>');
  var con=xeroRaw_(XERO_CONN_,tj.access_token,'get',null); var tenant=(con&&con[0])||{};
  var props=xeroProps_(); props.setProperty('XERO_ACCESS_TOKEN',tj.access_token); props.setProperty('XERO_REFRESH_TOKEN',tj.refresh_token||'');
  props.setProperty('XERO_EXPIRES_AT',String(Date.now()+Number(tj.expires_in||1800)*1000-60000));
  props.setProperty('XERO_TENANT_ID',tenant.tenantId||''); props.setProperty('XERO_TENANT_NAME',tenant.tenantName||'');
  props.deleteProperty('XERO_OAUTH_STATE');
  var ret=props.getProperty('XERO_RETURN_URL')||cfg.returnUrl;
  return xeroHtmlRedirect_(ret+'#xero=connected','Xero connected. Returning to Flagship…');
}
function xeroRefreshAccess_(){
  var c=xeroCfg_(), p=xeroProps_();
  if(!c.clientId||!c.clientSecret) throw new Error('Xero is not configured.');

  var rt=p.getProperty('XERO_REFRESH_TOKEN')||'';
  if(!rt) throw new Error('Xero session expired. Please reconnect Xero.');

  var basic=Utilities.base64Encode(c.clientId+':'+c.clientSecret);
  var r=UrlFetchApp.fetch(XERO_TOKEN_URL_,{
    method:'post',
    contentType:'application/x-www-form-urlencoded',
    headers:{Authorization:'Basic '+basic},
    payload:{grant_type:'refresh_token',refresh_token:rt},
    muteHttpExceptions:true
  });

  var code=r.getResponseCode(), j={};
  try{j=JSON.parse(r.getContentText()||'{}')}catch(e){}

  if(code<200||code>=300){
    // Xero invalidates the refresh token when a new one is issued or
    // when the connection has been revoked. Force a clean reconnect.
    throw new Error('Xero session expired. Please reconnect Xero.');
  }

  if(!j.access_token) throw new Error('Xero did not return a new access token.');

  p.setProperty('XERO_ACCESS_TOKEN',j.access_token);
  if(j.refresh_token) p.setProperty('XERO_REFRESH_TOKEN',j.refresh_token);
  p.setProperty('XERO_EXPIRES_AT',String(Date.now()+Number(j.expires_in||1800)*1000-60000));
  return j.access_token;
}

function xeroRaw_(url,token,method,payload,tenant){
  function request_(bearer){
    var headers={Authorization:'Bearer '+bearer,Accept:'application/json'};
    if(tenant) headers['xero-tenant-id']=tenant;
    var opt={method:(method||'get'),headers:headers,muteHttpExceptions:true};
    if(payload!==null&&payload!==undefined){
      opt.contentType='application/json';
      opt.payload=JSON.stringify(payload);
    }
    return UrlFetchApp.fetch(url,opt);
  }

  var r=request_(token), code=r.getResponseCode(), txt=r.getContentText()||'';

  // Access tokens can be revoked before their stored expiry time.
  // Refresh once and retry the exact request, avoiding infinite loops.
  if(code===401){
    var fresh=xeroRefreshAccess_();
    r=request_(fresh);
    code=r.getResponseCode();
    txt=r.getContentText()||'';
  }

  var j={};
  try{j=JSON.parse(txt||'{}')}catch(e){}
  if(code<200||code>=300){
    throw new Error('Xero API '+code+': '+String(j.Message||j.message||j.Title||txt).slice(0,700));
  }
  return j;
}

function xeroAccess_(){
  var c=xeroCfg_(), p=xeroProps_();
  if(!c.clientId||!c.clientSecret) throw new Error('Xero is not configured.');

  var at=p.getProperty('XERO_ACCESS_TOKEN')||'';
  var exp=Number(p.getProperty('XERO_EXPIRES_AT')||0);
  if(at&&exp>Date.now()) return at;

  return xeroRefreshAccess_();
}
function xeroStatus_(){
  var c=xeroCfg_(),p=xeroProps_(); return {ok:true,configured:!!(c.clientId&&c.clientSecret),connected:!!p.getProperty('XERO_REFRESH_TOKEN'),tenantName:p.getProperty('XERO_TENANT_NAME')||'',taxType:c.taxType,clientId:c.clientId,redirectUri:ScriptApp.getService().getUrl()};
}
function xeroContacts_(q){
  var token=xeroAccess_(), tenant=xeroProps_().getProperty('XERO_TENANT_ID'); if(!tenant) throw new Error('No Xero organisation connection found.');
  var j=xeroRaw_(XERO_API_+'/Contacts?page=1&pageSize=1000',token,'get',null,tenant); var t=String(q||'').trim().toLowerCase();
  var out=(j.Contacts||[]).filter(function(c){
    if(c.ContactStatus&&c.ContactStatus!=='ACTIVE') return false;
    var h=[c.Name,c.FirstName,c.LastName,c.EmailAddress,c.ContactNumber].join(' ').toLowerCase();
    return !t||h.indexOf(t)>=0;
  }).slice(0,30);
  return {ok:true,contacts:out.map(function(c){return {contactID:c.ContactID,name:c.Name||'',email:c.EmailAddress||'',number:c.ContactNumber||''};})};
}
function xeroCreateContact_(body){
  var u=auth_(body,['Admin','Technician']);
  var d=body.contact||{};
  var name=String(d.name||'').trim();
  if(!name) throw new Error('Customer name is required.');
  var email=String(d.email||'').trim();
  var number=String(d.number||'').trim();
  var token=xeroAccess_(), tenant=xeroProps_().getProperty('XERO_TENANT_ID');
  if(!tenant) throw new Error('No Xero organisation connection found.');

  // Prevent accidental duplicates when the customer already exists in Xero.
  var existing=xeroRaw_(XERO_API_+'/Contacts?page=1&pageSize=1000',token,'get',null,tenant).Contacts||[];
  var ne=email.toLowerCase();
  var nn=name.toLowerCase();
  for(var i=0;i<existing.length;i++){
    var ec=existing[i]||{};
    if(ec.ContactStatus&&ec.ContactStatus!=='ACTIVE') continue;
    if((ne&&String(ec.EmailAddress||'').trim().toLowerCase()===ne)||String(ec.Name||'').trim().toLowerCase()===nn){
      return {ok:true,created:false,contactID:ec.ContactID||'',name:ec.Name||name,email:ec.EmailAddress||email,number:ec.ContactNumber||number};
    }
  }

  var contact={Name:name};
  if(email) contact.EmailAddress=email;
  if(number) contact.ContactNumber=number;
  var j=xeroRaw_(XERO_API_+'/Contacts',token,'post',{Contacts:[contact]},tenant);
  var c=(j.Contacts&&j.Contacts[0])||{};
  if(!c.ContactID) throw new Error('Xero did not return a ContactID.');
  log_(u.username,'xeroCreateContact',String(c.ContactID),name,String(c.ContactID));
  return {ok:true,created:true,contactID:c.ContactID,name:c.Name||name,email:c.EmailAddress||email,number:c.ContactNumber||number};
}
function xeroCreateQuote_(body){
  var u=auth_(body,['Admin','Technician']); var q=body.quote||{}; if(!q.contactID) throw new Error('A Xero customer is required.');
  var items=Array.isArray(q.items)?q.items:[]; if(!items.length) throw new Error('At least one quote line is required.');
  items.forEach(function(it){validateQuoteAmounts_(it.quantity,it.unitAmount);});
  var c=xeroCfg_(), token=xeroAccess_(), tenant=xeroProps_().getProperty('XERO_TENANT_ID'); if(!tenant) throw new Error('No Xero organisation connection found.');
  var lines=items.map(function(it){var l={Description:String(it.description||'').trim(),Quantity:Number(it.quantity),UnitAmount:Number(it.unitAmount)};if(it.xeroItemCode)l.ItemCode=String(it.xeroItemCode);if(c.salesAccount)l.AccountCode=c.salesAccount;if(c.taxType)l.TaxType=c.taxType;return l;});
  var quote={Contact:{ContactID:q.contactID},Date:String(q.date||new Date().toISOString().slice(0,10)),ExpiryDate:String(q.expiryDate||''),Reference:String(q.reference||''),Title:String(q.title||'Flagship Quote').slice(0,100),Summary:String(q.summary||'').slice(0,3000),LineItems:lines,LineAmountTypes:'EXCLUSIVE',Status:'DRAFT'};
  if(!quote.ExpiryDate) delete quote.ExpiryDate;
  var j=xeroRaw_(XERO_API_+'/Quotes',token,'post',{Quotes:[quote]},tenant); var x=(j.Quotes&&j.Quotes[0])||{};
  if(!x.QuoteID)throw new Error('Xero did not confirm a QuoteID. Check Xero before retrying.');
  log_(u.username,'xeroCreateQuote',String(x.QuoteNumber||''),q.clientName||'',String(x.QuoteID||''));
  return {ok:true,quoteID:x.QuoteID||'',quoteNumber:x.QuoteNumber||'',status:x.Status||''};
}
function validateQuoteAmounts_(quantity,amount){
  if(quantity==null||String(quantity).trim()===''||!isFinite(Number(quantity))||Number(quantity)<=0)throw new Error('Quote quantities must be positive numbers.');
  if(amount==null||String(amount).trim()===''||!isFinite(Number(amount)))throw new Error('Quote prices must be explicit numbers.');
}



/* ================= XERO ITEMS ================= */
function xeroItems_(){
  var token=xeroAccess_(), tenant=xeroProps_().getProperty('XERO_TENANT_ID');
  if(!tenant) throw new Error('No Xero organisation connection found.');
  var all=[];
  for(var page=1; page<=20; page++){
    var j=xeroRaw_(XERO_API_+'/Items?page='+page+'&pageSize=1000',token,'get',null,tenant);
    var a=j.Items||[]; all=all.concat(a);
    if(a.length<1000) break;
  }
  return {ok:true,items:all.map(function(x){
    return {itemID:x.ItemID||'',code:x.Code||'',name:x.Name||'',description:x.Description||'',salesDescription:x.SalesDetails&&x.SalesDetails.Description||'',salesUnitPrice:x.SalesDetails&&x.SalesDetails.UnitPrice||0,salesAccountCode:x.SalesDetails&&x.SalesDetails.AccountCode||'',salesTaxType:x.SalesDetails&&x.SalesDetails.TaxType||'',active:x.IsSold!==false};
  })};
}


/* ================= JOB CARDS ================= */
function jobCardsSheet_(){ return sheet_('JobCards'); }
function jobCardAssigned_(technicians,name){
  var who=String(name||'').trim().toLowerCase();
  return !!who&&String(technicians||'').toLowerCase().split(/[,;\n]+/).some(function(n){return n.trim()===who;});
}
function jobCardsList_(body){
  var u=auth_(body,['Admin','Technician','Worker']);
  var sh=jobCardsSheet_(),n=sh.getLastRow(); if(n<2)return {ok:true,jobCards:[]};
  var vals=sh.getRange(2,1,n-1,12).getValues(),out=[];
  vals.forEach(function(r){
    if(!r[0])return;
    if(u.role==='Worker' && !jobCardAssigned_(r[5],u.name))return;
    var d={};try{d=JSON.parse(String(r[11]||'{}'));}catch(e){}
    out.push({id:String(r[0]),number:String(r[1]),customer:String(r[2]),site:String(r[3]),date:dateStr_(r[4]),technicians:String(r[5]),types:String(r[6]),status:String(r[7]),createdBy:String(r[8]),created:r[9],updated:r[10],data:d});
  });
  return {ok:true,jobCards:out};
}
function jobCardSave_(body){
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{return jobCardSaveLocked_(body);}finally{lock.releaseLock();}
}
function jobCardSaveLocked_(body){
  var u=auth_(body,['Admin','Technician','Worker']),j=body.jobCard||{};
  var id=String(j.id||'').trim(); if(!id)throw new Error('Job Card ID is required.');
  var no=String(j.number||'').trim(),customer=String(j.customer||'').trim(),site=String(j.site||'').trim(),date=String(j.date||'').trim();
  if(!customer||!site||!date)throw new Error('Customer, site and date are required.');
  if(u.role==='Worker' && !jobCardAssigned_(j.technicians,u.name))throw new Error('Worker may only submit a job card assigned to themselves.');
  var sh=jobCardsSheet_(),n=sh.getLastRow(),row=0,old=null;
  if(n>=2){var vals=sh.getRange(2,1,n-1,12).getValues();for(var i=0;i<vals.length;i++)if(String(vals[i][0])===id){row=i+2;old=vals[i];break;}}
  if(old&&u.role==='Worker'&&!jobCardAssigned_(old[5],u.name))throw new Error('Worker may not overwrite another worker\'s job card.');
  var now=new Date(),created=old?old[9]:now;
  var json=JSON.stringify(j);
  var data=[id,no,customer,site,date,String(j.technicians||''),Array.isArray(j.types)?j.types.join(','):String(j.types||''),String(j.status||'DRAFT'),u.username,created,now,json];
  if(row)sh.getRange(row,1,1,12).setValues([data]);else sh.appendRow(data);
  log_(u.username,'jobCardSave',no,old?String(old[7]||''):'',String(j.status||'DRAFT'));
  return {ok:true,id:id,number:no,status:String(j.status||'DRAFT')};
}
function jobCardDelete_(body){
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{return jobCardDeleteLocked_(body);}finally{lock.releaseLock();}
}
function jobCardDeleteLocked_(body){
  var u=auth_(body,['Admin','Technician']),id=String(body.id||'').trim();if(!id)throw new Error('Job Card ID is required.');
  var sh=jobCardsSheet_(),n=sh.getLastRow();if(n<2)return {ok:true};var vals=sh.getRange(2,1,n-1,12).getValues();for(var i=0;i<vals.length;i++)if(String(vals[i][0])===id){sh.deleteRow(i+2);log_(u.username,'jobCardDelete',String(vals[i][1]||id),'','');return {ok:true};}return {ok:true};
}

/* ================= VALUE PROPOSAL SERVER WORKFLOW ================= */
function proposalSheet_(){ return sheet_('Proposals'); }
function proposalRow_(token){
  var sh=proposalSheet_(), n=sh.getLastRow(); if(n<2) return null;
  var vals=sh.getRange(2,1,n-1,11).getValues();
  for(var i=0;i<vals.length;i++) if(String(vals[i][0])===String(token)) return {row:i+2,values:vals[i]};
  return null;
}
function proposalPublish_(body){
  var u=auth_(body,['Admin','Technician']), d=body.proposal||{};
  if(!String(d.client||'').trim()) throw new Error('Customer name is required.');
  if(!Array.isArray(d.items)||!d.items.length) throw new Error('The proposal has no priced lines.');
  d.items.forEach(function(it){validateQuoteAmounts_(it.qty,it.sell);});
  var token=Utilities.getUuid().replace(/-/g,'');
  var now=new Date();
  var sh=proposalSheet_();
  var json=JSON.stringify(d);
  sh.appendRow([token,String(d.no||''),String(d.client||''),String(d.customerEmail||''),'SENT',now,now,'','','',json]);
  log_(u.username,'proposalPublish',String(d.no||''),String(d.client||''),token);
  return {ok:true,token:token,url:ScriptApp.getService().getUrl()+'?action=proposalView&token='+encodeURIComponent(token),status:'SENT'};
}

function proposalAccept_(token,name){
  var rec=proposalRow_(token); if(!rec) return {ok:false,error:'Proposal not found.'};
  var v=rec.values, status=String(v[4]||'');
  if(status==='XERO DRAFT CREATED') return {ok:true,status:status,quoteID:String(v[8]||''),quoteNumber:String(v[9]||'')};
  if(status==='ACCEPTED') return {ok:true,status:'ACCEPTED',customer:String(v[2]||''),acceptedBy:String(name||v[2]||'')};
  if(status!=='SENT') return {ok:false,error:'This proposal is no longer available for acceptance.'};
  var d={}; try{d=JSON.parse(String(v[10]||'{}'));}catch(e){return {ok:false,error:'Proposal data is invalid.'};}
  var sh=proposalSheet_(), now=new Date();
  sh.getRange(rec.row,5,1,7).setValues([['ACCEPTED',v[5],now,new Date(),'','',v[10]]]);
  log_('public','proposalAccept',String(d.no||''),String(d.client||''),'ACCEPTED');
  return {ok:true,status:'ACCEPTED',customer:String(d.client||''),acceptedBy:String(name||d.client||'')};
}

/* Create the Xero contact if needed, then create the quote for an ACCEPTED proposal. */
function proposalSendToXero_(body){
  var u=auth_(body,['Admin','Technician']);
  var token=String(body.token||'').trim();
  if(!token) throw new Error('Proposal token is required.');
  var rec=proposalRow_(token); if(!rec) throw new Error('Proposal not found.');
  var v=rec.values, status=String(v[4]||'');
  if(status==='XERO DRAFT CREATED') return {ok:true,status:status,quoteID:String(v[8]||''),quoteNumber:String(v[9]||'')};
  if(status!=='ACCEPTED') return {ok:false,status:status||'UNKNOWN',error:'The client must accept the proposal before it can be sent to Xero.'};

  var d={}; try{d=JSON.parse(String(v[10]||'{}'));}catch(e){throw new Error('Proposal data is invalid.');}
  if(!Array.isArray(d.items)||!d.items.length)throw new Error('The proposal has no priced lines.');
  d.items.forEach(function(it){validateQuoteAmounts_(it.qty,it.sell);});
  var tokenA=xeroAccess_(), tenant=xeroProps_().getProperty('XERO_TENANT_ID');
  if(!tenant) throw new Error('No Xero organisation connection found. Connect Xero first.');

  var contacts=xeroRaw_(XERO_API_+'/Contacts?page=1&pageSize=1000',tokenA,'get',null,tenant).Contacts||[];
  var name=String(d.client||'').trim(), email=String(d.customerEmail||'').trim();
  var nn=name.toLowerCase(), ne=email.toLowerCase(), contact=null;
  for(var i=0;i<contacts.length;i++){
    var c0=contacts[i]||{};
    if(c0.ContactStatus&&c0.ContactStatus!=='ACTIVE') continue;
    if((ne&&String(c0.EmailAddress||'').trim().toLowerCase()===ne)||String(c0.Name||'').trim().toLowerCase()===nn){contact=c0;break;}
  }
  if(!contact){
    var nc={Name:name};
    if(email) nc.EmailAddress=email;
    if(String(d.address||'').trim()) nc.Addresses=[{AddressType:'STREET',AddressLine1:String(d.address).trim(),Country:'South Africa'}];
    var cj=xeroRaw_(XERO_API_+'/Contacts',tokenA,'post',{Contacts:[nc]},tenant);
    contact=(cj.Contacts&&cj.Contacts[0])||{};
    if(!contact.ContactID) throw new Error('Xero did not return a ContactID when creating the customer.');
  }

  var c=xeroCfg_();
  var lines=(d.items||[]).map(function(it){
    var l={Description:String(it.desc||it.description||'').trim(),Quantity:Number(it.qty),UnitAmount:Number(it.sell)};
    if(it.xeroItemCode) l.ItemCode=String(it.xeroItemCode);
    if(c.salesAccount) l.AccountCode=c.salesAccount;
    if(c.taxType) l.TaxType=c.taxType;
    return l;
  });
  var quote={Contact:{ContactID:contact.ContactID},Date:String(d.date||new Date().toISOString().slice(0,10)),Reference:String(d.no||''),Title:String(d.title||'Flagship Quote').slice(0,100),Summary:'Created from accepted Flagship Value Proposal '+String(d.no||''),LineItems:lines,LineAmountTypes:'EXCLUSIVE',Status:'DRAFT'};
  var j=xeroRaw_(XERO_API_+'/Quotes',tokenA,'post',{Quotes:[quote]},tenant), x=(j.Quotes&&j.Quotes[0])||{};
  if(!x.QuoteID) throw new Error('Xero did not return a QuoteID.');
  sh=proposalSheet_(); now=new Date();
  sh.getRange(rec.row,5,1,7).setValues([['XERO DRAFT CREATED',v[5],v[6],now,x.QuoteID||'',x.QuoteNumber||'',v[10]]]);
  log_(u.username,'proposalSendToXero',String(d.no||''),name,String(x.QuoteID||''));
  return {ok:true,status:'XERO DRAFT CREATED',quoteID:x.QuoteID||'',quoteNumber:x.QuoteNumber||'',customer:name};
}

function proposalPublicHtml_(token){
  var rec=proposalRow_(token); if(!rec) return HtmlService.createHtmlOutput('<h2>Proposal not found</h2><p>This link is invalid or has expired.</p>');
  var v=rec.values, d={}; try{d=JSON.parse(String(v[10]||'{}'));}catch(e){}
  var status=String(v[4]||'SENT');
  var lines=(d.items||[]).map(function(it){return '<tr><td>'+escXeroHtml_(it.desc||it.description||'')+'</td><td style="text-align:right">'+escXeroHtml_(String(it.qty||1))+'</td><td style="text-align:right">R '+Number(it.sell||0).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})+'</td></tr>';}).join('');
  var sub=(d.items||[]).reduce(function(a,it){return a+(Number(it.qty)||0)*(Number(it.sell)||0);},0), vat=sub*.15, total=sub+vat;
  var disabled=status!=='SENT';
  var msg=status==='XERO DRAFT CREATED'?'This proposal has already been accepted. Your acceptance has been recorded.':(status==='ACCEPTED'?'This proposal has already been accepted.':'');
  var html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flagship Solar Proposal</title><style>body{font-family:Arial,sans-serif;background:#f5f6f8;color:#172033;margin:0;padding:18px}.card{max-width:760px;margin:auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 5px 30px rgba(0,0,0,.08)}h1{margin-top:0}table{width:100%;border-collapse:collapse}td{padding:10px 4px;border-bottom:1px solid #ddd}.total{font-size:20px;font-weight:700}.btn{width:100%;padding:15px;border:0;border-radius:10px;background:#172033;color:#fff;font-size:16px;font-weight:700}.muted{color:#667085}.ok{padding:14px;background:#e9f7ef;border-radius:10px;color:#17643a;margin-bottom:15px}.field{margin:12px 0}.field input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #ccd2da;border-radius:8px;font-size:16px}</style></head><body><div class="card"><h1>'+escXeroHtml_(d.title||'Flagship Solar Value Proposal')+'</h1><p class="muted">Prepared for <b>'+escXeroHtml_(d.client||'')+'</b></p><p>'+escXeroHtml_(d.address||'')+'</p>'+(msg?'<div class="ok">'+msg+'</div>':'')+'<table><thead><tr><th style="text-align:left">Description</th><th>Qty</th><th style="text-align:right">Price</th></tr></thead><tbody>'+lines+'</tbody><tfoot><tr><td colspan="2">Subtotal</td><td style="text-align:right">R '+sub.toLocaleString('en-ZA',{minimumFractionDigits:2})+'</td></tr><tr><td colspan="2">VAT 15%</td><td style="text-align:right">R '+vat.toLocaleString('en-ZA',{minimumFractionDigits:2})+'</td></tr><tr class="total"><td colspan="2">Total incl VAT</td><td style="text-align:right">R '+total.toLocaleString('en-ZA',{minimumFractionDigits:2})+'</td></tr></tfoot></table>'+(!disabled?'<form method="get"><input type="hidden" name="action" value="proposalAccept"><input type="hidden" name="token" value="'+escXeroHtml_(token)+'"><div class="field"><label>Your name</label><input name="name" value="'+escXeroHtml_(d.client||'')+'" required></div><button class="btn" type="submit">Accept Proposal</button></form>':'')+'</div></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ================= web app ================= */

function doGet(e) {
 
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'xeroCallback' || p.code) return xeroCallback_(p);
    if (p.action === 'ping') return out_({ ok: true, pong: true });
    if (p.action === 'proposalView') return proposalPublicHtml_(p.token||'');
    if (p.action === 'proposalAccept') { var pa=proposalAccept_(p.token||'',p.name||''); return HtmlService.createHtmlOutput('<h2>'+ (pa.ok?'Proposal accepted':'Acceptance failed') +'</h2><p>'+escXeroHtml_(pa.ok?'Your acceptance has been recorded. Flagship Solar will now process the accepted proposal.':(pa.error||'Unknown error'))+'</p>'); }

    var body = { user: p.user, pass: p.pass };

    if (p.action === 'me') {
      var u = auth_(body);
      return out_({ ok: true, user: { username: u.username, name: u.name, role: u.role } });
    }

    if (p.action === 'workers') {
      auth_(body);
      var sh = sheet_('Workers');
      var n = sh.getLastRow() - 1;
      var list = [];
      if (n > 0) sh.getRange(2, 1, n, 2).getValues().forEach(function (r) {
        if (r[0] && String(r[1]).toLowerCase() !== 'no') list.push(String(r[0]));
      });
      return out_({ ok: true, workers: list });
    }

    if (p.action === 'entries') {
      var me = auth_(body);
      var who = p.worker || me.name;
      if (me.role === 'Worker' && String(who).toLowerCase() !== String(me.name).toLowerCase()) {
        return out_({ ok: false, error: 'not allowed' });
      }
      var sh2 = sheet_('Timesheets');
      var n2 = sh2.getLastRow() - 1;
      var rows = [];
      if (n2 > 0) {
        sh2.getRange(2, 1, n2, 12).getValues().forEach(function (r) {
          if (String(r[3]).trim().toLowerCase() !== String(who).trim().toLowerCase()) return;
          var ds = dateStr_(r[0]);
          if (p.cycle && cycleKey_(cycleOf_(new Date(ds + 'T00:00:00'))) !== p.cycle) return;
          rows.push({ date: ds, job: String(r[4] || ''), ti: String(r[5]), to: String(r[6]),
                      lu: r[7], normal: r[8], ot: r[9], note: String(r[11] || '') });
        });
      }
      return out_({ ok: true, entries: rows });
    }

    if (p.action === 'timesheetAll') {
      var admin = auth_(body, ['Admin', 'Technician']);
      var cycle = String(p.cycle || '').trim();
      if (!cycle) return out_({ ok: false, error: 'cycle required' });

      var ts = sheet_('Timesheets');
      var tn = ts.getLastRow() - 1;
      var entries = {};

      if (tn > 0) {
        // One read for the whole master sheet — much faster than one request per worker.
        ts.getRange(2, 1, tn, 14).getValues().forEach(function (r) {
          if (!r[0] || !r[3]) return;

          var ds = dateStr_(r[0]);
          var d = new Date(ds + 'T00:00:00');
          if (cycleKey_(cycleOf_(d)) !== cycle) return;

          var worker = String(r[3]).trim();
          if (!entries[worker]) entries[worker] = {};

          var ti = String(r[5] == null ? '' : r[5]).replace(/^'/, '');
          var to = String(r[6] == null ? '' : r[6]).replace(/^'/, '');

          entries[worker][ds] = {
            on: !!(ti || to || r[4] || r[11]),
            ti: ti,
            to: to,
            lu: Number(r[7]) || 0,
            job: String(r[4] || ''),
            note: String(r[11] || ''),
            sent: true
          };
        });
      }

      return out_({ ok: true, cycle: cycle, entries: entries });
    }

    if (p.action === 'proposalSendToXero') return out_(proposalSendToXero_(body));
    if (p.action === 'xeroStatus') { auth_(body); return out_({ok:true,xero:xeroStatus_()}); }
    if (p.action === 'xeroItems') { auth_(body, ['Admin', 'Technician']); return out_(xeroItems_()); }
    if (p.action === 'xeroContacts') { auth_(body,['Admin','Technician']); return out_(xeroContacts_(p.q||'')); }
    if (p.action === 'xeroCreateContact') return out_(xeroCreateContact_(body));
    if (p.action === 'jobCards') { return out_(jobCardsList_(body)); }


    if (p.action === 'prices') {
      auth_(body, ['Admin', 'Technician']);
      var all = supabasePriceRows_();
      if (p.category) all = all.filter(function (x) { return x.category === p.category; });
      // Technicians see sell prices only — cost and markup stay with the Admin
      var me3 = findUser_(body.user);
      var hideCost = me3 && me3.role !== 'Admin';
      var list3 = all.map(function (x) {
        var o = { id: x.id, category: x.category, supplier: x.supplier, code: x.code,
                  description: x.description, descriptionEn: x.descriptionEn || x.description, unit: x.unit, install: x.install,
                  spec: x.spec, active: x.active, updated: x.updated,
                  sell: Math.round(sellPrice_(x, '') * 100) / 100 };
        if (!hideCost) { o.cost = x.cost; o.type = x.type; o.markup = x.markup; }
        return o;
      });
      return out_({ ok: true, prices: list3, categories: CATEGORIES,
                    types: PRICE_TYPES, defaultMarkup: DEFAULT_MARKUP });
    }

    if (p.action === 'users') {
      auth_(body, 'Admin');
      var us = sheet_('Users');
      var un = us.getLastRow() - 1;
      var list2 = [];
      if (un > 0) us.getRange(2, 1, un, 7).getValues().forEach(function (r) {
        if (!r[0]) return;
        list2.push({ username: String(r[0]), name: String(r[1]), role: String(r[2]),
                     status: String(r[3]), lastSeen: r[6] ? dateStr_(r[6]) : '' });
      });
      return out_({ ok: true, users: list2, roles: ROLES });
    }
 var sg = stockGet_(p, body); if (sg) return sg;
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return out_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  
  var body;
  
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { return out_({ ok: false, error: 'bad json' }); }
  

  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return out_({ ok: false, error: 'busy, try again' }); }

  try {
    if (body.action === 'register') return out_(register_(body));

    if (body.action === 'login') {
      var u = auth_(body);
      try { sheet_('Users').getRange(u.row, 7).setValue(new Date()); } catch (e) {}
      log_(u.username, 'login', '', '', '');
      return out_({ ok: true, user: { username: u.username, name: u.name, role: u.role } });
    }

    if (body.action === 'addWorker') {
      var me = auth_(body, ['Admin', 'Technician']);
      var name = String(body.name || '').trim();
      if (!name) return out_({ ok: false, error: 'no name' });
      preflightWorkerTabs_([name]);
      var w = sheet_('Workers');
      var n = w.getLastRow() - 1;
      var have = n > 0 ? w.getRange(2, 1, n, 1).getValues().map(function (r) {
        return String(r[0]).trim().toLowerCase();
      }) : [];
      if (have.indexOf(name.toLowerCase()) === -1) {
        w.appendRow([name, 'Yes', new Date()]);
        log_(me.username, 'addWorker', name, '', '');
      }
      return out_({ ok: true, name: name });
    }

    if (body.action === 'timesheets') {
      var user = auth_(body);
      var rows = body.rows || [];
      if (!rows.length) return out_({ ok: false, error: 'no rows' });
      // Validate the whole batch before the first master-row write.
      preflightWorkerTabs_(rows.map(function(r) { return r && r.worker; }));

      var added = 0, updated = 0, skipped = 0, blocked = 0, closed = 0;
      var results = [];

      for (var i = 0; i < rows.length; i++) {
        var r = rows[i] || {};
        var workerName = String(r.worker || '').trim();

        // Workers may only file their own hours. Return a row-level result
        // so the phone never marks a rejected entry as successfully sent.
        if (user.role === 'Worker' &&
            workerName.toLowerCase() !== String(user.name).trim().toLowerCase()) {
          blocked++;
          results.push({index:i, date:String(r.date||''), worker:workerName, status:'blocked'});
          continue;
        }
        // Only the open cycle can be written. Past cycles are closed to
        // everyone except an Admin, who can still fix a mistake.
        if (!isCurrentCycle_(r.date) && user.role !== 'Admin') {
          closed++;
          results.push({index:i, date:String(r.date||''), worker:workerName, status:'closed'});
          continue;
        }

        var res = writeEntry_(user, r);
        if (res.added) {
          added++;
          results.push({index:i, date:String(r.date||''), worker:workerName, status:'added'});
        } else if (res.updated) {
          updated++;
          results.push({index:i, date:String(r.date||''), worker:workerName, status:'updated'});
        } else if (res.unchanged) {
          results.push({index:i, date:String(r.date||''), worker:workerName, status:'unchanged'});
        } else {
          skipped++;
          results.push({index:i, date:String(r.date||''), worker:workerName, status:'skipped', reason:res.reason||'Invalid Timesheet row.'});
        }
      }

      if (added || updated) rebuildWorkerTabs();

      return out_({ ok: true, written: added, updated: updated,
                    skipped: skipped, blocked: blocked, closed: closed,
                    results: results });
    }

    if (body.action === 'xeroSetConfig') return out_(xeroSetConfig_(body));
    if (body.action === 'xeroStart') return out_(xeroStart_(body));
    if (body.action === 'xeroItems') { auth_(body,['Admin','Technician']); return out_(xeroItems_()); }
    if (body.action === 'proposalPublish') return out_(proposalPublish_(body));
    if (body.action === 'xeroCreateQuote') return out_(xeroCreateQuote_(body));
    if (body.action === 'proposalSendToXero') return out_(proposalSendToXero_(body));
    if (body.action === 'xeroCreateContact') return out_(xeroCreateContact_(body));

    if (body.action === 'jobCardSave') return out_(jobCardSave_(body));
    if (body.action === 'jobCardDelete') return out_(jobCardDelete_(body));


    if (body.action === 'savePrice') {
      var pu = auth_(body, 'Admin');
      var it = body.item || {};
      var desc = String(it.description || '').trim();
      if (!desc) return out_({ ok: false, error: 'a description is required' });
      if (it.category && CATEGORIES.indexOf(it.category) === -1) {
        return out_({ ok: false, error: 'unknown category' });
      }
      var type = (it.type === 'Sell') ? 'Sell' : 'Cost';
      var cost = Number(it.cost); if (isNaN(cost) || cost < 0) cost = 0;
      var markup = (it.markup === '' || it.markup == null) ? '' : Number(it.markup);
      if (markup !== '' && (isNaN(markup) || markup < 0)) markup = '';
      var install = Number(it.install); if (isNaN(install) || install < 0) install = 0;

      var sh = sheet_('Prices');
      var row = [it.id || priceId_(), it.category || 'Other', it.supplier || '',
                 it.code || '', desc, it.unit || '', cost, type, markup, install,
                 it.spec || '', it.active === false ? 'No' : 'Yes', new Date()];

      var ex = it.id ? findPrice_(it.id) : null;
      if (ex) {
        var was = ex.description + ' @ ' + ex.cost + ' ' + ex.type +
                  (ex.markup === '' ? '' : ' +' + ex.markup + '%');
        var now = desc + ' @ ' + cost + ' ' + type +
                  (markup === '' ? '' : ' +' + markup + '%');
        sh.getRange(ex.row, 1, 1, 13).setValues([row]);
        if (was !== now) log_(pu.username, 'price', desc, was, now);
        return out_({ ok: true, id: ex.id, updated: true });
      }
      sh.appendRow(row);
      log_(pu.username, 'price', desc, '', desc + ' @ ' + cost + ' ' + type);
      return out_({ ok: true, id: row[0], added: true });
    }

    if (body.action === 'updatePriceList') {
      var upu = auth_(body, 'Admin');
      var updates = Array.isArray(body.updates) ? body.updates : [];
      if (!updates.length) return out_({ ok: false, error: 'no price updates supplied' });

      var psh = sheet_('Prices');
      var pn = psh.getLastRow() - 1;
      if (pn < 1) return out_({ ok: false, error: 'Prices tab is empty' });
      var pvals = psh.getRange(2, 1, pn, 13).getValues();
      var byCode = {};
      for (var pi = 0; pi < pvals.length; pi++) {
        var pc = String(pvals[pi][3] || '').trim().toUpperCase();
        if (pc && !byCode[pc]) byCode[pc] = pi;
      }

      var updated = 0, unchanged = 0, notFound = 0;
      var changed = [];
      for (var ui = 0; ui < updates.length; ui++) {
        var uitem = updates[ui] || {};
        var ucode = String(uitem.code || '').trim().toUpperCase();
        var uprice = Number(uitem.price);
        if (!ucode || !isFinite(uprice) || uprice < 0) continue;
        if (byCode[ucode] === undefined) { notFound++; continue; }

        var idx = byCode[ucode];
        var oldPrice = Number(pvals[idx][6]) || 0;
        var type = String(pvals[idx][7] || 'Cost');
        if (Math.abs(oldPrice - uprice) < 0.005) { unchanged++; continue; }

        pvals[idx][6] = uprice;          // Cost only
        pvals[idx][12] = new Date();     // Updated
        updated++;
        changed.push({ code: ucode, description: String(pvals[idx][4] || ''), old: oldPrice, now: uprice });
      }

      if (updated) {
        psh.getRange(2, 1, pn, 13).setValues(pvals);
        log_(upu.username, 'updatePriceList',
             (body.source || 'supplier list') + ' — ' + updated + ' prices updated',
             '',updated + ' updated; ' + unchanged + ' unchanged; ' + notFound + ' not found',);
      }

      return out_({ ok: true, updated: updated, unchanged: unchanged,
                    notFound: notFound, changes: changed });
    }

    if (body.action === 'deletePrice') {
      var du = auth_(body, 'Admin');
      var t4 = findPrice_(body.id || '');
      if (!t4) return out_({ ok: false, error: 'no such item' });
      sheet_('Prices').deleteRow(t4.row);
      log_(du.username, 'deletePrice', t4.description, t4.cost + ' ' + t4.type, 'deleted');
      return out_({ ok: true });
    }

    /* ---- admin only ---- */

    if (body.action === 'setUser') {
      var admin = auth_(body, 'Admin');
      var t = findUser_(body.target || '');
      if (!t) return out_({ ok: false, error: 'no such user' });
      if (t.username.toLowerCase() === admin.username.toLowerCase() &&
          body.role && body.role !== 'Admin') {
        return out_({ ok: false, error: 'you cannot remove your own admin role' });
      }
      var sh = sheet_('Users');
      var was = t.role + ' / ' + t.status;
      if (body.role !== undefined && body.role !== null) {
        if (body.role && ROLES.indexOf(body.role) === -1) return out_({ ok: false, error: 'bad role' });
        sh.getRange(t.row, 3).setValue(body.role);
      }
      if (body.status) sh.getRange(t.row, 4).setValue(body.status);
      else if (body.role && String(t.status).toLowerCase() === 'pending') sh.getRange(t.row, 4).setValue('Active');
      var now = (body.role !== undefined && body.role !== null ? body.role : t.role) +
                ' / ' + (body.status || t.status);
      log_(admin.username, 'setUser', t.username, was, now);
      return out_({ ok: true });
    }

    if (body.action === 'deleteUser') {
      var admin2 = auth_(body, 'Admin');
      var t2 = findUser_(body.target || '');
      if (!t2) return out_({ ok: false, error: 'no such user' });
      if (t2.username.toLowerCase() === admin2.username.toLowerCase()) {
        return out_({ ok: false, error: 'you cannot delete yourself' });
      }
      sheet_('Users').deleteRow(t2.row);
      log_(admin2.username, 'deleteUser', t2.username, t2.role + ' / ' + t2.status, 'deleted');
      return out_({ ok: true });
    }

    if (body.action === 'resetPassword') {
      var admin3 = auth_(body, 'Admin');
      var t3 = findUser_(body.target || '');
      if (!t3) return out_({ ok: false, error: 'no such user' });
      var np = String(body.newPass || '');
      if (np.length < 4) return out_({ ok: false, error: 'password must be at least 4 characters' });
      sheet_('Users').getRange(t3.row, 5).setValue(hash_(t3.username, np));
      log_(admin3.username, 'resetPassword', t3.username, '', '');
      return out_({ ok: true });
    }

    if (body.action === 'changePassword') {
      var me2 = auth_(body);
      var np2 = String(body.newPass || '');
      if (np2.length < 4) return out_({ ok: false, error: 'password must be at least 4 characters' });
      sheet_('Users').getRange(me2.row, 5).setValue(hash_(me2.username, np2));
      log_(me2.username, 'changePassword', '', '', '');
      return out_({ ok: true });
    }
var sp = stockPost_(body); if (sp) return sp;
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) {
    log_(body && body.user, 'error', String(body && body.action), '', String(err.message || err));
    return out_({ ok: false, error: String(err.message || err) });
    
  } finally {
    lock.releaseLock();
  }
}
function testPrices() {
  var rows = priceRows_();
  Logger.log("PRICE COUNT: " + rows.length);
  Logger.log(JSON.stringify(rows.slice(0, 3)));
}

