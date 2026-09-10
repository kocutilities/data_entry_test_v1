/* =============================================================
   KOC Data Center - home
   home.js

   The figures on this page are a summary, not an assessment. Every
   number is either counted from config.js or computed from the readings
   the sheet holds for one date:

     Demand          coincident, PHASE BY PHASE. The transformer carries
                     the sum of the two incomers on each phase, so the
                     demand is max(Ar+Br, Ay+By, Ab+Bb). Summing the two
                     maxima instead would invent a current that no
                     conductor ever saw.
     Contingency     KOC-E-003 Pt 1 cl. 12.4. Double radial: each
                     transformer alone must carry 1.15 x the whole
                     demand, which puts the site ceiling at 2133 / 1.15.

   ONE READING IS NOT THE MAXIMUM DEMAND. Clause 12.4 bites on the peak,
   not on whatever happened to be flowing the last time somebody walked
   the room. The latest reading and the highest on record are therefore
   shown as two separate figures, and the contingency test is applied to
   the PEAK. Showing only the latest would have reported 83 % against a
   site whose recorded peak is at 108 % - a comfortable green number
   standing in front of an exceedance.

   The assessment page states its clause and shows its working, and this
   page links to it rather than competing with it. But "the assessment
   page is right" is not a rule to lean on: on 2026-09-09 it was found
   summing max(A) + max(B) for the demand, which the note below says not
   to do. Both now compute it the same way. If they disagree again, that
   is a defect in one of them - find out which, do not assume.

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

    /* One resolver for the whole app - see the note at the end of config.js.
       Five copies of this used to disagree: only the Load Reading page fell
       back to DC_CONFIG.endpoint, so filling that in left the other four
       still saying "no sheet connected". */
    function endpointUrl() {
        return (typeof DC_ENDPOINT === 'function') ? DC_ENDPOINT() : '';
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
       figure. The bar is filled to the PEAK on record, because that is the
       demand clause 12.4 tests; the latest reading is marked separately so
       the two are never mistaken for each other. */
    function paintCapacity(d, peak) {
        if (!$('capTrack')) return;

        $('capCeilMark').style.left = (CEIL / TX.ratedA * 100).toFixed(2) + '%';
        $('capCeilLabel').textContent = num(CEIL) + ' A — the most demand one transformer ' +
                                        'can carry with the 15 % margin';
        $('capPlateLabel').textContent = num(TX.ratedA) + ' A plate';

        var nowMark = $('capNowMark'), nowLabel = $('capNowLabel');

        if (!peak) {
            $('capFill').style.width = '0%';
            $('capFill').className = 'cap-fill';
            $('capReading').textContent = '';
            if (nowMark) nowMark.hidden = true;
            if (nowLabel) { nowLabel.textContent = ''; nowLabel.parentElement.hidden = true; }
            return;
        }

        $('capFill').style.width = Math.min(100, peak.max / TX.ratedA * 100).toFixed(2) + '%';
        $('capFill').className = 'cap-fill' + (peak.max > CEIL ? ' over' : '');
        $('capReading').textContent = 'peak ' + num(peak.max) + ' A on ' +
                                      peak.maxPhase + ' phase, ' + ymd(peak.maxDate);

        if (nowMark && nowLabel) {
            if (d && d.ok) {
                nowMark.hidden = false;
                nowMark.style.left = Math.min(100, d.total / TX.ratedA * 100).toFixed(2) + '%';
                nowLabel.textContent = num(d.total) + ' A — latest reading';
                nowLabel.parentElement.hidden = false;
            } else {
                nowMark.hidden = true;
                nowLabel.textContent = '';
                nowLabel.parentElement.hidden = true;
            }
        }
    }

    function paint(recorded, date, source, tone, peak) {
        var d = demandOf(recorded);

        $('mdSource').textContent = source;
        $('mdSource').className = 'live-note' + (tone ? ' ' + tone : '');

        if (d.ok) {
            setTile('kpiDemand', num(d.total) + ' A',
                    num(d.kva) + ' kVA coincident, on ' + d.phase + ' phase');
        } else {
            setTile('kpiDemand', '—', 'No reading for ' + d.missing + ' on ' + ymd(date));
        }

        /* The contingency test runs on the peak, never on the latest reading.
           Until the history is in, say so rather than showing a figure that
           would be read as the answer. */
        if (peak) {
            var util = RULE.value * peak.max / TX.ratedA * 100;
            var head = CEIL - peak.max;

            setTile('kpiPeak', num(peak.max) + ' A',
                    ymd(peak.maxDate) + ', on ' + peak.maxPhase + ' phase · ' +
                    peak.n + ' reading' + (peak.n === 1 ? '' : 's') + ' on record');

            setTile('kpiUtil', num(util) + ' %',
                    head >= 0
                        ? num(head) + ' A of demand still available below the ' +
                          num(CEIL) + ' A ceiling'
                        : num(-head) + ' A above the ' + num(CEIL) + ' A ceiling — ' +
                          'a deviation is required for the peak',
                    util > 100 ? 'bad' : util > 90 ? 'warn' : 'good');
        } else {
            setTile('kpiPeak', '—', 'Reading the history…');
            setTile('kpiUtil', '—', 'Needs the reading history');
        }

        phaseBars('inA', d.a, TX.ratedA);
        phaseBars('inB', d.b, TX.ratedA);
        paintCapacity(d, peak);

        $('readingDate').textContent  = ymd(date);
        $('readingCount').textContent = num(Object.keys(recorded || {}).length);
    }

    /* Nothing to show, and an honest reason why. */
    function blank(reason, tone) {
        setTile('kpiDemand', '—', '');
        setTile('kpiPeak',   '—', '');
        setTile('kpiUtil',   '—', '');
        phaseBars('inA', null, TX.ratedA);
        phaseBars('inB', null, TX.ratedA);
        paintCapacity(null, null);
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

    /* The whole reading history, for the peak. Six years back covers every
       date the sheet holds; the server returns the statistics, not the rows. */
    function askHistory() {
        var to = new Date().toISOString().slice(0, 10);
        var from = new Date();
        from.setFullYear(from.getFullYear() - 10);
        return fetch(endpointUrl(), {
            method: 'POST', body: JSON.stringify({ type: 'history',
                from: from.toISOString().slice(0, 10), to: to })
        })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                if (!d || d.result !== 'success') throw new Error('Unexpected reply');
                return d;
            });
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
        if (cached) paint(cached, date, 'From this device · checking the sheet…', 'warn', null);
        else blank('Reading the sheet…', '');

        /* Both questions at once - "what was read last" and "what is the
           highest ever read" - rather than one after the other. */
        var peak = null;
        var history = askHistory()
            .then(function (h) {
                peak = h.demand;      /* null until two incomers share a date */
                return h;
            })
            .catch(function (e) {
                console.error('History failed:', e);
                return null;
            });

        ask(date)
            .then(function (d) {
                /* The sheet knows which date is really the most recent. If
                   this device was behind, ask again for the right one rather
                   than presenting a stale day as current. */
                if (d.latest && d.latest !== date) {
                    try { localStorage.setItem(LATEST_KEY, d.latest); } catch (e) { /* ignore */ }
                    return ask(d.latest).then(function (d2) {
                        return { recorded: d2.recorded, date: d.latest };
                    });
                }
                return { recorded: d.recorded, date: date };
            })
            .then(function (got) {
                return history.then(function () {
                    paint(got.recorded || {}, got.date, 'Recorded in the sheet', 'ok', peak);
                });
            })
            .catch(function (e) {
                console.error('Home summary failed:', e);
                if (cached) {
                    paint(cached, date, 'Could not reach the sheet — showing this ' +
                                        'device’s last copy, which may be out of date.',
                          'warn', peak);
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
