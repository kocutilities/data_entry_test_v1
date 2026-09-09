/* =============================================================
   KOC Data Center - home
   home.js

   The figures on this page are a summary, not an assessment. Every
   number is either counted from config.js or computed from the readings
   the sheet holds for one date, using the same arithmetic as
   assessment.js:

     Maximum Demand  coincident, PHASE BY PHASE. The transformer carries
                     the sum of the two incomers on each phase, so the
                     demand is max(Ar+Br, Ay+By, Ab+Bb). Summing the two
                     maxima instead would invent a current that no
                     conductor ever saw.
     Contingency     KOC-E-003 Pt 1 cl. 12.4. Double radial: each
                     transformer alone must carry 1.15 x the whole
                     demand, which puts the site ceiling at 2133 / 1.15.

   If this page and the assessment page ever disagree, the assessment
   page is right - it states its clause and shows its working. This one
   links to it rather than competing with it.

   Nothing here is invented when the sheet is quiet. A figure that cannot
   be computed says so, and says why; it never falls back to a guess.
   ============================================================= */

(function () {
    'use strict';

    var ENDPOINT_KEY = 'koc-dc-endpoint';
    var LATEST_KEY   = 'koc-dc-latest-date';
    var CACHE_KEY    = 'koc-dc-status-cache';

    var V     = DC_SYSTEM.systemVoltage;
    var SQRT3 = Math.sqrt(3);
    var TX    = DC_SYSTEM.transformers[0];
    var RULE  = KOC.transformer.doubleRadialFactor;   /* 1.15, cl. 12.4 */
    var CEIL  = TX.ratedA / RULE.value;               /* site demand ceiling */

    var A_KEY = 'Main|Incomer A|';
    var B_KEY = 'Main|Incomer B|';

    function $(id) { return document.getElementById(id); }

    function endpointUrl() {
        try { return localStorage.getItem(ENDPOINT_KEY) || ''; } catch (e) { return ''; }
    }

    function kvaOf(a) { return SQRT3 * V * a / 1000; }

    function num(n, dp) {
        if (n === null || n === undefined || !isFinite(n)) return '—';
        var d = dp || 0;
        return Number(n.toFixed(d)).toLocaleString('en-US',
            { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    function ymd(s) {
        if (!s) return '—';
        var p = String(s).split('-');
        return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : s;
    }

    /* ---------------------------------------------------------
       what the plant is - counted from config, no network needed
       --------------------------------------------------------- */

    function isSpare(rack) { return /SPARE/i.test(rack || ''); }

    function plant() {
        var active = 0, spare = 0, pdus = 0;
        Object.keys(DC_CONFIG.pduCircuits).forEach(function (k) {
            pdus++;
            DC_CONFIG.pduCircuits[k].forEach(function (c) {
                if (isSpare(c.rack)) spare++; else active++;
            });
        });
        return { boards: DC_CONFIG.equipment.length, pdus: pdus,
                 ways: active + spare, active: active, spare: spare };
    }

    /* ---------------------------------------------------------
       demand, from one date's readings
       --------------------------------------------------------- */

    function phases(recorded, key) {
        var v = recorded && recorded[key];
        if (!v) return null;
        var r = Number(v.r) || 0, y = Number(v.y) || 0, b = Number(v.b) || 0;
        if (!r && !y && !b) return null;
        return { r: r, y: y, b: b, max: Math.max(r, y, b) };
    }

    /* Coincident, per phase - see the note at the top of this file. */
    function demandOf(recorded) {
        var a = phases(recorded, A_KEY);
        var b = phases(recorded, B_KEY);
        if (!a || !b) {
            return { ok: false, a: a, b: b,
                     missing: (!a ? 'Incomer A' : '') +
                              (!a && !b ? ' and ' : '') +
                              (!b ? 'Incomer B' : '') };
        }
        var sr = a.r + b.r, sy = a.y + b.y, sb = a.b + b.b;
        var total = Math.max(sr, sy, sb);
        return {
            ok: true, a: a, b: b, total: total,
            phase: total === sr ? 'R' : total === sy ? 'Y' : 'B',
            kva: kvaOf(total),
            required: RULE.value * total,     /* per transformer, contingency */
            util: RULE.value * total / TX.ratedA * 100,
            headroom: CEIL - total
        };
    }

    /* ---------------------------------------------------------
       painting
       --------------------------------------------------------- */

    function setTile(id, value, sub, tone) {
        var v = $(id), s = $(id + 'Sub');
        if (v) {
            v.textContent = value;
            v.className = 'kpi-value' + (tone ? ' ' + tone : '');
        }
        if (s) s.textContent = sub || '';
    }

    function phaseBars(prefix, p, rated) {
        ['r', 'y', 'b'].forEach(function (ph) {
            var fill = $(prefix + ph.toUpperCase());
            var txt  = $(prefix + ph.toUpperCase() + 'Val');
            if (fill) {
                fill.style.width = (p ? Math.max(0, Math.min(100, p[ph] / rated * 100)) : 0)
                    .toFixed(1) + '%';
            }
            if (txt) txt.textContent = p ? num(p[ph]) + ' A' : '—';
        });

        var un = $(prefix + 'Unbal');
        if (!un) return;
        if (!p) { un.textContent = ''; un.className = 'incomer-unbal'; return; }

        /* Deviation from the mean of the three, as a percentage of it -
           the same definition used on the load reading page. */
        var avg = (p.r + p.y + p.b) / 3;
        var dev = Math.max(Math.abs(p.r - avg), Math.abs(p.y - avg), Math.abs(p.b - avg));
        var pct = avg > 0 ? dev / avg * 100 : 0;
        un.textContent = num(pct, 1) + ' % unbalance';
        un.className = 'incomer-unbal' + (pct > 10 ? ' warn' : '');
    }

    /* The capacity graphic. One track from zero to the transformer plate
       figure, the demand filled in, and the contingency ceiling marked on
       it - so the gap between the fill and the marker IS the headroom. */
    function paintCapacity(d) {
        if (!$('capTrack')) return;

        $('capCeilMark').style.left = (CEIL / TX.ratedA * 100).toFixed(2) + '%';
        $('capCeilLabel').textContent = num(CEIL) + ' A — the most demand one transformer ' +
                                        'can carry with the 15 % margin';
        $('capPlateLabel').textContent = num(TX.ratedA) + ' A plate';

        if (!d || !d.ok) {
            $('capFill').style.width = '0%';
            $('capFill').className = 'cap-fill';
            $('capReading').textContent = '';
            return;
        }

        var over = d.total > CEIL;
        $('capFill').style.width = Math.min(100, d.total / TX.ratedA * 100).toFixed(2) + '%';
        $('capFill').className = 'cap-fill' + (over ? ' over' : '');
        $('capReading').textContent = num(d.total) + ' A on ' + d.phase + ' phase';
    }

    function paint(recorded, date, source, tone) {
        var d = demandOf(recorded);

        $('mdSource').textContent = source;
        $('mdSource').className = 'live-note' + (tone ? ' ' + tone : '');

        if (d.ok) {
            setTile('kpiDemand', num(d.total) + ' A',
                    num(d.kva) + ' kVA coincident, on ' + d.phase + ' phase');

            var t = d.util > 100 ? 'bad' : d.util > 90 ? 'warn' : 'good';
            setTile('kpiUtil', num(d.util) + ' %',
                    num(d.required) + ' A needed of ' + num(TX.ratedA) + ' A per transformer', t);

            setTile('kpiHead',
                    (d.headroom >= 0 ? num(d.headroom) : '−' + num(-d.headroom)) + ' A',
                    d.headroom >= 0
                        ? num(kvaOf(d.headroom)) + ' kVA before the ' + num(CEIL) + ' A ceiling'
                        : 'already above the ' + num(CEIL) + ' A ceiling',
                    d.headroom >= 0 ? '' : 'bad');
        } else {
            setTile('kpiDemand', '—', 'No reading for ' + d.missing + ' on ' + ymd(date));
            setTile('kpiUtil',   '—', 'Needs both incomers');
            setTile('kpiHead',   '—', 'Needs both incomers');
        }

        phaseBars('inA', d.a, TX.ratedA);
        phaseBars('inB', d.b, TX.ratedA);
        paintCapacity(d);

        $('readingDate').textContent  = ymd(date);
        $('readingCount').textContent = num(Object.keys(recorded || {}).length);
    }

    /* Nothing to show, and an honest reason why. */
    function blank(reason, tone) {
        setTile('kpiDemand', '—', '');
        setTile('kpiUtil',   '—', '');
        setTile('kpiHead',   '—', '');
        phaseBars('inA', null, TX.ratedA);
        phaseBars('inB', null, TX.ratedA);
        paintCapacity(null);
        $('readingDate').textContent  = '—';
        $('readingCount').textContent = '—';
        $('mdSource').textContent = reason;
        $('mdSource').className = 'live-note' + (tone ? ' ' + tone : '');
    }

    /* ---------------------------------------------------------
       data
       --------------------------------------------------------- */

    function cachedFor(date) {
        try {
            var all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
            var hit = all && all[date];
            return hit && hit.recorded ? hit.recorded : null;
        } catch (e) { return null; }
    }

    function knownLatest() {
        try { return localStorage.getItem(LATEST_KEY) || ''; } catch (e) { return ''; }
    }

    function ask(date) {
        return fetch(endpointUrl(), {
            method: 'POST', body: JSON.stringify({ type: 'status', date: date })
        })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                if (!d || d.result !== 'success') {
                    throw new Error((d && d.message) || 'Unexpected reply');
                }
                return d;
            });
    }

    function load() {
        if (!endpointUrl()) {
            blank('No sheet connected on this device — open Load Reading to connect one.', '');
            return;
        }

        /* Paint this device's last copy first, so the page is not empty for
           the two seconds the sheet takes, and label it as unconfirmed. */
        var date = knownLatest() || new Date().toISOString().slice(0, 10);
        var cached = cachedFor(date);
        if (cached) paint(cached, date, 'From this device · checking the sheet…', 'warn');
        else blank('Reading the sheet…', '');

        ask(date)
            .then(function (d) {
                /* The sheet knows which date is really the most recent. If
                   this device was behind, ask again for the right one rather
                   than presenting a stale day as current. */
                if (d.latest && d.latest !== date) {
                    try { localStorage.setItem(LATEST_KEY, d.latest); } catch (e) { /* ignore */ }
                    return ask(d.latest).then(function (d2) {
                        paint(d2.recorded || {}, d.latest, 'Recorded in the sheet', 'ok');
                    });
                }
                paint(d.recorded || {}, date, 'Recorded in the sheet', 'ok');
            })
            .catch(function (e) {
                console.error('Home summary failed:', e);
                if (cached) {
                    paint(cached, date, 'Could not reach the sheet — showing this ' +
                                        'device’s last copy, which may be out of date.', 'warn');
                } else {
                    blank('Could not reach the sheet (' + e.message + ').', 'warn');
                }
            });
    }

    /* ---------------------------------------------------------
       start
       --------------------------------------------------------- */

    function init() {
        var p = plant();

        $('kpiCircuits').textContent = num(p.boards + p.ways);
        $('kpiCircuitsSub').textContent = p.boards + ' incomers and boards · ' +
                                          p.ways + ' PDU ways';
        $('plantLine').textContent = p.pdus + ' PDUs · ' + p.active +
                                     ' ways in service · ' + p.spare + ' spare';
        $('sysLine').textContent = DC_SYSTEM.transformers.length + ' × ' + TX.kva +
                                   ' kVA · ' + DC_SYSTEM.generators.length +
                                   ' generators · ' + V + ' V ' + DC_SYSTEM.arrangement;

        load();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
