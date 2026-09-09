/* =============================================================
   KOC Data Center - Load Reading
   load-reading.js

   The equipment sits in different areas and is read at different
   times, so each feeder is submitted on its own and carries its own
   recorded state. Nothing here waits for a full round to be finished.

   Row states
     pending   nothing recorded for the selected date - editable
     sending   submit in flight
     recorded  saved during this session
     already   was in the sheet when the date was loaded
     error     submit failed, values kept, retry available

   "recorded" and "already" both lock the inputs. Update reopens the
   row and overwrites the existing sheet row rather than appending a
   second entry for the same feeder and date.
   ============================================================= */

(function () {
    'use strict';

    var DRAFT_KEY = 'koc-dc-load-reading-draft-v2';
    var THEME_KEY = 'koc-dc-theme';
    var NAME_KEY  = 'koc-dc-taken-by';
    var ENDPOINT_KEY = 'koc-dc-endpoint';
    var LATEST_KEY = 'koc-dc-latest-date';
    /* set once the operator picks a date themselves, so a background
       correction never drags them off the date they chose */
    var dateChosenByUser = false;
    /* guards the fallback below, so an old deployment is asked once a visit
       rather than after every status check */
    var latestChecked = false;



    var $  = function (id) { return document.getElementById(id); };
    var el = function (tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    };

    var allRows = [];    /* every .row element, main and PDU */
    var byKey   = {};    /* category|equipment|circuit -> row element */

    /* ---------------------------------------------------------
       helpers
       --------------------------------------------------------- */

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = parseFloat(v);
        return isFinite(n) ? n : null;
    }

    /* Breaker frame size out of a schedule string such as "20A" or "32 A". */
    function ratedFromBreaker(s) {
        if (!s) return null;
        var m = String(s).match(/(\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : null;
    }

    /* NEMA-style unbalance: greatest deviation from the mean, as a
       percentage of the mean. Only meaningful with all three phases. */
    function unbalance(r, y, b) {
        if (r === null || y === null || b === null) return null;
        var avg = (r + y + b) / 3;
        if (avg <= 0) return null;
        var dev = Math.max(Math.abs(r - avg), Math.abs(y - avg), Math.abs(b - avg));
        return (dev / avg) * 100;
    }

    function fmt(n, dp) {
        if (n === null || n === undefined) return '';
        return n.toFixed(dp === undefined ? 1 : dp);
    }

    function keyOf(category, equipment, circuit) {
        return [category, equipment, circuit || ''].join('|');
    }

    /* Where the readings are sent.

       The deployment URL is a write key: the Apps Script has to accept
       "Anyone", so whoever holds the URL can append rows. It therefore lives
       on the device rather than in the source, so this page can be published
       somewhere public without publishing the way into the sheet. Set once
       per device, per site. config.js can still carry one for a private copy. */
    function endpointUrl() {
        var v = '';
        try { v = localStorage.getItem(ENDPOINT_KEY) || ''; } catch (e) { v = ''; }
        return v || DC_CONFIG.endpoint || '';
    }

    function setEndpoint(url) {
        try { localStorage.setItem(ENDPOINT_KEY, url); } catch (e) { /* ignore */ }
    }

    function forgetEndpoint() {
        try { localStorage.removeItem(ENDPOINT_KEY); } catch (e) { /* ignore */ }
    }

    /* Just the deployment id, for showing which sheet is connected. */
    function endpointLabel(u) {
        var m = String(u).match(/\/s\/([^/]+)\//);
        return m ? '\u2026' + m[1].slice(-8) : u.slice(0, 32);
    }

    /* How a PDU way is wired: '3' four pole three phase, or 'R' / 'Y' / 'B'
       for a two pole RCBO on that phase. Comes from config.js, which
       transcribes the phase letters printed on the PDU single line
       diagrams. phaseOverrides is the escape hatch if a way is rewired. */
    function phaseOf(row) {
        var ov = DC_CONFIG.phaseOverrides || {};
        var ok = row._item.equipment + '|' + row._item.circuit;
        if (Object.prototype.hasOwnProperty.call(ov, ok)) return ov[ok];
        return row._item.ph || '';
    }

    /* ---------------------------------------------------------
       row construction
       --------------------------------------------------------- */

    function buildRow(item) {
        var row = el('div', 'row');
        row.dataset.key = item.key;
        /* A spare way has nothing connected - still recordable, just quiet.
           Matched on the prefix, because the drawings qualify some of them:
           "SPARE IND. SOCKET" is still a spare and should read as one. */
        if ((item.rack || '').toUpperCase().indexOf('SPARE') === 0) row.classList.add('is-spare');

        var cn = el('div', 'cell-n');
        cn.appendChild(el('div', 'row-name', item.name));

        var meta = el('div', 'row-meta');
        if (item.meta) meta.appendChild(el('span', '', item.meta));

        /* How the way is wired, straight from the drawing. */
        if (item.category === 'PDU' && item.ph) {
            var tag = el('span', 'phase-tag phase-' + item.ph,
                         item.ph === '3' ? '4 pole \u00b7 3 phase' : '2 pole \u00b7 ' + item.ph + ' phase');
            tag.title = item.ph === '3'
                ? 'Four pole RCBO feeding a three phase load'
                : 'Two pole RCBO, ' + item.ph + ' phase and neutral - only this phase exists';
            meta.appendChild(tag);
        }

        cn.appendChild(meta);
        row.appendChild(cn);

        ['r', 'y', 'b'].forEach(function (p) {
            var cell = el('div', 'cell-' + p);
            var inp = el('input');
            inp.type = 'number';
            inp.step = '0.1';
            inp.min = '0';
            /* iOS: decimal keypad rather than the full keyboard */
            inp.setAttribute('inputmode', 'decimal');
            inp.setAttribute('enterkeyhint', 'next');
            inp.autocomplete = 'off';
            inp.setAttribute('autocorrect', 'off');
            inp.className = 'p-' + p;
            inp.placeholder = p.toUpperCase();
            inp.setAttribute('aria-label', item.name + ' ' + p.toUpperCase() + ' phase current, amperes');
            inp.dataset.phase = p;
            cell.appendChild(inp);
            row.appendChild(cell);
        });

        var cc = el('div', 'cell-c calc');
        cc.appendChild(el('span', 'pill pill-load', ''));
        cc.appendChild(el('span', 'pill pill-unb', ''));
        row.appendChild(cc);

        /* action cell - submit button, or the recorded state once saved */
        var ca = el('div', 'cell-a');

        var btn = el('button', 'btn-sm row-submit');
        btn.type = 'button';
        btn.textContent = 'Submit';
        btn.disabled = true;
        btn.addEventListener('click', function () { submitRows([row]); });
        ca.appendChild(btn);

        var state = el('span', 'rowstate');
        state.hidden = true;
        ca.appendChild(state);

        var edit = el('button', 'btn-xs row-edit');
        edit.type = 'button';
        edit.textContent = 'Update';
        edit.hidden = true;
        edit.title = 'Correct this reading - it overwrites the sheet row rather than adding a second one';
        edit.addEventListener('click', function () { unlockRow(row); });
        ca.appendChild(edit);

        row.appendChild(ca);

        row._item  = item;
        row._state = 'pending';
        return row;
    }

    /* Show only the inputs the way actually has. */
    function applyPhase(row) {
        var ph = phaseOf(row);
        var single = (ph === 'R' || ph === 'Y' || ph === 'B');

        ['r', 'y', 'b'].forEach(function (p) {
            var cell = row.querySelector('.cell-' + p);
            var inp  = cell.querySelector('input');
            var off  = single && p !== ph.toLowerCase();
            cell.classList.toggle('phase-off', off);
            inp.disabled = off;
            /* a hidden field must not carry a stale value into the sheet */
            if (off && inp.value !== '') inp.value = '';
        });

        row.classList.toggle('single-phase', single);
        refreshRow(row);
    }



    function readRow(row) {
        var v = {};
        row.querySelectorAll('input[data-phase]').forEach(function (i) {
            v[i.dataset.phase] = num(i.value);
        });
        return v;
    }

    function writeRow(row, r, y, b) {
        var ins = row.querySelectorAll('input[data-phase]');
        [r, y, b].forEach(function (v, i) {
            ins[i].value = (v === null || v === undefined || v === '') ? '' : v;
        });
    }

    function hasValues(row) {
        var v = readRow(row);
        return v.r !== null || v.y !== null || v.b !== null;
    }

    function isDone(row) {
        return row._state === 'recorded' || row._state === 'already';
    }

    /* ---------------------------------------------------------
       row state
       --------------------------------------------------------- */

    function setRowState(row, state, opts) {
        opts = opts || {};
        row._state = state;

        var btn    = row.querySelector('.row-submit');
        var pill   = row.querySelector('.rowstate');
        var edit   = row.querySelector('.row-edit');
        var locked = (state === 'recorded' || state === 'already');

        row.classList.toggle('locked', locked);
        row.classList.toggle('sending', state === 'sending');
        row.classList.toggle('row-error', state === 'error');

        row.querySelectorAll('input[data-phase]').forEach(function (i) {
            i.readOnly = locked || state === 'sending';
        });


        btn.hidden  = locked;
        pill.hidden = !locked && state !== 'error';
        edit.hidden = !locked;

        if (state === 'pending') {
            btn.disabled = !hasValues(row);
            btn.textContent = row._replace ? 'Update' : 'Submit';
            pill.className = 'rowstate';
            pill.textContent = '';
        }

        if (state === 'sending') {
            btn.disabled = true;
            btn.textContent = 'Saving…';
        }

        if (state === 'recorded') {
            pill.className = 'rowstate ok';
            pill.textContent = 'Recorded ✓';
            pill.title = 'R, Y and B saved to the sheet for ' + ($('fDate').value || 'this date');
        }

        if (state === 'already') {
            pill.className = 'rowstate dup';
            pill.textContent = 'Already Recorded';
            pill.title = 'This feeder already has a reading in the sheet for ' +
                         ($('fDate').value || 'this date') + '. Use Update to correct it.';
        }

        if (state === 'error') {
            btn.disabled = false;
            btn.hidden = false;
            btn.textContent = 'Retry';
            pill.className = 'rowstate err';
            pill.textContent = opts.message || 'Not saved';
            pill.title = opts.message || '';
        }

        refreshRow(row);
    }

    function unlockRow(row) {
        row._replace = true;
        setRowState(row, 'pending');
        refreshTotals();
        var first = row.querySelector('input[data-phase]');
        if (first) first.focus();
    }

    /* Recalculate the two pills on one row and flag it as filled. */
    function refreshRow(row) {
        var v = readRow(row);
        var item = row._item;
        var any = v.r !== null || v.y !== null || v.b !== null;
        row.classList.toggle('filled', any);

        var loadPill = row.querySelector('.pill-load');
        var unbPill  = row.querySelector('.pill-unb');

        if (!any) {
            loadPill.textContent = '';
            loadPill.className = 'pill pill-load';
            unbPill.textContent = '';
            unbPill.className = 'pill pill-unb';
            return;
        }

        var max = Math.max(v.r || 0, v.y || 0, v.b || 0);

        if (item.rated) {
            var pct = (max / item.rated) * 100;
            loadPill.textContent = fmt(pct, 0) + '% of ' + item.rated + 'A';
            loadPill.className = 'pill pill-load ' +
                (pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'ok');
            loadPill.title = 'Highest phase ' + fmt(max, 1) + ' A against a rating of ' +
                item.rated + ' A' +
                (item.category === 'PDU'
                    ? '. Breaker size is from the 2025 load schedule and has not been '
                      + 'verified against the panel - treat the percentage as indicative.'
                    : '');
        } else {
            loadPill.textContent = fmt(max, 1) + ' A max';
            loadPill.className = 'pill pill-load';
        }

        var u = row.classList.contains('single-phase') ? null : unbalance(v.r, v.y, v.b);
        if (u === null) {
            unbPill.textContent = '';
            unbPill.className = 'pill pill-unb';
        } else {
            unbPill.textContent = fmt(u, 0) + '% unb';
            unbPill.className = 'pill pill-unb ' + (u > 20 ? 'bad' : u > 10 ? 'warn' : 'ok');
            unbPill.title = 'Phase unbalance, greatest deviation from the mean of the three phases';
        }
    }

    /* ---------------------------------------------------------
       page build
       --------------------------------------------------------- */

    function headerRow(nameLabel) {
        var h = el('div', 'rowhead');
        h.appendChild(el('div', '', nameLabel));
        h.appendChild(el('div', 'num h-r', 'R (A)'));
        h.appendChild(el('div', 'num h-y', 'Y (A)'));
        h.appendChild(el('div', 'num h-b', 'B (A)'));
        h.appendChild(el('div', '', ''));
        h.appendChild(el('div', '', 'Status'));
        return h;
    }

    function register(row) {
        allRows.push(row);
        byKey[row.dataset.key] = row;
    }

    function buildMain() {
        var host = $('mainRows');
        host.appendChild(headerRow('Equipment'));
        var set = el('div', 'rowset');

        DC_CONFIG.equipment.forEach(function (e) {
            var meta = e.source;
            if (e.note) meta += '  ·  ' + e.note;
            var row = buildRow({
                key:       keyOf('Main', e.name, ''),
                category:  'Main',
                equipment: e.name,
                circuit:   '',
                rack:      '',
                name:      e.name,
                meta:      meta,
                rated:     e.rated
            });
            set.appendChild(row);
            register(row);
        });

        host.appendChild(set);
    }

    function buildPDUs() {
        var host = $('pduPanels');

        Object.keys(DC_CONFIG.pduCircuits).forEach(function (pdu) {
            var circuits = DC_CONFIG.pduCircuits[pdu];
            var feed = DC_PDU_FEED[pdu] || '';

            var panel = el('div', 'pdu feed-' + feed);
            panel.dataset.pdu = pdu;

            var head = el('div', 'pdu-head');

            var toggle = el('button', 'pdu-toggle');
            toggle.type = 'button';
            toggle.innerHTML =
                '<svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>' +
                '<span class="feed-dot"></span>' +
                '<span class="pdu-name">' + pdu + '</span>' +
                '<span class="pdu-meta">Feed ' + feed + '  ·  ' + circuits.length + ' ways</span>';
            toggle.addEventListener('click', function () { panel.classList.toggle('open'); });
            head.appendChild(toggle);

            var activeWays = circuits.filter(function (c) { return !isSpare(c.rack); }).length;
            head.appendChild(el('span', 'pill pdu-progress', '0 / ' + activeWays + ' recorded'));

            var sub = el('button', 'btn-sm pdu-submit');
            sub.type = 'button';
            sub.textContent = 'Submit pending';
            sub.disabled = true;
            sub.title = 'Submit every reading entered in this PDU that is not yet recorded';
            sub.addEventListener('click', function () { submitRows(pendingIn(panel)); });
            head.appendChild(sub);

            var body = el('div', 'pdu-body');


            body.appendChild(headerRow('Circuit'));
            var set = el('div', 'rowset');

            circuits.forEach(function (c) {
                var row = buildRow({
                    key:       keyOf('PDU', pdu, c.c),
                    category:  'PDU',
                    equipment: pdu,
                    circuit:   c.c,
                    rack:      c.rack,
                    name:      c.c + '  ' + (c.rack || ''),
                    meta:      c.breaker ? 'Breaker ' + c.breaker : '',
                    rated:     ratedFromBreaker(c.breaker),
                    ph:        c.ph || ''
                });
                set.appendChild(row);
                register(row);
            });

            body.appendChild(set);
            panel.appendChild(head);
            panel.appendChild(body);
            host.appendChild(panel);
        });
    }

    /* Rows in a container that hold values and are not yet recorded. */
    function pendingIn(container) {
        return Array.prototype.filter.call(
            container.querySelectorAll('.row'),
            function (r) { return !isDone(r) && r._state !== 'sending' && hasValues(r); });
    }

    /* ---------------------------------------------------------
       totals
       --------------------------------------------------------- */

    /* A spare is any way whose label carries the word, however the drawing
       qualifies it - "SPARE", "SPARE IND. SOCKET", "SPARE Cabin C-03",
       "Cabin G-10 SPARE". None of them is a circuit anyone goes out to read,
       so counting them in the target only ever made the day look unfinished. */
    function isSpare(rack) {
        return /SPARE/i.test(rack || '');
    }

    function pduCounts() {
        var active = 0, spare = 0;
        Object.keys(DC_CONFIG.pduCircuits).forEach(function (k) {
            DC_CONFIG.pduCircuits[k].forEach(function (c) {
                if (isSpare(c.rack)) spare++; else active++;
            });
        });
        return { active: active, spare: spare, total: active + spare };
    }
    function pduTotal() { return pduCounts().total; }

    function refreshTotals() {
        var recMain = 0, recPdu = 0, recPduSpare = 0, pending = 0, flagged = 0, inFlight = 0;

        allRows.forEach(function (row) {
            if (isDone(row)) {
                if (row._item.category === 'Main') recMain++;
                else if (isSpare(row._item.rack)) recPduSpare++;
                else recPdu++;
            } else if (row._state === 'sending') {
                /* in flight - neither recorded nor still to send. Leaving it
                   out of the count is what disables the submit buttons for the
                   two or three seconds the request takes, so a second click
                   cannot fire while the first is still going. */
                inFlight++;
            } else if (hasValues(row)) {
                pending++;
            }

            if (!hasValues(row)) return;
            var v = readRow(row);
            var max = Math.max(v.r || 0, v.y || 0, v.b || 0);
            var u = unbalance(v.r, v.y, v.b);
            if ((row._item.rated && max > row._item.rated * 0.8) || (u !== null && u > 10)) flagged++;
        });

        $('statMain').textContent    = recMain + ' / ' + DC_CONFIG.equipment.length;
        var pc = pduCounts();
        $('statPdu').textContent = recPdu + ' / ' + pc.active;
        $('statPduSpare').textContent = 'Spare ' + pc.spare
            + (recPduSpare ? '  ·  ' + recPduSpare + ' recorded' : '');
        $('statPending').textContent = inFlight ? 'saving…' : pending;
        $('statFlag').textContent    = flagged;

        document.querySelectorAll('.pdu').forEach(function (panel) {
            var rows = panel.querySelectorAll('.row');
            var done = 0, active = 0;
            rows.forEach(function (r) {
                if (isSpare(r._item && r._item.rack)) return;
                active++;
                if (isDone(r)) done++;
            });
            var pill = panel.querySelector('.pdu-progress');
            pill.textContent = done + ' / ' + active + ' recorded';
            pill.className = 'pill pdu-progress' + (done === 0 ? '' : done === active ? ' ok' : ' warn');

            var n = pendingIn(panel).length;
            var sub = panel.querySelector('.pdu-submit');
            sub.disabled = n === 0;
            sub.textContent = n ? 'Submit ' + n + ' pending' : 'Submit pending';
        });

        var mainPending = pendingIn($('mainRows')).length;
        var mainBtn = $('submitMain');
        mainBtn.disabled = mainPending === 0;
        mainBtn.textContent = mainPending ? 'Submit ' + mainPending + ' pending' : 'Submit pending';

        /* One request carries any number of rows, so submitting everything
           entered costs about the same wait as submitting one. */
        var allBtn = $('submitAll');
        allBtn.disabled = pending === 0;
        allBtn.lastElementChild.textContent =
            pending ? 'Submit all ' + pending + ' pending' : 'Submit all pending';
        allBtn.title = pending
            ? 'Send all ' + pending + ' readings entered on this page in one request'
            : 'Nothing entered that has not already been recorded';
    }

    /* ---------------------------------------------------------
       draft - pending entries only, recorded rows live in the sheet
       --------------------------------------------------------- */

    var saveTimer = null;

    function saveDraft() {
        var d = { meta: readMeta(), values: {} };
        allRows.forEach(function (row) {
            if (isDone(row)) return;
            var v = readRow(row);
            if (v.r !== null || v.y !== null || v.b !== null) d.values[row.dataset.key] = [v.r, v.y, v.b];
        });
        var n = Object.keys(d.values).length;
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
            markDraft(n ? n + ' entered, not yet submitted' : '');
        } catch (e) {
            markDraft('Could not save draft to this browser');
        }
    }

    function queueSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveDraft, 500);
    }

    /* Put back anything typed but not submitted. Never touches a row the
       sheet has already answered for. */
    function loadDraft() {
        var raw;
        try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return 0; }
        if (!raw) return 0;
        var d;
        try { d = JSON.parse(raw); } catch (e) { return 0; }
        if (!d || !d.values) return 0;

        if (d.meta) {
            if (d.meta.time && !$('fTime').value) $('fTime').value = d.meta.time;
            if (d.meta.takenBy && !$('fBy').value) $('fBy').value = d.meta.takenBy;
            if (d.meta.remarks && !$('fRemarks').value) $('fRemarks').value = d.meta.remarks;
        }

        var n = 0;
        Object.keys(d.values).forEach(function (key) {
            var row = byKey[key];
            if (!row || isDone(row) || hasValues(row)) return;
            var v = d.values[key];
            writeRow(row, v[0], v[1], v[2]);
            setRowState(row, 'pending');
            n++;
        });

        if (n) {
            openPanelsWithWork();
            refreshTotals();
        }
        return n;
    }

    function clearDraft() {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* nothing to do */ }
    }

    function markDraft(msg) {
        var d = $('draftNote');
        if (d) d.textContent = msg;
    }

    function openPanelsWithWork() {
        document.querySelectorAll('.pdu').forEach(function (panel) {
            if (panel.querySelector('.row.filled:not(.locked)')) panel.classList.add('open');
        });
    }

    /* ---------------------------------------------------------
       collect
       --------------------------------------------------------- */

    function readMeta() {
        return {
            site:    DC_CONFIG.site,
            date:    $('fDate').value,
            time:    $('fTime').value,
            takenBy: $('fBy').value.trim(),
            remarks: $('fRemarks').value.trim()
        };
    }

    function payloadFor(row) {
        var v = readRow(row);
        var it = row._item;
        var max = Math.max(v.r || 0, v.y || 0, v.b || 0);
        var u = unbalance(v.r, v.y, v.b);
        return {
            category:  it.category,
            equipment: it.equipment,
            circuit:   it.circuit,
            rack:      it.rack,
            rated:     it.rated === null || it.rated === undefined ? '' : it.rated,
            r: v.r === null ? '' : v.r,
            y: v.y === null ? '' : v.y,
            b: v.b === null ? '' : v.b,
            max:       max,
            pct:       it.rated ? Math.round((max / it.rated) * 1000) / 10 : '',
            unbalance: u === null ? '' : Math.round(u * 10) / 10,
            replace:   !!row._replace
        };
    }

    /* ---------------------------------------------------------
       CSV - works with no network at all
       --------------------------------------------------------- */

    var CSV_HEAD = ['Date', 'Time', 'Taken by', 'Site', 'Category', 'Equipment', 'Circuit',
                    'Rack', 'Rated A', 'R', 'Y', 'B', 'Max A', '% loaded', 'Unbalance %',
                    'Status', 'Remarks'];

    function csvCell(v) {
        var s = (v === null || v === undefined) ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function downloadCSV() {
        var meta = readMeta();
        var rows = allRows.filter(hasValues);
        if (!rows.length) { setStatus('err', 'Nothing to export - no readings entered yet.'); return; }

        var lines = [CSV_HEAD.join(',')];
        rows.forEach(function (row) {
            var r = payloadFor(row);
            var status = row._state === 'recorded' ? 'Recorded'
                       : row._state === 'already'  ? 'Already recorded'
                       : 'Not submitted';
            lines.push([meta.date, meta.time, meta.takenBy, meta.site,
                        r.category, r.equipment, r.circuit, r.rack, r.rated,
                        r.r, r.y, r.b, r.max, r.pct, r.unbalance, status, meta.remarks]
                       .map(csvCell).join(','));
        });

        var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'DC-load-reading-' + (meta.date || 'draft') + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        setStatus('ok', 'Exported ' + rows.length + ' readings to CSV.');
    }

    /* ---------------------------------------------------------
       status line
       --------------------------------------------------------- */

    var statusTimer = null;

    function setStatus(kind, msg, busy) {
        var s = $('status');
        clearTimeout(statusTimer);
        s.className = 'status' + (kind ? ' ' + kind : '');
        s.innerHTML = '';
        if (!msg) return;

        if (busy) s.appendChild(el('span', 'spinner'));
        s.appendChild(el('span', '', msg));

        if (!busy) {
            var close = el('button', 'status-close', '×');
            close.type = 'button';
            close.setAttribute('aria-label', 'Dismiss');
            close.addEventListener('click', function () { setStatus('', ''); });
            s.appendChild(close);
        }

        /* good news clears itself, problems stay until dealt with */
        if (kind === 'ok') statusTimer = setTimeout(function () { setStatus('', ''); }, 5000);
    }

    /* A submit refused for a missing header field used to fail silently: the
       message sits at the foot of a page thousands of pixels long. Bring the
       field to the reader instead. */
    function demandField(id, msg) {
        var f = $(id);
        setStatus('err', msg);
        f.scrollIntoView({ behavior: 'smooth', block: 'center' });
        f.classList.remove('flash');
        void f.offsetWidth;
        f.classList.add('flash');
        setTimeout(function () { f.focus({ preventScroll: true }); }, 260);
    }

    function markStatusBadge(msg, busy) {
        var b = $('dateStatus');
        if (!b) return;
        b.innerHTML = '';
        if (busy) b.appendChild(el('span', 'spinner'));
        b.appendChild(el('span', '', msg));
    }

    /* ---------------------------------------------------------
       talking to the sheet
       --------------------------------------------------------- */

    function post(body) {
        return fetch(endpointUrl(), { method: 'POST', body: JSON.stringify(body) })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (d) {
                if (!d || d.result !== 'success') {
                    throw new Error((d && d.message) || 'Unexpected response');
                }
                return d;
            });
    }

    /**
     * Ask the sheet what is already recorded for the selected date and mark
     * those rows. Runs on load and whenever the date changes.
     */
    function loadStatusForDate() {
        var date = $('fDate').value;

        /* Drop any state belonging to the previously selected date. A recorded
           row is committed to that date, so its values are cleared rather than
           carried across - otherwise yesterday's numbers sit in the form ready
           to be submitted as today's. Rows merely typed and not yet submitted
           are left alone: correcting a wrong date is exactly when you want to
           keep them. */
        allRows.forEach(function (row) {
            if (!isDone(row)) return;
            writeRow(row, '', '', '');
            row._fromSheet = false;
            row._replace   = false;
            row._sheetRow  = null;
            setRowState(row, 'pending');
        });

        if (!date) {
            markStatusBadge('No date selected');
            refreshTotals();
            return Promise.resolve();
        }

        if (!endpointUrl()) {
            markStatusBadge('No sheet connected');
            refreshTotals();
            loadDraft();
            return Promise.resolve();
        }

        markStatusBadge('Checking the sheet…', true);

        return post({ type: 'status', date: date })
            .then(function (d) {
                /* The reply says which date the sheet most recently holds.
                   Remembering it is what lets the next visit open on the right
                   date without asking first. */
                if (d.latest) {
                    try { localStorage.setItem(LATEST_KEY, d.latest); } catch (e) { /* ignore */ }
                    if (d.latest !== date && !dateChosenByUser) {
                        $('fDate').value = d.latest;
                        return loadStatusForDate();
                    }
                } else if (!latestChecked) {
                    /* An older deployment does not report it. Ask separately,
                       but in the background - this must never hold up the
                       readings that have already arrived. */
                    latestChecked = true;
                    latestDate().then(function (l) {
                        if (!l) return;
                        try { localStorage.setItem(LATEST_KEY, l); } catch (e) { /* ignore */ }
                        if (l !== $('fDate').value && !dateChosenByUser) {
                            $('fDate').value = l;
                            loadStatusForDate();
                        }
                    });
                }
                var n = 0;
                Object.keys(d.recorded || {}).forEach(function (key) {
                    var row = byKey[key];
                    if (!row) return;
                    var hit = d.recorded[key];
                    writeRow(row, hit.r, hit.y, hit.b);
                    row._fromSheet = true;
                    row._sheetRow  = hit.row;
                    setRowState(row, 'already');
                    n++;
                });
                markStatusBadge(n + ' already recorded for ' + date);
                loadDraft();
                openPanelsWithWork();
                refreshTotals();
            })
            .catch(function (e) {
                console.error('Status check failed:', e);
                markStatusBadge('Could not reach the sheet');
                setStatus('err', 'Could not check what is already recorded for ' + date + ' (' +
                                 e.message + '). You can still enter and submit — the sheet ' +
                                 'refuses duplicates on its own.');
                loadDraft();
                refreshTotals();
            });
    }

    /**
     * Submit one or more rows. Every path goes through here - the per-row
     * button, the section buttons - so state is marked the same way.
     */
    function submitRows(rows) {
        rows = (rows || []).filter(hasValues);
        if (!rows.length) return;

        var meta = readMeta();
        if (!meta.date)    { demandField('fDate', 'Enter the reading date before submitting.'); return; }
        if (!meta.takenBy) { demandField('fBy', 'Enter who took the readings before submitting.'); return; }

        if (!endpointUrl()) {
            setStatus('err', 'No Google Sheet connected on this device yet. Paste the web app URL ' +
                             'in the banner at the top, or use Export CSV in the meantime.');
            return;
        }

        var payload = rows.map(payloadFor);
        rows.forEach(function (row) { setRowState(row, 'sending'); });
        refreshTotals();
        setStatus('busy', 'Saving ' + rows.length + ' reading' + (rows.length === 1 ? '' : 's') + '…', true);

        post({ type: 'load-reading', meta: meta, rows: payload })
            .then(function (d) {
                var done = 0, dup = 0;

                (d.saved || []).concat(d.replaced || []).forEach(function (hit) {
                    var row = byKey[hit.key];
                    if (!row) return;
                    row._sheetRow  = hit.row;
                    row._replace   = false;
                    row._fromSheet = false;
                    setRowState(row, 'recorded');
                    done++;
                });

                (d.duplicates || []).forEach(function (hit) {
                    var row = byKey[hit.key];
                    if (!row) return;
                    /* the sheet already holds a reading - show what is there */
                    writeRow(row, hit.r, hit.y, hit.b);
                    row._fromSheet = true;
                    row._sheetRow  = hit.row;
                    setRowState(row, 'already');
                    dup++;
                });

                /* anything the server did not answer for stays entered */
                rows.forEach(function (row) {
                    if (row._state === 'sending') setRowState(row, 'pending');
                });

                saveDraft();
                refreshTotals();

                if (dup && done) {
                    setStatus('ok', 'Recorded ' + done + '. ' + dup + ' already had a reading for ' +
                                    meta.date + ' and were left unchanged.');
                } else if (dup) {
                    setStatus('err', dup + (dup === 1 ? ' feeder already has' : ' feeders already have') +
                                     ' a reading for ' + meta.date + '. Use Update on the row to correct it.');
                } else {
                    setStatus('ok', 'Recorded ' + done + ' reading' + (done === 1 ? '' : 's') +
                                    ' for ' + meta.date + '.');
                }
            })
            .catch(function (e) {
                console.error('Submit failed:', e);
                rows.forEach(function (row) { setRowState(row, 'error', { message: 'Not saved' }); });
                refreshTotals();
                setStatus('err', 'Could not save (' + e.message + '). The readings are still on this ' +
                                 'device — retry the row, or use Export CSV.');
            });
    }

    /* ---------------------------------------------------------
       theme
       --------------------------------------------------------- */

    function applyTheme(t) {
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
    }

    /* ---------------------------------------------------------
       start
       --------------------------------------------------------- */

    /* The most recent date the sheet holds anything for. Opening there rather
       than on today lets a part-finished round be picked up where it was left.
       Note this IS the date every submit is stamped with, so starting a fresh
       round means setting it forward first - the field is at the top of the
       form and the status line always names the date in use. */
    function latestDate() {
        if (!endpointUrl()) return Promise.resolve(null);
        var to = new Date();
        var from = new Date();
        from.setFullYear(from.getFullYear() - 6);
        return fetch(endpointUrl(), {
            method: 'POST',
            body: JSON.stringify({ type: 'history',
                                   from: from.toISOString().slice(0, 10),
                                   to: to.toISOString().slice(0, 10) })
        })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                return (d && d.result === 'success' && d.cover) ? d.cover.last : null;
            })
            .catch(function () { return null; });
    }


    /* ---------------------------------------------------------
       date confirmation, and getting around a long page
       --------------------------------------------------------- */

    function prettyDate(iso) {
        var p = (iso || '').split('-');
        return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : (iso || '(none)');
    }

    /* Resolves true only when the user confirms. Deliberately a dialog rather
       than window.confirm: the date has to be readable at a glance, and the
       browser's own prompt renders it in a sentence nobody stops to read. */
    function confirmDate(count) {
        return new Promise(function (resolve) {
            var iso = $('fDate').value;
            var today = new Date().toISOString().slice(0, 10);
            /* what the sheet already holds for this date - the rows that came
               back from it, not a separate map, since that is where the
               status check puts them */
            var already = 0;
            allRows.forEach(function (r) { if (r._fromSheet) already++; });

            $('dcDate').textContent = prettyDate(iso);

            var body = 'About to save ' + count + ' reading' + (count === 1 ? '' : 's')
                     + ' against this date.';
            if (already) {
                body += ' The sheet already holds ' + already + ' reading'
                      + (already === 1 ? '' : 's') + ' for it.';
            }
            $('dcBody').textContent = body;

            if (iso !== today) {
                var w = document.createElement('span');
                w.className = 'warn-line';
                w.textContent = 'This is not today (' + prettyDate(today) + ').';
                $('dcBody').appendChild(w);
            }

            var modal = $('dateConfirm');
            modal.hidden = false;
            $('dcOk').focus();

            function close(ok) {
                modal.hidden = true;
                $('dcOk').removeEventListener('click', yes);
                $('dcCancel').removeEventListener('click', no);
                document.removeEventListener('keydown', key);
                modal.removeEventListener('click', backdrop);
                resolve(ok);
            }
            function yes() { close(true); }
            function no() { close(false); }
            function key(e) {
                if (e.key === 'Escape') { e.preventDefault(); close(false); }
                if (e.key === 'Enter') { e.preventDefault(); close(true); }
            }
            function backdrop(e) { if (e.target === modal) close(false); }

            $('dcOk').addEventListener('click', yes);
            $('dcCancel').addEventListener('click', no);
            document.addEventListener('keydown', key);
            modal.addEventListener('click', backdrop);
        });
    }

    /* The furthest-down row that carries anything - entered, sending or
       already recorded. That is where the work got to, so that is where
       "Last reading" goes. Its PDU panel is opened on the way. */
    function lastTouchedRow() {
        var last = null;
        allRows.forEach(function (row) {
            if (isDone(row) || hasValues(row) || row._state === 'sending') last = row;
        });
        return last;
    }

    /* Instant, not smooth. This page is over 20 000 px tall, so a smooth
       scroll across it is a long ride to nowhere, and some browsers ignore
       the option entirely - which would leave the button doing nothing at
       all. The highlight is what tells you where you landed. */
    function goTop() {
        window.scrollTo(0, 0);
    }

    function jumpTo(row) {
        document.querySelectorAll('.row.found').forEach(function (r) {
            r.classList.remove('found');
        });
        if (!row) {
            setStatus('', 'Nothing entered yet - start at the top.');
            goTop();
            return;
        }
        var panel = row.closest('.pdu');
        if (panel && !panel.classList.contains('open')) panel.classList.add('open');
        row.scrollIntoView({ block: 'center' });
        void row.offsetWidth;                 /* restart the highlight */
        row.classList.add('found');
        var input = row.querySelector('input[data-phase]:not([readonly])');
        if (input) setTimeout(function () { input.focus({ preventScroll: true }); }, 120);
    }

    function init() {
        var now = new Date();
        $('fDate').value = now.toISOString().slice(0, 10);
        $('fTime').value = now.toTimeString().slice(0, 5);

        /* a phase map from the earlier build is now superseded by config.js */
        try { localStorage.removeItem('koc-dc-phase-map'); } catch (e) { /* ignore */ }

        buildMain();
        buildPDUs();
        allRows.forEach(function (row) { if (row._item.category === 'PDU') applyPhase(row); });

        document.addEventListener('input', function (e) {
            var row = e.target.closest && e.target.closest('.row');
            if (row && row._item) {
                refreshRow(row);
                if (row._state === 'error') {
                    setRowState(row, 'pending');
                } else if (row._state === 'pending') {
                    row.querySelector('.row-submit').disabled = !hasValues(row);
                }
                refreshTotals();
            }
            queueSave();
        });

        /* changing the date changes what counts as already recorded */
        $('fDate').addEventListener('change', function () {
            dateChosenByUser = true;
            setStatus('', '');
            loadStatusForDate();
        });

        /* Enter moves to the next field rather than submitting */
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            var t = e.target;
            if (t.tagName !== 'INPUT' || t.type !== 'number') return;
            e.preventDefault();
            var inputs = Array.prototype.slice.call(
                document.querySelectorAll('.pdu.open input[data-phase]:not([readonly]), ' +
                                          '#mainRows input[data-phase]:not([readonly])'));
            var i = inputs.indexOf(t);
            if (i > -1 && inputs[i + 1]) inputs[i + 1].focus();
        });

        $('submitMain').addEventListener('click', function () { submitRows(pendingIn($('mainRows'))); });

        /* everything on the page, main equipment and every PDU panel,
           whether the panel is open or not */
        $('submitAll').addEventListener('click', function () {
            var rows = pendingIn(document);
            if (!rows.length) return;
            confirmDate(rows.length).then(function (ok) {
                if (ok) submitRows(rows);
                else setStatus('', 'Not saved. Set the date you want, then submit again.');
            });
        });
        $('csvBtn').addEventListener('click', downloadCSV);

        $('todayBtn').addEventListener('click', function () {
            var t = new Date().toISOString().slice(0, 10);
            if ($('fDate').value === t) return;
            dateChosenByUser = true;
            $('fDate').value = t;
            setStatus('', '');
            loadStatusForDate();
        });

        $('jumpTop').addEventListener('click', goTop);
        $('jumpLast').addEventListener('click', function () {
            jumpTo(lastTouchedRow());
        });

        $('refreshBtn').addEventListener('click', function () {
            setStatus('', '');
            loadStatusForDate();
        });

        $('clearBtn').addEventListener('click', function () {
            if (!confirm('Clear every reading on this page that has not been submitted?\n\n' +
                         'Readings already saved to the sheet are not affected.')) return;
            clearDraft();
            allRows.forEach(function (row) {
                if (isDone(row)) return;
                writeRow(row, '', '', '');
                setRowState(row, 'pending');
            });
            refreshTotals();
            markDraft('');
            setStatus('', 'Unsent readings cleared.');
        });

        $('expandBtn').addEventListener('click', function () {
            var panels = document.querySelectorAll('.pdu');
            var anyClosed = Array.prototype.some.call(panels, function (p) { return !p.classList.contains('open'); });
            panels.forEach(function (p) { p.classList.toggle('open', anyClosed); });
            $('expandBtn').lastElementChild.textContent = anyClosed ? 'Collapse all' : 'Expand all';
        });

        $('themeBtn').addEventListener('click', function () {
            applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
        });

        var saved;
        try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
        applyTheme(saved || 'dark');

        /* the readings are usually taken by the same person - ask once */
        try {
            var who = localStorage.getItem(NAME_KEY);
            if (who) $('fBy').value = who;
        } catch (e) { /* ignore */ }

        $('fBy').addEventListener('change', function () {
            try { localStorage.setItem(NAME_KEY, $('fBy').value.trim()); } catch (e) { /* ignore */ }
        });

        function showConnection() {
            var url = endpointUrl();
            $('setupBanner').hidden = !!url;
            $('connState').textContent = url ? 'Sheet ' + endpointLabel(url) : 'No sheet connected';
            $('connChange').hidden = !url;
        }

        $('endpointSave').addEventListener('click', function () {
            var v = $('endpointInput').value.trim().replace(/\/+$/, '');

            if (!v) {
                setStatus('err', 'Paste the web app URL first, then press Connect.');
                $('endpointInput').focus();
                return;
            }
            /* accept the /macros/u/0/s/... form some accounts produce, and a
               trailing query string */
            if (!/^https:\/\/script\.google\.com\/macros\/(?:u\/\d+\/)?s\/[\w-]+\/exec(?:\?.*)?$/.test(v)) {
                setStatus('err', 'That does not look like a web app URL. It should end in /exec ' +
                                 'and start https://script.google.com/macros/s/');
                $('endpointInput').focus();
                $('endpointInput').select();
                return;
            }
            setEndpoint(v);
            $('endpointInput').value = '';
            showConnection();
            setStatus('ok', 'Sheet connected on this device.');
            loadStatusForDate();
        });

        $('connChange').addEventListener('click', function () {
            if (!confirm('Disconnect this device from the sheet?\n\n' +
                         'Readings already saved are not affected.')) return;
            forgetEndpoint();
            showConnection();
            setStatus('', 'Disconnected.');
            loadStatusForDate();
        });

        showConnection();

        /* The action bar is sticky, and on a phone its buttons wrap onto two
           rows. Measure it so the page always has enough padding to scroll
           the last field clear of it. */
        function fitBar() {
            var bar = document.querySelector('.sticky-bar');
            if (!bar) return;
            document.documentElement.style.setProperty(
                '--bar-h', Math.ceil(bar.getBoundingClientRect().height) + 'px');
        }
        fitBar();
        window.addEventListener('resize', fitBar);
        window.addEventListener('orientationchange', function () { setTimeout(fitBar, 250); });

        refreshTotals();

        /* Open on the date last seen on the sheet, taken from this browser
           rather than from a round trip. Asking the server first cost an
           entire extra request in series - four seconds before the request
           that actually fetches anything could even start. The status reply
           corrects it if the sheet has moved on. */
        var remembered = null;
        try { remembered = localStorage.getItem(LATEST_KEY); } catch (e) { /* ignore */ }
        if (remembered) $('fDate').value = remembered;
        loadStatusForDate();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
