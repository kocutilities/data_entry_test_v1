/* =============================================================
   KOC Data Center - Power System Assessment
   assessment.js

   Applies the KOC criteria in koc-criteria.js to the currents recorded for
   a chosen date, and says whether the system meets them.

   Three principles, because an assessment tool that is wrong is worse than
   none at all:

   1. Every verdict cites its clause. "Rejected - overloaded" is useless;
      "Rejected - 118 % of the contingency limit, KOC-E-003 Pt 1 cl. 12.4"
      can be checked and argued with.
   2. A missing input returns CANNOT ASSESS, never a pass. Silence about
      what was not tested is how a bad load gets connected.
   3. Anything that is not a KOC requirement is labelled ADVISORY on the
      face of it, not folded in with the rules.
   ============================================================= */

(function () {
    'use strict';

    var ENDPOINT_KEY = 'koc-dc-endpoint';
    var THEME_KEY = 'koc-dc-theme';
    var DERATE_KEY = 'koc-dc-feeder-plate';

    var $ = function (id) { return document.getElementById(id); };
    var readings = {};
    /* 'frame'  - the SLD figures are frame sizes, so x0.8 applies (default,
                  and the conservative reading)
       'derated'- the boards were plated with derated ratings per cl. 11.2.6 */
    var plateBasis = 'frame';

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    /* One resolver for the whole app - see the note at the end of config.js.
       Five copies of this used to disagree: only the Load Reading page fell
       back to DC_CONFIG.endpoint, so filling that in left the other four
       still saying "no sheet connected". */
    function endpointUrl() {
        return (typeof DC_ENDPOINT === 'function') ? DC_ENDPOINT() : '';
    }

    /* ---------------------------------------------------------
       basic electrical helpers
       --------------------------------------------------------- */

    var V = DC_SYSTEM.systemVoltage;
    var SQRT3 = Math.sqrt(3);

    function kvaOf(amps) { return SQRT3 * V * amps / 1000; }

    function maxPhase(key) {
        var r = readings[key];
        if (!r) return null;
        var v = [Number(r.r) || 0, Number(r.y) || 0, Number(r.b) || 0];
        return Math.max(v[0], v[1], v[2]);
    }

    function phases(key) {
        var r = readings[key];
        if (!r) return null;
        return [Number(r.r) || 0, Number(r.y) || 0, Number(r.b) || 0];
    }

    /* Negative sequence from three magnitudes, ASSUMING 120 degree
       displacement. Real unbalanced loads shift the angles too, so this is
       an estimate and is labelled as one wherever it is shown. Exact I2
       needs phase angles, which the reading sheet does not carry. */
    function negSeqPercent(key) {
        var p = phases(key);
        if (!p) return null;
        var a = p[0], b = p[1], c = p[2];
        if (a + b + c <= 0) return null;
        /* I2 = |Ia + a^2*Ib + a*Ic| / 3 with a = 1/_120 */
        var cos120 = -0.5, sin120 = Math.sqrt(3) / 2;
        var reX = a + b * cos120 + c * cos120;
        var imX = b * (-sin120) + c * sin120;
        var i2 = Math.sqrt(reX * reX + imX * imX) / 3;
        var i1 = (a + b + c) / 3;
        return i1 > 0 ? (i2 / i1) * 100 : null;
    }

    function ratingFor(key) {
        var name = key.split('|')[1];
        var hit = DC_CONFIG.equipment.filter(function (e) { return e.name === name; })[0];
        return hit ? hit.rated : null;
    }

    /* ---------------------------------------------------------
       the rules
       --------------------------------------------------------- */

    var results = [];

    function push(o) { results.push(o); return o; }

    function fmt(n, dp) {
        if (n === null || n === undefined || !isFinite(n)) return '—';
        return n.toFixed(dp === undefined ? 0 : dp);
    }

    /* R2 - demand. With the coupler open each transformer feeds its own
       section, so site demand is the sum of the two incomers. Data centre
       load is continuous, so Appendix II gives no diversity relief.

       Taken PHASE BY PHASE: the largest of the three phase sums, NOT
       max(A) + max(B).

       The two agree only when both incomers peak on the same phase. On
       2026-09-07 they do not - A peaks on R at 1036 A, B peaks on B at
       502 A - and adding those maxima gives 1538 A, a current that no
       conductor carried. The real coincident maximum is 1533 A on B. */
    function maximumDemand() {
        var pa = phases('Main|Incomer A|');
        var pb = phases('Main|Incomer B|');
        if (pa === null || pb === null) {
            return { ok: false, missing: (pa === null ? 'Incomer A ' : '') +
                                         (pb === null ? 'Incomer B' : '') };
        }

        var sr = pa[0] + pb[0], sy = pa[1] + pb[1], sb = pa[2] + pb[2];
        var total = Math.max(sr, sy, sb);

        return {
            ok: true,
            a: Math.max(pa[0], pa[1], pa[2]),   /* each incomer's own peak, for display */
            b: Math.max(pb[0], pb[1], pb[2]),
            total: total,
            phase: total === sr ? 'R' : total === sy ? 'Y' : 'B',
            kva: kvaOf(total)
        };
    }

    /* R3 - the binding test. Double radial: EACH transformer alone must
       carry 115 % of the whole Maximum Demand. */
    function ruleTransformer(md) {
        var c = KOC.transformer.doubleRadialFactor;
        var t = DC_SYSTEM.transformers[0];

        if (!md.ok) {
            return push({ id: 'R3', title: 'Transformer capacity, contingency case',
                verdict: 'unknown', clause: c.std + ' cl. ' + c.clause,
                detail: 'Cannot assess — no reading for ' + md.missing.trim() + '.',
                rule: 'Each transformer alone ≥ 1.15 × total Maximum Demand' });
        }

        var required = c.value * md.total;
        var capability = t.ratedA;          /* already derated - see system-model */
        var pass = capability >= required;
        var ceiling = capability / c.value;

        return push({
            id: 'R3', title: 'Transformer capacity, contingency case',
            verdict: pass ? 'pass' : 'fail',
            clause: c.std + ' cl. ' + c.clause,
            rule: 'Each transformer alone ≥ 1.15 × total Maximum Demand',
            figures: [
                ['Demand on this date', fmt(md.total) + ' A  (' + fmt(md.kva) + ' kVA)'
                                        + ', coincident on ' + md.phase + ' phase'],
                ['Required per transformer', fmt(required) + ' A'],
                ['Capability per transformer', fmt(capability) + ' A'],
                ['Utilisation of the limit', fmt(required / capability * 100) + ' %'],
                ['Demand ceiling under this rule', fmt(ceiling) + ' A  (' + fmt(kvaOf(ceiling)) + ' kVA)']
            ],
            headroomA: ceiling - md.total,
            detail: pass
                ? 'One transformer alone can carry the whole demand with the 15 % margin. '
                  + fmt(ceiling - md.total) + ' A of demand still available under this rule, '
                  + 'measured against THIS date.'
                : 'Fails by ' + fmt(required - capability) + ' A. The site is already above the '
                  + 'demand at which one transformer can carry everything with the required margin.',
            note: 'The 2133 A plate figure is already the KOC-derated rating (2000 kVA × 0.8 '
                + '= 1600 kVA, cl. 11.2.2 / 11.2.6), so the 0.8 factor is not applied again.'
        });
    }

    /* R4 - generators, continuously rated for the backed load + 15 % */
    function ruleGenerators() {
        var c = KOC.generator.continuousRating;
        DC_SYSTEM.generators.forEach(function (g) {
            var backed = 0, missing = [];
            g.backs.keys.forEach(function (k) {
                var m = maxPhase(k);
                if (m === null) missing.push(k.split('|')[1]);
                else backed += m;
            });

            if (missing.length) {
                push({ id: 'R4·' + g.id, title: g.id + ' capacity',
                    verdict: 'unknown', clause: c.std + ' cl. ' + c.clause,
                    rule: 'Continuously rated for Maximum Demand + 15 %',
                    detail: 'Cannot assess — no reading for ' + missing.join(', ') + '.' });
                return;
            }

            var required = 1.15 * backed;
            var pass = g.ratedA >= required;
            push({
                id: 'R4·' + g.id, title: g.id + ' capacity  (' + g.kva + ' kVA)',
                verdict: pass ? 'pass' : 'fail',
                clause: c.std + ' cl. ' + c.clause,
                rule: 'Continuously rated for Maximum Demand + 15 %',
                figures: [
                    ['Backs', g.backs.label],
                    ['Measured backed load', fmt(backed) + ' A'],
                    ['Required rating', fmt(required) + ' A'],
                    ['Generator rating', fmt(g.ratedA) + ' A'],
                    ['Utilisation of the limit', fmt(required / g.ratedA * 100) + ' %']
                ],
                detail: pass
                    ? 'Carries its backed load with the 15 % margin.'
                    : 'Short by ' + fmt(required - g.ratedA) + ' A against the 15 % margin.',
                note: (g.backs.method === 'sum-of-feeders'
                    ? 'Backed load is the sum of the section feeders — there is no meter on the '
                      + 'ATS-001 output. Summing the highest phase of each feeder is conservative '
                      + 'but ignores phase angles, so treat it as an upper estimate. '
                    : 'Backed load measured directly at LT way 9A. ')
                    + (g.note || '')
            });
        });
    }

    /* R5 - every feeder against its continuous rating */
    function ruleFeeders() {
        var d = KOC.deratingFactor;
        var rows = [], worst = null;

        DC_CONFIG.equipment.forEach(function (e) {
            var key = 'Main|' + e.name + '|';
            if (e.name === 'Incomer A' || e.name === 'Incomer B') return;
            var m = maxPhase(key);
            if (m === null) { rows.push({ name: e.name, state: 'unread' }); return; }

            var plate = ratingFor(key);
            var usable = plateBasis === 'frame' ? plate * d.value : plate;
            var pct = usable ? m / usable * 100 : null;
            var row = { name: e.name, source: e.source, measured: m, plate: plate,
                        usable: usable, pct: pct,
                        state: pct === null ? 'norating' : pct > 100 ? 'fail'
                             : pct > 87 ? 'watch' : 'pass' };
            rows.push(row);
            if (row.pct !== null && (!worst || row.pct > worst.pct)) worst = row;
        });

        var failed = rows.filter(function (r) { return r.state === 'fail'; });
        var tested = rows.filter(function (r) { return r.pct !== null && r.pct !== undefined; });

        /* No reading is not a pass. An empty set must return unknown, or the
           page reports compliance for a system nobody measured. */
        if (!tested.length) {
            push({ id: 'R5', title: 'Feeder continuous ratings', verdict: 'unknown',
                clause: 'KOC-E-009 Rev 3 cl. 6.3; KOC-E-003 Pt 1 cl. 11.2.2',
                rule: 'Highest phase ≤ continuous rating, derated for service conditions',
                detail: 'Cannot assess — no feeder readings recorded for this date.',
                rows: rows });
            return rows;
        }

        push({
            id: 'R5', title: 'Feeder continuous ratings',
            verdict: failed.length ? 'fail' : 'pass',
            clause: 'KOC-E-009 Rev 3 cl. 6.3; KOC-E-003 Pt 1 cl. 11.2.2',
            rule: 'Highest phase ≤ continuous rating, derated for service conditions',
            detail: failed.length
                ? failed.length + ' feeder' + (failed.length === 1 ? '' : 's') + ' above the '
                  + 'continuous rating: ' + failed.map(function (r) { return r.name; }).join(', ')
                : 'Highest is ' + worst.name + ' at ' + fmt(worst.pct) + ' % of its '
                    + 'continuous rating. ' + tested.length + ' of ' + rows.length
                    + ' feeders recorded.',
            rows: rows
        });
        return rows;
    }

    /* Advisory - unbalance. KOC sets no limit except the generator's 8 %
       negative sequence, so this is reported separately from the rules. */
    var UNBALANCE_FLOOR = 5;   /* amperes, mean of the three phases */

    function unbalanceReview() {
        var out = [];
        DC_CONFIG.equipment.forEach(function (e) {
            var key = 'Main|' + e.name + '|';
            var p = phases(key);
            if (!p) return;
            var avg = (p[0] + p[1] + p[2]) / 3;
            /* Percentages on a near-zero load are arithmetic noise: a feeder
               reading 0 / 1 / 0 A computes as 200 % spread and tells nobody
               anything. Only report where there is enough current to mean
               something. */
            if (avg < UNBALANCE_FLOOR) return;
            var dev = Math.max(Math.abs(p[0] - avg), Math.abs(p[1] - avg), Math.abs(p[2] - avg));
            out.push({ name: e.name, pct: dev / avg * 100, ns: negSeqPercent(key), phases: p });
        });
        out.sort(function (a, b) { return b.pct - a.pct; });
        return out;
    }

    /* ---------------------------------------------------------
       rendering
       --------------------------------------------------------- */

    function verdictChip(v) {
        var map = { pass: ['ok', 'Meets criteria'], fail: ['bad', 'Does not meet'],
                    unknown: ['warn', 'Cannot assess'] };
        var m = map[v] || map.unknown;
        return el('span', 'chip ' + m[0], m[1]);
    }

    function renderResult(r) {
        var card = el('div', 'rule ' + r.verdict);
        var head = el('div', 'rule-head');
        head.appendChild(el('span', 'rule-id', r.id));
        head.appendChild(el('span', 'rule-title', r.title));
        head.appendChild(verdictChip(r.verdict));
        card.appendChild(head);

        card.appendChild(el('div', 'rule-rule', r.rule));
        card.appendChild(el('div', 'rule-clause', r.clause));

        if (r.figures) {
            var t = el('div', 'figs');
            r.figures.forEach(function (f) {
                var row = el('div', 'fig');
                row.appendChild(el('span', '', f[0]));
                row.appendChild(el('b', '', f[1]));
                t.appendChild(row);
            });
            card.appendChild(t);
        }

        if (r.detail) card.appendChild(el('p', 'rule-detail', r.detail));
        if (r.note) card.appendChild(el('p', 'rule-note', r.note));
        return card;
    }

    function renderFeederTable(rows) {
        var wrap = el('div', 'ftable');
        var head = el('div', 'frow fhead');
        ['Feeder', 'Highest phase', 'Plate', 'Continuous', '% of continuous', ''].forEach(function (h) {
            head.appendChild(el('span', '', h));
        });
        wrap.appendChild(head);

        rows.forEach(function (r) {
            var row = el('div', 'frow ' + (r.state || ''));
            row.appendChild(el('span', 'fname', r.name));
            if (r.state === 'unread') {
                var s = el('span', 'fmuted', 'not recorded');
                s.style.gridColumn = '2 / -1';
                row.appendChild(s);
            } else {
                row.appendChild(el('span', '', fmt(r.measured, 1) + ' A'));
                row.appendChild(el('span', 'fmuted', r.plate ? r.plate + ' A' : '—'));
                row.appendChild(el('span', '', r.usable ? fmt(r.usable) + ' A' : '—'));
                row.appendChild(el('span', 'fpct', r.pct === null ? '—' : fmt(r.pct) + ' %'));
                row.appendChild(el('span', 'fstate',
                    r.state === 'fail' ? 'over rating'
                    : r.state === 'watch' ? 'above 87 %'
                    : r.state === 'norating' ? 'no rating' : ''));
            }
            wrap.appendChild(row);
        });
        return wrap;
    }

    function render() {
        results = [];
        var md = maximumDemand();
        var tx = ruleTransformer(md);
        ruleGenerators();
        var feeders = ruleFeeders();

        /* headline */
        var fails = results.filter(function (r) { return r.verdict === 'fail'; });
        var unknowns = results.filter(function (r) { return r.verdict === 'unknown'; });
        var banner = $('verdict');
        banner.className = 'verdict ' + (fails.length ? 'bad' : unknowns.length ? 'warn' : 'ok');
        banner.innerHTML = '';
        var vt = el('div', 'verdict-title',
            fails.length ? 'Does not meet KOC criteria'
            : unknowns.length ? 'Meets the criteria that could be tested'
            : 'Meets KOC criteria on this date');
        var vs = el('div', 'verdict-sub',
            fails.length ? fails.length + ' rule' + (fails.length === 1 ? '' : 's') + ' failed: '
                + fails.map(function (r) { return r.id; }).join(', ')
            : unknowns.length ? unknowns.length + ' could not be assessed from the readings available'
            : 'every rule these readings can test is satisfied — for the date shown. '
              + 'Clause 12.4 tests the highest demand on record, which may be another day.');
        banner.appendChild(vt); banner.appendChild(vs);

        /* demand */
        var dm = $('demand');
        dm.innerHTML = '';
        if (md.ok) {
            [['Incomer A', fmt(md.a) + ' A'], ['Incomer B', fmt(md.b) + ' A'],
             ['Demand on this date', fmt(md.total) + ' A'], ['', fmt(md.kva) + ' kVA at ' + V + ' V']]
                .forEach(function (p) {
                    var s = el('div', 'stat');
                    s.appendChild(el('div', 'stat-k', p[0] || 'Equivalent'));
                    s.appendChild(el('div', 'stat-v', p[1]));
                    dm.appendChild(s);
                });
        } else {
            dm.appendChild(el('p', 'rule-detail',
                'Maximum Demand cannot be established — no reading for ' + md.missing.trim() +
                '. Every capacity rule depends on it.'));
        }

        /* rules */
        var host = $('rules');
        host.innerHTML = '';
        results.forEach(function (r) { host.appendChild(renderResult(r)); });

        /* feeder table */
        var ft = $('feeders');
        ft.innerHTML = '';
        ft.appendChild(renderFeederTable(feeders));

        /* headroom */
        var hr = $('headroom');
        hr.innerHTML = '';
        if (tx && tx.headroomA !== undefined && md.ok) {
            var h = tx.headroomA;
            hr.appendChild(el('div', 'big ' + (h > 0 ? 'ok' : 'bad'),
                (h > 0 ? '+' : '') + fmt(h) + ' A'));
            hr.appendChild(el('div', 'rule-detail',
                (h > 0
                    ? 'Additional Maximum Demand available before the contingency rule fails — '
                      + 'about ' + fmt(kvaOf(h)) + ' kVA at ' + V + ' V. '
                    : 'The contingency limit is already exceeded by ' + fmt(-h) + ' A. ')
                + 'Converting this to kW needs the power factor, which is not measured.'));
            hr.appendChild(el('div', 'rule-clause', 'KOC-E-003 Pt 1 Rev 4 cl. 12.4'));
        } else {
            hr.appendChild(el('p', 'rule-detail', 'Needs both incomer readings.'));
        }

        /* unbalance, advisory */
        var ub = $('unbalance');
        ub.innerHTML = '';
        var list = unbalanceReview();
        if (!list.length) {
            ub.appendChild(el('p', 'rule-detail',
                'Nothing to show — no feeder recorded for this date carries a mean phase '
                + 'current of at least ' + UNBALANCE_FLOOR + ' A.'));
        } else {
            var note = el('p', 'rule-detail');
            note.style.marginTop = '0';
            note.textContent = 'Feeders carrying a mean phase current below '
                + UNBALANCE_FLOOR + ' A are omitted — a percentage on a near-zero load is '
                + 'arithmetic noise rather than a finding.';
            ub.appendChild(note);
            list.slice(0, 10).forEach(function (u) {
                var row = el('div', 'urow');
                row.appendChild(el('span', 'fname', u.name));
                row.appendChild(el('span', '', u.phases.map(function (x) { return fmt(x, 1); }).join(' / ')));
                row.appendChild(el('span', '', fmt(u.pct) + ' % spread'));
                row.appendChild(el('span', 'fmuted', u.ns === null ? '—' : '≈' + fmt(u.ns, 1) + ' % neg seq'));
                ub.appendChild(row);
            });
        }

        /* what was not tested */
        var na = $('notassessed');
        na.innerHTML = '';
        DC_SYSTEM.notAssessableFromCurrent.forEach(function (n) {
            var row = el('div', 'narow');
            row.appendChild(el('b', '', n.item));
            row.appendChild(el('span', 'rule-clause', n.clause));
            row.appendChild(el('span', 'fmuted', 'needs ' + n.needs));
            na.appendChild(row);
        });
    }

    /* ---------------------------------------------------------
       data
       --------------------------------------------------------- */

    function setBadge(msg, busy) {
        var b = $('status');
        b.innerHTML = '';
        if (busy) { var s = el('span', 'spinner'); b.appendChild(s); }
        b.appendChild(el('span', '', msg));
    }

    function load() {
        var date = $('date').value;
        readings = {};
        if (!endpointUrl()) {
            setBadge('No sheet connected on this device — open the Load Reading page to connect');
            render();
            return Promise.resolve();
        }
        setBadge('Reading the sheet…', true);
        return fetch(endpointUrl(), {
            method: 'POST', body: JSON.stringify({ type: 'status', date: date })
        })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                if (!d || d.result !== 'success') throw new Error((d && d.message) || 'Unexpected response');
                readings = d.recorded || {};
                setBadge(Object.keys(readings).length + ' readings recorded for ' + date);
                render();
            })
            .catch(function (e) {
                console.error('Assessment load failed:', e);
                setBadge('Could not read the sheet (' + e.message + ')');
                render();
            });
    }

    /* ---------------------------------------------------------
       start
       --------------------------------------------------------- */

    function applyTheme(t) {
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
    }


    /* The most recent date the sheet holds anything for. Readings are not
       taken daily, so opening on today would usually show nothing. Falls
       back to today if the sheet cannot be asked. */
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

    function init() {
        $('date').value = new Date().toISOString().slice(0, 10);

        try { plateBasis = localStorage.getItem(DERATE_KEY) || 'frame'; } catch (e) { plateBasis = 'frame'; }
        $('plateBasis').value = plateBasis;
        $('plateBasis').addEventListener('change', function () {
            plateBasis = $('plateBasis').value;
            try { localStorage.setItem(DERATE_KEY, plateBasis); } catch (e) { /* ignore */ }
            render();
        });

        $('date').addEventListener('change', load);
        $('refresh').addEventListener('click', load);
        $('themeBtn').addEventListener('click', function () {
            applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
        });

        var saved;
        try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
        applyTheme(saved || 'dark');

        setBadge('Finding the latest reading\u2026', true);
        latestDate().then(function (d) {
            if (d) $('date').value = d;
            load();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
