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

  return json({ result: 'success', date: date, recorded: recorded });
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
function normaliseDate(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
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
