/**
 * KOC Data Center - Load Reading
 * Google Apps Script web app behind load-reading.html.
 *
 * Readings are submitted a feeder at a time, because the equipment sits in
 * different areas and is read at different times. Each feeder becomes one row.
 *
 * Two request types, both POST:
 *
 *   { type: 'status', date: '2026-09-06' }
 *       -> what is already recorded for that date, so the page can show
 *          "Already Recorded" instead of letting someone enter it twice.
 *
 *   { type: 'load-reading', meta: {...}, rows: [ {...}, ... ] }
 *       -> save. Any row already present for that date is refused as a
 *          duplicate unless it carries replace:true, which overwrites the
 *          existing row in place rather than appending a correction.
 *
 * -------------------------------------------------------------------------
 * SETUP
 *   1. Open the target Google Sheet, Extensions > Apps Script.
 *   2. Paste this file over Code.gs and save.
 *   3. Deploy > New deployment > type "Web app".
 *        Execute as:        Me
 *        Who has access:    Anyone
 *      "Anyone" is required - the page posts without a Google sign-in.
 *   4. Copy the /exec URL into DC_CONFIG.endpoint in assets/js/config.js.
 *
 * AFTER ANY EDIT TO THIS FILE
 *   Deploy > Manage deployments > edit > Version: **New version** > Deploy.
 *   Saving alone does not update the published web app: the old code keeps
 *   running and the change fails silently.
 * -------------------------------------------------------------------------
 */

/** Tab the readings are written to. Created automatically if absent. */
var SHEET_NAME = 'Load Readings';

/** Column order. The header row is written once, on first use. */
var HEADERS = [
  'Timestamp', 'Date', 'Time', 'Taken by', 'Site',
  'Category', 'Equipment', 'Circuit', 'Rack', 'Rated A',
  'R', 'Y', 'B', 'Max A', '% loaded', 'Unbalance %', 'Remarks'
];

/* Column positions, 1-based, so the offsets below stay readable. */
var C_DATE = 2, C_CATEGORY = 6, C_EQUIPMENT = 7, C_CIRCUIT = 8;
var C_R = 11, C_Y = 12, C_B = 13;


function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ result: 'error', message: 'Empty request' });
    }

    var payload = JSON.parse(e.postData.contents);

    if (payload.type === 'status') return handleStatus(payload);
    if (payload.type === 'history') return handleHistory(payload);
    return handleSubmit(payload);

  } catch (err) {
    return json({ result: 'error', message: String(err) });
  }
}


/** Health check: opening the /exec URL in a browser should show this. */
function doGet() {
  return json({
    result: 'success',
    service: 'KOC Data Center load reading',
    sheet: SHEET_NAME,
    rows: Math.max(0, getSheet().getLastRow() - 1)
  });
}


/* =========================================================================
   status - what is already recorded for a given date
   ========================================================================= */

function handleStatus(payload) {
  var date = String(payload.date || '').trim();
  if (!date) return json({ result: 'error', message: 'No date given' });

  var index = readIndex(date);
  var recorded = {};

  for (var key in index) {
    var hit = index[key];
    recorded[key] = { r: hit.r, y: hit.y, b: hit.b, row: hit.row };
  }

  return json({ result: 'success', date: date, recorded: recorded,
                latest: latestDateOnSheet_() });
}

/* The most recent date the sheet holds anything for. Reads the date column
   alone rather than the whole width, and rides on the same memo. */
function latestDateOnSheet_() {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var col = sheet.getRange(2, C_DATE, last - 1, 1).getValues();
  var best = null;
  for (var i = 0; i < col.length; i++) {
    var d = normaliseDate(col[i][0]);
    if (d && (best === null || d > best)) best = d;
  }
  return best;
}


/* =========================================================================
   history - how the system has actually loaded over a period

   A single day's reading can miss the annual peak entirely, so an
   additional-load study has to be judged against the worst condition
   actually recorded, not against whatever today happened to be.

   Returns, for a date range:
     stats   per feeder - max, min, mean, median, count, and the DATE the
             maximum was recorded, so a peak can be traced back
     demand  the site demand, computed as the COINCIDENT sum of the two
             incomers on the same date. Taking max(A) + max(B) across
             different dates would invent a peak that never happened.
     cover   what the range really holds: first and last date found and
             how many distinct reading dates. The client needs this to say
             whether the requested period is actually covered.
   ========================================================================= */

function handleHistory(payload) {
  var from = normaliseDate(payload.from || '');
  var to = normaliseDate(payload.to || '');
  if (!from || !to) return json({ result: 'error', message: 'from and to dates are required' });

  var sheet = getSheet();
  var last = sheet.getLastRow();
  if (last < 2) {
    return json({ result: 'success', from: from, to: to,
                  cover: { dates: 0, first: null, last: null, rows: 0 },
                  stats: {}, demand: null });
  }

  var width = C_B - C_DATE + 1;
  var data = sheet.getRange(2, C_DATE, last - 1, width).getValues();

  var vals = {};          /* key -> [ {v, d} ] */
  var perDate = {};       /* date -> { 'Incomer A': v, 'Incomer B': v } */
  var seenDates = {};
  var rows = 0, first = null, lastSeen = null;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var d = normaliseDate(row[0]);
    if (!d || d < from || d > to) continue;

    rows++;
    seenDates[d] = true;
    if (!first || d < first) first = d;
    if (!lastSeen || d > lastSeen) lastSeen = d;

    var key = rowKey(row[C_CATEGORY - C_DATE],
                     row[C_EQUIPMENT - C_DATE],
                     row[C_CIRCUIT - C_DATE]);

    var r = Number(row[C_R - C_DATE]) || 0;
    var y = Number(row[C_Y - C_DATE]) || 0;
    var b = Number(row[C_B - C_DATE]) || 0;
    var v = Math.max(r, y, b);

    var ph = (v === r) ? 'R' : (v === y) ? 'Y' : 'B';
    if (!vals[key]) vals[key] = [];
    vals[key].push({ v: v, d: d, ph: ph });

    var eq = String(row[C_EQUIPMENT - C_DATE]).trim();
    if (eq === 'Incomer A' || eq === 'Incomer B') {
      if (!perDate[d]) perDate[d] = {};
      /* keep each phase separately: the transformer carries the sum of the
         two incomers PHASE BY PHASE, and summing the two maxima instead
         would invent a current that no conductor ever saw */
      var cur = perDate[d][eq] || { r: 0, y: 0, b: 0 };
      perDate[d][eq] = { r: Math.max(cur.r, r), y: Math.max(cur.y, y), b: Math.max(cur.b, b) };
    }
  }

  /* per feeder statistics */
  var stats = {};
  for (var k in vals) {
    var arr = vals[k];
    var nums = arr.map(function (x) { return x.v; }).sort(function (a, b) { return a - b; });
    var sum = 0;
    for (var j = 0; j < nums.length; j++) sum += nums[j];
    var top = arr[0];
    for (var m = 1; m < arr.length; m++) if (arr[m].v > top.v) top = arr[m];

    stats[k] = {
      n: nums.length,
      min: nums[0],
      max: nums[nums.length - 1],
      avg: sum / nums.length,
      med: median(nums),
      p95: percentile(nums, 0.95),
      maxDate: top.d,
      maxPhase: top.ph
    };
  }

  /* coincident site demand, per date */
  var demand = null;
  var dd = [];
  for (var dt in perDate) {
    var e = perDate[dt];
    /* only count a date where BOTH incomers were read, otherwise the
       total is not the site demand */
    if (e['Incomer A'] === undefined || e['Incomer B'] === undefined) continue;
    var a = e['Incomer A'], b2 = e['Incomer B'];
    var sr = a.r + b2.r, sy = a.y + b2.y, sb = a.b + b2.b;
    var sv = Math.max(sr, sy, sb);
    dd.push({ d: dt, v: sv, ph: (sv === sr) ? 'R' : (sv === sy) ? 'Y' : 'B',
              a: Math.max(a.r, a.y, a.b), b: Math.max(b2.r, b2.y, b2.b) });
  }
  if (dd.length) {
    var dv = dd.map(function (x) { return x.v; }).sort(function (a, b) { return a - b; });
    var dsum = 0;
    for (var q = 0; q < dv.length; q++) dsum += dv[q];
    var dtop = dd[0];
    for (var w = 1; w < dd.length; w++) if (dd[w].v > dtop.v) dtop = dd[w];
    demand = {
      n: dv.length, min: dv[0], max: dv[dv.length - 1],
      avg: dsum / dv.length, med: median(dv), p95: percentile(dv, 0.95),
      maxDate: dtop.d,
      maxPhase: dtop.ph,
      aAtMax: dtop.a,
      bAtMax: dtop.b,
      bothIncomersDates: dv.length
    };
  }

  var nDates = 0;
  for (var s2 in seenDates) nDates++;

  return json({
    result: 'success', from: from, to: to,
    cover: { dates: nDates, first: first, last: lastSeen, rows: rows },
    stats: stats, demand: demand
  });
}


function median(sorted) {
  if (!sorted.length) return null;
  var mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}


function percentile(sorted, p) {
  if (!sorted.length) return null;
  var idx = Math.ceil(p * sorted.length) - 1;
  if (idx < 0) idx = 0;
  if (idx >= sorted.length) idx = sorted.length - 1;
  return sorted[idx];
}


/* =========================================================================
   submit
   ========================================================================= */

function handleSubmit(payload) {
  var meta = payload.meta || {};
  var rows = payload.rows || [];

  if (!rows.length)  return json({ result: 'error', message: 'No readings in request' });
  if (!meta.date)    return json({ result: 'error', message: 'No reading date' });

  // A lock keeps two phones submitting at once from interleaving rows or
  // both getting past the duplicate check.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json({ result: 'error', message: 'Sheet busy, try again' });
  }

  try {
    var sheet = getSheet();
    var index = readIndex(meta.date);
    var stamp = new Date();

    var saved = [];        // keys written as new rows
    var replaced = [];     // keys that overwrote an existing row
    var duplicates = [];   // keys refused
    var appendRows = [];   // values queued for one setValues call
    var appendKeys = [];

    rows.forEach(function (r) {
      var key = rowKey(r.category, r.equipment, r.circuit);
      var existing = index[key];
      var values = buildRow(stamp, meta, r);

      if (existing) {
        if (!r.replace) {
          duplicates.push({ key: key, r: existing.r, y: existing.y, b: existing.b, row: existing.row });
          return;
        }
        sheet.getRange(existing.row, 1, 1, HEADERS.length).setValues([values]);
        replaced.push({ key: key, row: existing.row });
        return;
      }

      appendRows.push(values);
      appendKeys.push(key);
    });

    if (appendRows.length) {
      var first = sheet.getLastRow() + 1;
      sheet.getRange(first, 1, appendRows.length, HEADERS.length).setValues(appendRows);
      appendKeys.forEach(function (key, i) {
        saved.push({ key: key, row: first + i });
      });
    }

    return json({
      result: 'success',
      saved: saved,
      replaced: replaced,
      duplicates: duplicates
    });

  } catch (err) {
    return json({ result: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}


function buildRow(stamp, meta, r) {
  return [
    stamp,
    meta.date    || '',
    meta.time    || '',
    meta.takenBy || '',
    meta.site    || '',
    r.category   || '',
    r.equipment  || '',
    r.circuit    || '',
    r.rack       || '',
    blankOrNum(r.rated),
    blankOrNum(r.r),
    blankOrNum(r.y),
    blankOrNum(r.b),
    blankOrNum(r.max),
    blankOrNum(r.pct),
    blankOrNum(r.unbalance),
    meta.remarks || ''
  ];
}


/* =========================================================================
   sheet access
   ========================================================================= */

/**
 * Everything already recorded on one date, keyed by category|equipment|circuit.
 * Only the columns needed for the lookup are read, so this stays cheap as the
 * sheet grows.
 */
function readIndex(date) {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  var index = {};

  if (last < 2) return index;

  var width = C_B - C_DATE + 1;                       // Date .. B
  var data = sheet.getRange(2, C_DATE, last - 1, width).getValues();
  var want = normaliseDate(date);

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (normaliseDate(row[0]) !== want) continue;

    var key = rowKey(row[C_CATEGORY - C_DATE],
                     row[C_EQUIPMENT - C_DATE],
                     row[C_CIRCUIT - C_DATE]);

    // Last write wins, matching what a replace leaves behind.
    index[key] = {
      row: i + 2,
      r: row[C_R - C_DATE],
      y: row[C_Y - C_DATE],
      b: row[C_B - C_DATE]
    };
  }

  return index;
}


function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}


/* =========================================================================
   helpers
   ========================================================================= */

function rowKey(category, equipment, circuit) {
  return [String(category === undefined || category === null ? '' : category).trim(),
          String(equipment === undefined || equipment === null ? '' : equipment).trim(),
          String(circuit   === undefined || circuit   === null ? '' : circuit).trim()
         ].join('|');
}


/**
 * Sheets may store the date column as text or coerce it to a Date, depending
 * on the cell format. Reduce either to yyyy-MM-dd so the comparison holds.
 */
/* Both of the calls this used to make per row - getSpreadsheetTimeZone and
   formatDate - cross the Apps Script service bridge, which costs milliseconds
   each. On a sheet of 400 rows that was over 800 bridge calls for a single
   status check, and it was most of the ten seconds the page spent waiting.

   The timezone is fetched once. The formatted date is memoised on the
   timestamp, so a sheet holding five distinct dates formats five times
   instead of once per row. Both caches live only for the duration of one
   request, which is all Apps Script gives us anyway. */
var TZ_ = null;
var DATE_MEMO_ = {};

function sheetTz_() {
  if (TZ_ === null) TZ_ = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return TZ_;
}

function normaliseDate(v) {
  if (v instanceof Date) {
    var t = v.getTime();
    var hit = DATE_MEMO_[t];
    if (hit === undefined) {
      hit = Utilities.formatDate(v, sheetTz_(), 'yyyy-MM-dd');
      DATE_MEMO_[t] = hit;
    }
    return hit;
  }
  return String(v === null || v === undefined ? '' : v).trim().slice(0, 10);
}


/** Keep genuine zeros, but write '' rather than 0 for a missing reading. */
function blankOrNum(v) {
  if (v === '' || v === null || v === undefined) return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}


function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
