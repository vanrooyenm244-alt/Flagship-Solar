/**
 * Flagship Solar — stock count
 * ==================================================================
 * A separate file so it cannot break timesheets or prices.
 *
 * TO INSTALL
 *   1. Apps Script > + > Script, name it  Stock
 *   2. Paste this whole file in.
 *   3. In Code.gs, inside doGet(), just above the last
 *        return out_({ ok: false, error: 'unknown action' });
 *      add:
 *        var sg = stockGet_(p, body); if (sg) return sg;
 *   4. In Code.gs, inside doPost(), just above its last
 *        return out_({ ok: false, error: 'unknown action' });
 *      add:
 *        var sp = stockPost_(body); if (sp) return sp;
 *   5. Run  setupStock()  once. It builds the tab and loads the list.
 *   6. Deploy > Manage deployments > pencil > New version > Deploy.
 *
 * HOW THE COUNT WORKS
 *   Three places hold stock: Store, GWM, NP200. Whoever counts picks
 *   one place and counts only that. The app sends back that column
 *   alone, so four people can count four places at the same time
 *   without writing over each other. Total is a formula in the sheet.
 * ==================================================================
 */

var STOCK_SHEET = 'Stock';
var STOCK_PLACES = ['Store', 'GWM', 'NP200'];
var STOCK_HEAD = ['Item', 'Category', 'Unit', 'Last Price',
                  'Store', 'GWM', 'NP200', 'Total', 'Counted', 'By'];

/* Kept short and in the order you walk the shelves. */
var STOCK_CATS = ['Wire & Cable', 'Conduit & Trunking', 'DB & Enclosures',
                  'Breakers', 'PV & DC', 'Lugs & Ferrules', 'Roof Structure',
                  'Plumbing', 'Consumable', 'Tools', 'Other'];

/* ================= setup ================= */

function setupStock() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(STOCK_SHEET) || ss.insertSheet(STOCK_SHEET);

  sh.getRange(1, 1, 1, STOCK_HEAD.length).setValues([STOCK_HEAD])
    .setFontWeight('bold').setBackground('#1F4E79').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 280);
  sh.setColumnWidth(2, 150);

  if (sh.getLastRow() < 2) seedStock_();
  stockTotals_();
  log_('system', 'setupStock', sh.getLastRow() - 1 + ' items', '', '');
  return 'Stock tab ready: ' + (sh.getLastRow() - 1) + ' items.';
}

/** Total column is a formula so the sheet stays readable on its own. */
function stockTotals_() {
  var sh = sheet_(STOCK_SHEET);
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var f = [];
  for (var i = 0; i < n; i++) f.push(['=SUM(E' + (i + 2) + ':G' + (i + 2) + ')']);
  sh.getRange(2, 8, n, 1).setFormulas(f);
}

/* ================= reading ================= */

function stockRows_() {
  var sh = sheet_(STOCK_SHEET);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var v = sh.getRange(2, 1, n, STOCK_HEAD.length).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) {
    var name = String(v[i][0] || '').trim();
    if (!name) continue;
    out.push({
      row: i + 2,
      item: name,
      category: String(v[i][1] || 'Other'),
      unit: String(v[i][2] || ''),
      price: Number(v[i][3]) || 0,
      Store: Number(v[i][4]) || 0,
      GWM: Number(v[i][5]) || 0,
      NP200: Number(v[i][6]) || 0,
      total: (Number(v[i][4]) || 0) + (Number(v[i][5]) || 0) + (Number(v[i][6]) || 0),
      counted: v[i][8] ? dateStr_(v[i][8]) : '',
      by: String(v[i][9] || '')
    });
  }
  return out;
}

/* ================= writing ================= */

/**
 * Writes one place's column and nothing else. Anything the app does not
 * send is left as it was, so a half-finished count never zeroes a shelf
 * somebody else already did.
 */
function stockSave_(user, place, counts) {
  if (STOCK_PLACES.indexOf(place) === -1) throw new Error('unknown place');
  var col = 5 + STOCK_PLACES.indexOf(place);          // E, F or G

  var sh = sheet_(STOCK_SHEET);
  var all = stockRows_();
  var byName = {};
  all.forEach(function (r) { byName[r.item.toLowerCase()] = r; });

  var now = new Date();
  var changed = 0, unknown = [];

  Object.keys(counts || {}).forEach(function (name) {
    var r = byName[String(name).toLowerCase()];
    if (!r) { unknown.push(name); return; }
    var q = Number(counts[name]);
    if (isNaN(q) || q < 0) return;
    if (r[place] === q) return;
    sh.getRange(r.row, col).setValue(q);
    sh.getRange(r.row, 9).setValue(now);
    sh.getRange(r.row, 10).setValue(user.username);
    changed++;
  });

  if (changed) {
    stockTotals_();
    log_(user.username, 'stockCount', place, '', changed + ' items');
  }
  return { changed: changed, unknown: unknown };
}

/** Adds an item nobody had on the list yet. */
function stockAdd_(user, it) {
  var name = String(it.item || '').trim();
  if (!name) throw new Error('an item name is required');
  var all = stockRows_();
  for (var i = 0; i < all.length; i++) {
    if (all[i].item.toLowerCase() === name.toLowerCase()) throw new Error('that item is already on the list');
  }
  var cat = String(it.category || 'Other');
  if (STOCK_CATS.indexOf(cat) === -1) cat = 'Other';
  sheet_(STOCK_SHEET).appendRow([name, cat, String(it.unit || ''),
    Number(it.price) || 0, 0, 0, 0, '', '', user.username]);
  stockTotals_();
  log_(user.username, 'stockAdd', name, '', cat);
  return { item: name };
}



/* ================= stock upload ================= */
function stockNorm_(s) {
  return String(s == null ? '' : s)
    .toLowerCase().replace(/[\u00a0]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function stockUpload_(user, place, rows, source, reference) {
  if (STOCK_PLACES.indexOf(place) === -1) throw new Error('unknown stock destination');
  if (!rows || !rows.length) throw new Error('no stock rows received');

  var sh = sheet_(STOCK_SHEET);
  var all = stockRows_();
  var byName = {};
  all.forEach(function(r) { byName[stockNorm_(r.item)] = r; });

  var col = 5 + STOCK_PLACES.indexOf(place);
  var now = new Date();
  var added = 0, skipped = 0, notFound = [], seen = {};

  rows.forEach(function(x) {
    var name = String(x.item || x.description || '').trim();
    var qty = Number(x.qty);
    if (!name || !isFinite(qty) || qty <= 0) { skipped++; return; }
    var key = stockNorm_(name);
    var r = byName[key];
    if (!r) {
      notFound.push({item:name, qty:qty});
      return;
    }
    /* Protect against duplicated lines in an invoice/PDF. */
    var rowKey = r.row + '|' + place;
    if (seen[rowKey]) return;
    seen[rowKey] = true;
    var oldQty = Number(r[place]) || 0;
    sh.getRange(r.row, col).setValue(oldQty + qty);
    sh.getRange(r.row, 9).setValue(now);
    sh.getRange(r.row, 10).setValue(user.username);
    added++;
  });

  if (added) {
    stockTotals_();
    log_(user.username, 'stockUpload', place, reference || source || '', added + ' items added');
  }
  return {added:added, skipped:skipped, notFound:notFound, source:source || '', reference:reference || ''};
}

/* ================= web app hooks ================= */

/** Returns a response, or null if this was not a stock request. */
function stockGet_(p, body) {
  if (p.action === 'stock') {
    auth_(body);                       // any active user, workers included
    return out_({ ok: true, stock: stockRows_(), places: STOCK_PLACES,
                  categories: STOCK_CATS });
  }
  return null;
}

function stockPost_(body) {
  if (body.action === 'stockCount') {
    var u = auth_(body);
    var res = stockSave_(u, String(body.place || ''), body.counts || {});
    return out_({ ok: true, changed: res.changed, unknown: res.unknown });
  }
  if (body.action === 'stockAdd') {
    var u2 = auth_(body, ['Admin', 'Technician']);
    return out_({ ok: true, added: stockAdd_(u2, body.item || {}) });
  }
  if (body.action === 'stockUpload') {
    var u3 = auth_(body, 'Admin');
    var res3 = stockUpload_(u3, String(body.place || ''), body.rows || [], String(body.source || ''), String(body.reference || ''));
    return out_({ ok:true, added:res3.added, skipped:res3.skipped, notFound:res3.notFound, source:res3.source, reference:res3.reference });
  }
  return null;
}

/* ================= the list ================= */

/**
 * Transcribed from the printed count sheet. Prices are the last price
 * paid where the scan was legible; blanks are items that had no price
 * on that sheet. Check it against your own copy before you rely on it
 * — a scan is a scan.
 */
function seedStock_() {
  var L = [
    // ---- wire & cable ----
    ['16mm House wire Red',        'Wire & Cable', 'per meter', 45.94],
    ['16mm House wire Blue',       'Wire & Cable', 'per meter', 45.94],
    ['16mm House wire White',      'Wire & Cable', 'per meter', 45.94],
    ['16mm House wire Black',      'Wire & Cable', 'per meter', 45.94],
    ['16mm Twin and Earth',        'Wire & Cable', 'per meter', 120.46],
    ['10mm Twin and Earth',        'Wire & Cable', 'per meter', 70.11],
    ['6mm Twin and Earth',         'Wire & Cable', 'per meter', 45.51],
    ['4mm Twin and Earth',         'Wire & Cable', 'per meter', 29.06],
    ['2.5mm Twin and Earth',       'Wire & Cable', 'per meter', 18.61],
    ['1.5mm Twin and Earth',       'Wire & Cable', 'per meter', 11.15],
    ['2.5mm Earth house wire',     'Wire & Cable', 'per meter', 0],
    ['1.5mm Earth house wire',     'Wire & Cable', 'per meter', 0],
    ['6mm Earth wire',             'Wire & Cable', 'per meter', 20.30],
    ['Rip Cord',                   'Wire & Cable', 'per meter', 0],
    ['Cat 6 Network Cable',        'Wire & Cable', 'per meter', 14],
    ['RJ45 connectors',            'Wire & Cable', 'each', 4],

    // ---- conduit & trunking ----
    ['40x40 PVC Trunking',         'Conduit & Trunking', 'each', 128],
    ['40x100 PVC Trunking',        'Conduit & Trunking', 'each', 168.96],
    ['75x100 PVC Trunking',        'Conduit & Trunking', 'each', 300.30],
    ['25mm PVC Conduit',           'Conduit & Trunking', 'each', 20.56],
    ['25mm PVC Sprague',           'Conduit & Trunking', 'each', 21.26],
    ['25mm PVC Round Box',         'Conduit & Trunking', 'each', 10],
    ['25mm PVC adapters',          'Conduit & Trunking', 'each', 2.50],
    ['25mm PVC couplings',         'Conduit & Trunking', 'each', 1],
    ['20mm PVC Adapters',          'Conduit & Trunking', 'each', 2],
    ['20mm PVC Couplings',         'Conduit & Trunking', 'each', 0.80],
    ['20mm Roundbox',              'Conduit & Trunking', 'each', 8],
    ['32mm PVC Conduit',           'Conduit & Trunking', 'each', 85],
    ['32mm PVC Sprague',           'Conduit & Trunking', 'each', 29.50],
    ['32mm PVC Adapters',          'Conduit & Trunking', 'each', 15],
    ['40x100 PVC end cap',         'Conduit & Trunking', 'each', 19.89],
    ['75x100 PVC end cap',         'Conduit & Trunking', 'each', 30],
    ['25mm PVC Saddles',           'Conduit & Trunking', 'each', 5],
    ['32mm PVC Saddles',           'Conduit & Trunking', 'each', 7.50],
    ['25mm White PVC Saddles',     'Conduit & Trunking', 'each', 0],
    ['32mm Couplings',             'Conduit & Trunking', 'each', 0],
    ['Compression Gland',          'Conduit & Trunking', 'each', 0],

    // ---- DB & enclosures ----
    ['18 way DB',                  'DB & Enclosures', 'each', 256],
    ['12 way DB',                  'DB & Enclosures', 'each', 194],
    ['8 way DB',                   'DB & Enclosures', 'each', 86],
    ['6 way DB',                   'DB & Enclosures', 'each', 82.61],
    ['4x4 Wonderbox',              'DB & Enclosures', 'each', 24.70],
    ['4x2 Wonderbox',              'DB & Enclosures', 'each', 21.49],
    ['4x4 Plug Socket',            'DB & Enclosures', 'each', 149.50],
    ['4x4 Blank Cover',            'DB & Enclosures', 'each', 59.80],
    ['4X4 Double Switch Socket RSA Synerji', 'DB & Enclosures', 'each', 81.90],
    ['4X2 Single Switch Socket RSA Synerji', 'DB & Enclosures', 'each', 0],
    ['4X4 SGL RSA Swt Skt 1xEuro+USB+C',     'DB & Enclosures', 'each', 251.55],
    ['PSO-1 Encl Slide Lid 040-060S',        'DB & Enclosures', 'each', 53],
    ['PSO-2 Encl Slide Lid 040-670',         'DB & Enclosures', 'each', 15],
    ['32A D/Pole 4x2 Isolator Synerji',      'DB & Enclosures', 'each', 86.58],
    ['45 Amp D/pole 40A C-curve 3ka 18mm Isolator', 'DB & Enclosures', 'each', 102.96],
    ['Neutral Bar Lear',           'DB & Enclosures', 'each', 0],
    ['Neutral Bar Isolated',       'DB & Enclosures', 'each', 0],
    ['DB Blanks Samite',           'DB & Enclosures', 'each', 0],
    ['DB Blanks DinRail',          'DB & Enclosures', 'each', 0],

    // ---- breakers (Dun Rail) ----
    ['3 pole 100 Amp Breaker',     'Breakers', 'each', 523],
    ['3 pole 80 Amp Breaker',      'Breakers', 'each', 454],
    ['3 pole 60 Amp Breaker',      'Breakers', 'each', 454],
    ['3 pole 50 Amp Breaker',      'Breakers', 'each', 454],
    ['3 pole 40 Amp Breaker',      'Breakers', 'each', 454],
    ['3 pole 32 Amp Breaker',      'Breakers', 'each', 0],
    ['2 pole 100 Amp Breaker',     'Breakers', 'each', 0],
    ['2 pole 60 Amp Breaker',      'Breakers', 'each', 542.32],
    ['2 pole 50 Amp Breaker',      'Breakers', 'each', 542.32],
    ['2 pole 40 Amp Breaker',      'Breakers', 'each', 542.32],
    ['2 pole 32 Amp Breaker',      'Breakers', 'each', 542.32],
    ['2 pole 25 Amp Breaker',      'Breakers', 'each', 542.32],
    ['2 pole 20 Amp Breaker',      'Breakers', 'each', 0],
    ['40 amp Changeover breaker',  'Breakers', 'each', 363],
    ['63 amp Changeover breaker',  'Breakers', 'each', 460],
    ['Hager Pilot Light 3-phase',  'Breakers', 'each', 435],
    ['Hager pilot light red',      'Breakers', 'each', 265],
    ['Hager pilot light green',    'Breakers', 'each', 265],
    ['1 pole 32 amp breaker',      'Breakers', 'each', 69.72],
    ['1 pole 20 amp breaker',      'Breakers', 'each', 69.72],
    ['1 pole 16 amp breaker',      'Breakers', 'each', 69.72],
    ['1 pole 10 amp breaker',      'Breakers', 'each', 69.72],
    ['1 pole 63 amp breaker',      'Breakers', 'each', 0],
    ['Surge protector AC',         'Breakers', 'each', 498.75],
    ['Earth Leakage',              'Breakers', 'each', 1340],
    // Samite / CBI
    ['Samite 3 pole 60 amp breaker', 'Breakers', 'each', 1100.47],
    ['Samite 3 pole 40 amp breaker', 'Breakers', 'each', 1100.47],
    ['Samite 3 pole 20 amp breaker', 'Breakers', 'each', 1100.47],
    ['Samite 2 pole 60 amp breaker', 'Breakers', 'each', 426.15],
    ['Samite 2 pole 40 amp breaker', 'Breakers', 'each', 280.20],
    ['Samite 2 pole 32 amp breaker', 'Breakers', 'each', 280.20],
    ['Samite 2 pole 30 amp breaker', 'Breakers', 'each', 0],
    ['Samite 2 pole 20 amp breaker', 'Breakers', 'each', 266.02],
    ['Samite 1 pole 60 Amp Breaker', 'Breakers', 'each', 0],
    ['Samite 1 pole 40 amp breaker', 'Breakers', 'each', 0],
    ['Samite 1 pole 32 amp breaker', 'Breakers', 'each', 120],
    ['Samite 1 pole 30 Amp breaker', 'Breakers', 'each', 0],
    ['Samite 1 pole 25 amp breaker', 'Breakers', 'each', 0],
    ['Samite 1 pole 20 amp breaker', 'Breakers', 'each', 120],
    ['Samite 1 pole 15 amp breaker', 'Breakers', 'each', 0],
    ['Samite 1 pole 10 amp breaker', 'Breakers', 'each', 120],
    ['Samite Earth Leakage',         'Breakers', 'each', 543.23],

    // ---- PV & DC ----
    ['Surge Protector DC',         'PV & DC', 'each', 348.13],
    ['6mm Red PV Cable',           'PV & DC', 'per meter', 12.72],
    ['6mm Black PV Cable',         'PV & DC', 'per meter', 12.72],
    ['25mm Red Battery Cable',     'PV & DC', 'per meter', 80.71],
    ['25mm Black Battery Cable',   'PV & DC', 'per meter', 80.71],
    ['35mm Red Battery Cable',     'PV & DC', 'per meter', 107.52],
    ['35mm Black Battery Cable',   'PV & DC', 'per meter', 107.52],
    ['50mm Red Battery Cable',     'PV & DC', 'per meter', 0],
    ['50mm Black Battery Cable',   'PV & DC', 'per meter', 0],
    ['70mm Red Battery Cable',     'PV & DC', 'per meter', 248.29],
    ['70mm Black Battery Cable',   'PV & DC', 'per meter', 248.29],
    ['DC Disconnect 160 Amps',     'PV & DC', 'each', 585.93],
    ['DC Disconnect 250 Amps',     'PV & DC', 'each', 1995.11],
    ['DC Disconnect 400 Amps',     'PV & DC', 'each', 2310.13],
    ['160 amp Fuses',              'PV & DC', 'each', 81.50],
    ['250 Amp Fuses',              'PV & DC', 'each', 183.14],
    ['400 Amp Fuses',              'PV & DC', 'each', 322.70],
    ['MC4 Female Connectors',      'PV & DC', 'each', 13.04],
    ['MC4 Male Connectors',        'PV & DC', 'each', 13.04],
    ['MC4 Male Splitter',          'PV & DC', 'each', 60],
    ['MC4 Female Splitter',        'PV & DC', 'each', 60],

    // ---- lugs & ferrules ----
    ['6-6 Lugs',                   'Lugs & Ferrules', 'each', 2.60],
    ['6-10 Lugs',                  'Lugs & Ferrules', 'each', 3.99],
    ['25-6 Lugs',                  'Lugs & Ferrules', 'each', 8.50],
    ['35-6 Lugs',                  'Lugs & Ferrules', 'each', 13.50],
    ['25-8 Lugs',                  'Lugs & Ferrules', 'each', 6.86],
    ['35-8 Lugs',                  'Lugs & Ferrules', 'each', 12],
    ['50-8 Lugs',                  'Lugs & Ferrules', 'each', 40.23],
    ['25-10 Lugs',                 'Lugs & Ferrules', 'each', 11.85],
    ['35-10 Lugs',                 'Lugs & Ferrules', 'each', 28.88],
    ['50-10 Lugs',                 'Lugs & Ferrules', 'each', 26],
    ['2.5mm Farrel',               'Lugs & Ferrules', 'each', 0],
    ['4mm Farrel',                 'Lugs & Ferrules', 'each', 1.91],
    ['6mm Farrel',                 'Lugs & Ferrules', 'each', 2.01],
    ['10mm Farrel',                'Lugs & Ferrules', 'each', 2.18],
    ['16mm Farrel',                'Lugs & Ferrules', 'each', 4.46],
    ['25mm Farrel',                'Lugs & Ferrules', 'each', 8.45],
    ['35mm Farrel',                'Lugs & Ferrules', 'each', 9.20],
    ['50mm Farrel',                'Lugs & Ferrules', 'each', 24.75],
    ['95mm Farrel',                'Lugs & Ferrules', 'each', 0],
    ['70mm Farrel',                'Lugs & Ferrules', 'each', 0],

    // ---- roof structure ----
    ['Left roof Hook',             'Roof Structure', 'each', 128.99],
    ['Right Roof hook',            'Roof Structure', 'each', 128.99],
    ['Alluminium Angles with Tbolt',    'Roof Structure', 'each', 38.71],
    ['Alluminium Angles without Tbolt', 'Roof Structure', 'each', 38.71],
    ['Aluminium Angles Offset holes with Tbolt',    'Roof Structure', 'each', 38.79],
    ['Aluminium Angles Offset holes without Tbolt', 'Roof Structure', 'each', 38.79],
    ['Segen Mid clamp (renusol)',  'Roof Structure', 'each', 40.62],
    ['Segen End Clamp (renusol)',  'Roof Structure', 'each', 19.08],
    ['Segen Black Mid clamp (renusol)', 'Roof Structure', 'each', 40.62],
    ['Segen Black End Clamp (renusol)', 'Roof Structure', 'each', 19.08],
    ['Schletter Mid Clamp',        'Roof Structure', 'each', 13.81],
    ['Schletter End Clamp',        'Roof Structure', 'each', 14.96],
    ['Segen Rails per meter (Renusol)', 'Roof Structure', 'per meter', 108],
    ['Hanger bolts (wood)',        'Roof Structure', 'each', 47.82],
    ['Hanger bolts (Steel)',       'Roof Structure', 'each', 69.65],
    ['Schletter Kliplock for 551/554', 'Roof Structure', 'each', 31.78],
    ['Schletter kliplock profile 2',   'Roof Structure', 'each', 95],
    ['KD Solar Kliplock',          'Roof Structure', 'each', 61.86],
    ['KD Solar midclamp',          'Roof Structure', 'each', 19.48],
    ['KD Solar endclamp',          'Roof Structure', 'each', 23.76],
    ['Segen (Renusol) Rail Connectors', 'Roof Structure', 'each', 66.22],
    ['Earth Spike',                'Roof Structure', 'each', 116.81],
    ['Earth Spike clamps',         'Roof Structure', 'each', 22],
    ['Galvanized Plate tops',      'Roof Structure', 'each', 0],
    ['Saddles',                    'Roof Structure', 'each', 0],
    ['8mm nuts',                   'Roof Structure', 'each', 0],
    ['8mm bolts',                  'Roof Structure', 'each', 0],
    ['Flat washers',               'Roof Structure', 'each', 0],
    ['Spring washers',             'Roof Structure', 'each', 0],
    ['T bolts',                    'Roof Structure', 'each', 0],
    ['Roof Screws',                'Roof Structure', 'each', 0],

    // ---- plumbing ----
    ['Compression elbow 15mm',     'Plumbing', 'each', 0],
    ['Compression elbow 22mm',     'Plumbing', 'each', 67.98],
    ['Compression T',              'Plumbing', 'each', 97.12],
    ['Soldering T',                'Plumbing', 'each', 27.81],
    ['Soldering 45 elbow 22mm',    'Plumbing', 'each', 10.50],
    ['Compression 22mm Female Coupling', 'Plumbing', 'each', 45.92],
    ['Compression 22mm Male Coupling',   'Plumbing', 'each', 44.15],
    ['22mm Insert',                'Plumbing', 'each', 4.12],
    ['15mm Insert',                'Plumbing', 'each', 3.98],
    ['Soldering coupling 22mm',    'Plumbing', 'each', 8.10],
    ['Soldering Coupling 15mm',    'Plumbing', 'each', 3.81],
    ['Non return valve - one way valve', 'Plumbing', 'each', 125],
    ['Soldering 22mm - 15mm Reducer',    'Plumbing', 'each', 1],
    ['Female 22mm compression Coupler',  'Plumbing', 'each', 0],
    ['Male 22mm Compression Coupler',    'Plumbing', 'each', 0],
    ['22mm Solder Elbow 90',       'Plumbing', 'each', 0],
    ['15mm Solder Elbow',          'Plumbing', 'each', 0],
    ['22mm Y strainer compression','Plumbing', 'each', 0],
    ['22mm Check Valve Female',    'Plumbing', 'each', 0],
    ['22mm Compression one way valve', 'Plumbing', 'each', 0],
    ['15mm 45 solder fitting',     'Plumbing', 'each', 0],
    ['Compression 15mm Male',      'Plumbing', 'each', 0],
    ['Compression 15mm Female',    'Plumbing', 'each', 0],

    // ---- consumable ----
    ['Cable Ties',                 'Consumable', 'each', 0],
    ['Label Printer Cartridge',    'Consumable', 'each', 259.99],
    ['Label Books',                'Consumable', 'each', 115],
    ['Middle Clamps',              'Consumable', 'each', 0],

    // ---- tools ----
    ['Label Printer',              'Tools', 'each', 1647.88],
    ['Heavy duty uninsulated crimper', 'Tools', 'each', 732.95],
    ['8mm Socket Wrench Screwdriver',  'Tools', 'each', 188.45],
    ['10mm Socket Wrench Screwdriver', 'Tools', 'each', 200.76],
    ['COB Intelligent induction headlight', 'Tools', 'each', 450.90],
    ['38mm Cable Cutter',          'Tools', 'each', 376.90],
    ['Wire Stripper',              'Tools', 'each', 491.29],
    ['160mm Long Nose Pliers',     'Tools', 'each', 197.28],
    ['200mm Pliers',               'Tools', 'each', 208.12],
    ['200mm Diagonal',             'Tools', 'each', 224.96],
    ['Utility Knife',              'Tools', 'each', 282.94],
    ['1000v insulated screwdriver set', 'Tools', 'each', 600.67],
    ['Universal Panel Key',        'Tools', 'each', 68.24],
    ['5 meter Magnetic Tip Tape Measure', 'Tools', 'each', 134.20],
    ['250mm Vice Grip',            'Tools', 'each', 191.21],
    ['300g Ball Pein Hammer',      'Tools', 'each', 216.13],
    ['Junior Hacksaw',             'Tools', 'each', 52.77],
    ['9 Piece Allen Key Set',      'Tools', 'each', 106.70],
    ['250mm Groove Joint Pliers',  'Tools', 'each', 261.71],
    ['300mm Groove Joint Pliers',  'Tools', 'each', 342.23],
    ['Long star screw driver (PH2)', 'Tools', 'each', 40],
    ['MC4 Crimping Tool',          'Tools', 'each', 795],
    ['Boot Lace Crimper',          'Tools', 'each', 569.25],
    ['Hand crimping tool',         'Tools', 'each', 2087.31],
    ['200mm Shifting Spanner',     'Tools', 'each', 299],
    ['250mm Shifting Spanner',     'Tools', 'each', 330],
    ['300mm Shifting Spanner',     'Tools', 'each', 350],
    ['17mm spanner',               'Tools', 'each', 155],
    ['15mm spanner',               'Tools', 'each', 138],
    ['13mm spanner',               'Tools', 'each', 92],
    ['10mm spanner',               'Tools', 'each', 45],
    ['14mm spanner',               'Tools', 'each', 78],
    ['T-Bar',                      'Tools', 'each', 120],
    ['17mm Socket',                'Tools', 'each', 40],
    ['16mm Socket',                'Tools', 'each', 40],
    ['10mm Socket Wrench Driver',  'Tools', 'each', 99],
    ['Wire stripper cutter',       'Tools', 'each', 110],
    ['Multimeter',                 'Tools', 'each', 349],
    ['Plug tester',                'Tools', 'each', 459],
    ['3-phase rotation tester',    'Tools', 'each', 3140],
    ['Chisel',                     'Tools', 'each', 179],
    ['25 pound hammer',            'Tools', 'each', 999],
    ['Flapper grinding disc',      'Tools', 'each', 55],
    ['Cutting grinding disc',      'Tools', 'each', 12.50],
    ['Diamond grinding disc',      'Tools', 'each', 63.50],
    ['Hydraulic crimper with Dies','Tools', 'each', 3700],
    ['Hammer Drill DHR202',        'Tools', 'each', 3349],
    ['Hand Drill DHP458',          'Tools', 'each', 3749],
    ['Multitool DTM50',            'Tools', 'each', 3569],
    ['Angle Grinder DGA456',       'Tools', 'each', 5219],
    ['Vacuum DVC750L',             'Tools', 'each', 4459],
    ['6ah 18 volt Makita batteries', 'Tools', 'each', 1949]
  ];

  var rows = L.map(function (r) {
    return [r[0], r[1], r[2], r[3], 0, 0, 0, '', '', ''];
  });
  sheet_(STOCK_SHEET).getRange(2, 1, rows.length, STOCK_HEAD.length).setValues(rows);
  log_('system', 'seedStock', rows.length + ' items', '', '');
  return rows.length;
}
