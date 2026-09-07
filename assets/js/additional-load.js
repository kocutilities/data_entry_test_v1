/* =============================================================
   KOC Data Center - Additional Load Study
   additional-load.js

   Takes a proposed load and runs it through the KOC assessment sequence
   from the standards study, against the currents actually recorded.

   The same three principles as the assessment page. The one that matters
   most here: a clean "Accept" is almost never available from current
   readings alone, because cable capacity, voltage drop, discrimination and
   fault level all need inputs the reading sheet does not hold. The honest
   verdict is "Accept subject to", with the outstanding items named.
   ============================================================= */

(function () {
    'use strict';

    var ENDPOINT_KEY = 'koc-dc-endpoint';
    var THEME_KEY = 'koc-dc-theme';
    var DERATE_KEY = 'koc-dc-feeder-plate';

    var $ = function (id) { return document.getElementById(id); };
    var readings = {};        /* single-day basis */
    var hist = null;          /* historical basis: {stats, demand, cover, years} */
    var histError = null;     /* set when the history request itself fails */
    var basis = 'today';      /* 'today' | '1' | '2' | '3' | '4' | '5' (years) */
    var plateBasis = 'frame';

    var V = DC_SYSTEM.systemVoltage;
    var SQRT3 = Math.sqrt(3);

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }
    function endpointUrl() {
        try { return localStorage.getItem(ENDPOINT_KEY) || ''; } catch (e) { return ''; }
    }
    function fmt(n, dp) {
        if (n === null || n === undefined || !isFinite(n)) return '—';
        return n.toFixed(dp === undefined ? 0 : dp);
    }
    function maxPhase(key) {
        var r = readings[key];
        if (!r) return null;
        return Math.max(Number(r.r) || 0, Number(r.y) || 0, Number(r.b) || 0);
    }

    /* The value a rule is judged against under the active basis.

       On the historical basis this is the WORST condition actually recorded
       in the period, not the average. A new load has to fit on the day the
       system was busiest, not on a typical day - an average would sail past
       the summer peak and approve a load that fails every August. */
    function basisValue(key) {
        if (basis === 'today') return maxPhase(key);
        if (!hist || !hist.stats || !hist.stats[key]) return null;
        return hist.stats[key].max;
    }

    function basisStats(key) {
        if (basis === 'today' || !hist || !hist.stats) return null;
        return hist.stats[key] || null;
    }

    /* Site demand under the active basis. On history this is the worst
       COINCIDENT total - both incomers on the same date - computed by the
       server, never max(A) + max(B) from different dates. */
    function basisDemand() {
        if (basis === 'today') {
            var a = maxPhase('Main|Incomer A|'), b = maxPhase('Main|Incomer B|');
            if (a === null || b === null) return null;
            return { value: a + b, label: 'recorded on ' + $('date').value, when: $('date').value };
        }
        if (!hist || !hist.demand) return null;
        return { value: hist.demand.max, label: 'worst coincident demand in the period',
                 when: hist.demand.maxDate, stats: hist.demand };
    }

    /* How well the requested period is actually covered by data. This is the
       part that must not be glossed over: a five year button pressed against
       two days of records has to say so, and must stop the page reporting a
       confident pass. */
    function coverage() {
        if (basis === 'today') return { quality: 'today' };
        if (!hist) return { quality: 'none', dates: 0 };
        var c = hist.cover || { dates: 0 };
        var years = Number(basis);
        var wantDays = Math.round(years * 365.25);
        var spanDays = 0;
        if (c.first && c.last) {
            spanDays = Math.round((new Date(c.last) - new Date(c.first)) / 86400000) + 1;
        }
        var q;
        if (!c.dates) q = 'none';
        else if (c.dates < 12 || spanDays < wantDays * 0.25) q = 'thin';
        else if (spanDays < wantDays * 0.8) q = 'partial';
        else q = 'good';
        return { quality: q, dates: c.dates, first: c.first, last: c.last,
                 spanDays: spanDays, wantDays: wantDays, rows: c.rows,
                 demandDates: hist.demand ? hist.demand.n : 0 };
    }
    /* Why a historical figure is missing. "The sheet holds nothing for this
       item" and "we never got an answer from the sheet" are different
       claims, and only the first says anything about the site. Reporting a
       failed request as an absence of readings would be a statement the
       page is in no position to make. */
    function histGap(what) {
        if (basis === 'today') {
            return what + ' was not recorded on ' + $('date').value + '.';
        }
        if (histError) {
            return 'the history was never retrieved \u2014 the sheet returned "' + histError
                 + '". Nothing is implied about ' + what + '; those readings may well exist.';
        }
        return what + ' has no reading in the ' + basis + ' year'
             + (basis === '1' ? '' : 's') + ' to ' + $('date').value + '.';
    }

    function ratingOf(name) {
        var hit = DC_CONFIG.equipment.filter(function (e) { return e.name === name; })[0];
        return hit ? hit.rated : null;
    }
    function continuousOf(name) {
        var p = ratingOf(name);
        if (!p) return null;
        return plateBasis === 'frame' ? p * KOC.deratingFactor.value : p;
    }
    function ampsFromKva(kva) { return kva * 1000 / (SQRT3 * V); }
    function kvaFromAmps(a) { return SQRT3 * V * a / 1000; }

    /* ---------------------------------------------------------
       the proposal
       --------------------------------------------------------- */

    function proposal() {
        var mode = $('unit').value;
        var val = parseFloat($('size').value);
        var pf = parseFloat($('pf').value);
        if (!isFinite(val) || val <= 0) return null;
        if (!isFinite(pf) || pf <= 0 || pf > 1) pf = 0.9;

        var kva, kw, amps;
        if (mode === 'kw') { kw = val; kva = kw / pf; amps = ampsFromKva(kva); }
        else if (mode === 'kva') { kva = val; kw = kva * pf; amps = ampsFromKva(kva); }
        else { amps = val; kva = kvaFromAmps(amps); kw = kva * pf; }

        var typeKey = $('loadType').value;                 /* continuous|intermittent|standby */
        var df = KOC.diversity[typeKey];
        return {
            kw: kw, kva: kva, amps: amps, pf: pf,
            type: typeKey, df: df,
            demandAmps: amps * df,                          /* contribution to Maximum Demand */
            category: $('category').value,                  /* critical|essential|non-essential */
            point: $('point').value,
            phases: $('phases').value
        };
    }

    /* ---------------------------------------------------------
       the rules
       --------------------------------------------------------- */

    var out = [];
    function push(o) { out.push(o); return o; }

    /* The incomer that ultimately carries a load connected at this point.
       The upstream path is built nearest-first and always terminates at an
       incomer, so the last matching entry is the one. */
    function incomerFor(point) {
        var path = DC_SYSTEM.upstream[point] || [];
        for (var i = path.length - 1; i >= 0; i--) {
            var n = path[i].split('|')[1];
            if (n === 'Incomer A' || n === 'Incomer B') return n;
        }
        return null;
    }

    /* A1 - the incomer test.

       This is deliberately self-sufficient. It needs nothing but the
       incomer's own recorded maximum, so it still returns a real answer on a
       site where the incomers are the only equipment with a history. */
    function ruleIncomer(p) {
        var name = incomerFor(p.point);
        var sp = KOC.spareCapacity;
        var base = {
            id: 'A1', title: 'Incomer capacity against the recorded maximum',
            clause: 'KOC-E-003 Pt 1 Rev 4 cl. ' + sp.clause + '; cl. 11.2.2',
            rule: 'Incomer current after the addition ≤ its continuous rating, '
                + 'retaining ' + Math.round(sp.value * 100) + ' % spare'
        };
        if (!name) {
            return push(Object.assign({}, base, { verdict: 'unknown',
                detail: 'Cannot assess — no upstream path is recorded for ' + p.point + '.' }));
        }

        var key = 'Main|' + name + '|';
        var now = basisValue(key);
        var st = basisStats(key);
        if (now === null) {
            return push(Object.assign({}, base, { verdict: 'unknown',
                detail: 'Cannot assess — ' + histGap(name) }));
        }

        /* A feeder carries the real current, not the diversified demand
           figure: diversity describes a group of loads, not a conductor. */
        var after = now + p.amps;

        /* The capability here is the transformer full load current, 2133 A at
           433 V, which is what the rest of the page judges the incomers
           against. It is NOT passed through continuousOf(): that applies the
           0.8 ambient derating meant for cables and switchgear frame sizes,
           and a transformer specified for the site ambient must not be
           derated a second time. The ACB frame rating, which could be lower,
           is not on record - it is listed as an outstanding check. */
        var tr = DC_SYSTEM.transformers.filter(function (t) {
            return t.incomer === key;
        })[0];
        var cont = tr ? tr.ratedA : (ratingOf(name) || 2133);
        var planning = cont / (1 + sp.value);    /* the level that keeps 15 % spare */
        var spareToRating = cont - after;
        var spareToPlanning = planning - after;

        var state = after > cont ? 'fail' : after > planning ? 'watch' : 'pass';
        var maxAdd = Math.max(0, planning - now);

        var reason;
        if (state === 'fail') {
            reason = 'Not acceptable — ' + name + ' would reach ' + fmt(after, 1) + ' A against a '
                   + 'continuous rating of ' + fmt(cont) + ' A, an overload of '
                   + fmt(after - cont, 1) + ' A. The rating is a thermal limit, not a target, '
                   + 'so no part of this load can be added at this point without reinforcement.';
        } else if (state === 'watch') {
            reason = 'Acceptable on rating, but not on spare capacity — ' + name + ' would reach '
                   + fmt(after, 1) + ' A. That is inside the ' + fmt(cont) + ' A rating, but above '
                   + 'the ' + fmt(planning) + ' A level that keeps the ' + Math.round(sp.value * 100)
                   + ' % spare required by cl. ' + sp.clause + '. Adding it consumes the margin the '
                   + 'standard reserves for future growth. The most that can be added while keeping '
                   + 'that margin is ' + fmt(maxAdd, 1) + ' A.';
        } else {
            reason = 'Acceptable — ' + name + ' would reach ' + fmt(after, 1) + ' A, leaving '
                   + fmt(spareToRating, 1) + ' A to the ' + fmt(cont) + ' A rating and '
                   + fmt(spareToPlanning, 1) + ' A still in hand above the '
                   + Math.round(sp.value * 100) + ' % spare level.';
        }

        var figures = [
            ['Incomer carrying the load', name],
            ['Basis', basis === 'today'
                ? 'reading of ' + $('date').value
                : 'highest recorded in ' + basis + ' year' + (basis === '1' ? '' : 's')],
            ['Highest recorded current', fmt(now, 1) + ' A'
                + (st ? '  on ' + st.maxDate + (st.maxPhase ? ', ' + st.maxPhase + ' phase' : '') : '')],
            ['Proposed load', '+' + fmt(p.amps, 1) + ' A'],
            ['Current after addition', fmt(after, 1) + ' A'],
            ['Continuous capability', fmt(cont) + ' A   (transformer FLC at 433 V)'],
            ['Utilisation after', fmt(after / cont * 100, 1) + ' %'],
            ['Spare to rating', fmt(spareToRating, 1) + ' A'],
            ['Spare to the ' + Math.round(sp.value * 100) + ' % level', fmt(spareToPlanning, 1) + ' A'],
            ['Status', state === 'fail' ? 'NOT ACCEPTABLE' : 'ACCEPTABLE']
        ];
        if (st) {
            figures.push(['Recorded range in period',
                fmt(st.min, 1) + ' – ' + fmt(st.max, 1) + ' A   mean ' + fmt(st.avg, 1)
                + '   median ' + fmt(st.med, 1) + '   from ' + st.n + ' readings']);
        }

        return push(Object.assign({}, base, {
            verdict: state, binding: true, figures: figures, detail: reason,
            headroomAfter: spareToPlanning
        }));
    }

    function ruleTransformer(p) {
        var c = KOC.transformer.doubleRadialFactor;
        var d = basisDemand();
        if (!d) {
            return push({ id: 'A2', title: 'Transformer capacity, contingency case',
                verdict: 'unknown', clause: 'KOC-E-003 Pt 1 Rev 4 cl. ' + c.clause,
                rule: 'Each transformer alone ≥ 1.15 × total Maximum Demand',
                detail: histError
                    ? 'Cannot assess — ' + histGap('the incomers')
                    : basis === 'today'
                        ? 'Cannot assess — both incomer readings are needed and at least one is missing.'
                        : 'Cannot assess — no date in the ' + basis + ' year'
                          + (basis === '1' ? '' : 's') + ' to ' + $('date').value + ' has both '
                          + 'incomers recorded, so no coincident site demand can be established.' });
        }
        var mdNow = d.value;
        var mdNew = mdNow + p.demandAmps;
        var cap = DC_SYSTEM.transformers[0].ratedA;
        var required = c.value * mdNew;
        var ceiling = cap / c.value;
        var pass = cap >= required;

        return push({
            id: 'A2', title: 'Transformer capacity, contingency case',
            verdict: pass ? 'pass' : 'fail',
            clause: 'KOC-E-003 Pt 1 Rev 4 cl. ' + c.clause,
            rule: 'Each transformer alone ≥ 1.15 × total Maximum Demand',
            binding: true,
            figures: [
                ['Maximum Demand basis', basis === 'today'
                    ? 'reading of ' + d.when
                    : 'worst in ' + basis + ' year' + (basis === '1' ? '' : 's') + ', on ' + d.when],
                ['Maximum Demand now', fmt(mdNow) + ' A'],
                ['Proposed contribution', '+' + fmt(p.demandAmps, 1) + ' A'],
                ['Maximum Demand after', fmt(mdNew) + ' A  (' + fmt(kvaFromAmps(mdNew)) + ' kVA)'],
                ['Required per transformer', fmt(required) + ' A'],
                ['Capability per transformer', fmt(cap) + ' A'],
                ['Utilisation after', fmt(required / cap * 100) + ' %'],
                ['Demand ceiling', fmt(ceiling) + ' A']
            ],
            detail: pass
                ? 'One transformer alone still carries the whole demand with the 15 % margin. '
                  + fmt(ceiling - mdNew) + ' A would remain.'
                : 'Rejected — exceeds the contingency limit by ' + fmt(mdNew - ceiling) + ' A. '
                  + 'The most that can be added at this demand is ' + fmt(Math.max(0, ceiling - mdNow))
                  + ' A.',
            headroomAfter: ceiling - mdNew
        });
    }

    function ruleGenerator(p) {
        if (p.category === 'non-essential') {
            return push({ id: 'A3', title: 'Generator capacity',
                verdict: 'na', clause: 'KOC-E-003 Pt 1 Rev 4 cl. 9.1.4',
                rule: 'Non-essential loads are not backed by a generator',
                detail: 'Not applicable — a non-essential load normally has a single source '
                      + 'and no generator backing. If it is in fact to be backed, reclassify it.' });
        }
        var genId = DC_SYSTEM.backedBy[p.point];
        if (!genId) {
            return push({ id: 'A3', title: 'Generator capacity',
                verdict: 'fail', clause: 'KOC-E-003 Pt 1 Rev 4 cl. 9.1.2 / 9.1.3',
                rule: p.category === 'critical'
                    ? 'Critical loads shall be on no-break supply backed by emergency generator'
                    : 'Essential loads shall be backed by a standby generator',
                detail: 'Rejected — ' + p.point + ' is a utility-only supply with no generator '
                      + 'behind it, so a ' + p.category + ' load connected here would be lost on '
                      + 'an incomer failure. Choose a generator-backed connection point.' });
        }
        var g = DC_SYSTEM.generators.filter(function (x) { return x.id === genId; })[0];
        var backed = 0, missing = [];
        g.backs.keys.forEach(function (k) {
            var m = basisValue(k);
            if (m === null) missing.push(k.split('|')[1]); else backed += m;
        });
        if (missing.length) {
            return push({ id: 'A3', title: g.id + ' capacity',
                verdict: 'unknown', clause: 'KOC-E-003 Pt 1 Rev 4 cl. 13.2.3 / 13.3.2',
                rule: 'Continuously rated for Maximum Demand + 15 %',
                detail: 'Cannot assess — ' + histGap(missing.join(', ')) });
        }
        var after = backed + p.demandAmps;
        var required = 1.15 * after;
        var pass = g.ratedA >= required;
        return push({
            id: 'A3', title: g.id + ' capacity',
            verdict: pass ? 'pass' : 'fail',
            clause: 'KOC-E-003 Pt 1 Rev 4 cl. 13.2.3 / 13.3.2',
            rule: 'Continuously rated for Maximum Demand + 15 %',
            figures: [
                ['Backed load now', fmt(backed) + ' A'],
                ['After the addition', fmt(after) + ' A'],
                ['Required rating', fmt(required) + ' A'],
                [g.id + ' rating', fmt(g.ratedA) + ' A'],
                ['Utilisation after', fmt(required / g.ratedA * 100) + ' %']
            ],
            detail: pass
                ? g.id + ' still carries its section with the 15 % margin.'
                : 'Rejected — ' + g.id + ' would be short by ' + fmt(required - g.ratedA) + ' A. '
                  + 'The 10 % / 1 hour overload in KOC-E-007 cl. 11.1.6 is a contingency '
                  + 'allowance and cannot be used to justify planned load.'
        });
    }

    /* every metered point on the path from the connection point upward */
    function ruleUpstream(p) {
        var path = DC_SYSTEM.upstream[p.point] || [];
        var rows = [], anyFail = false, anyUnknown = false;

        path.forEach(function (key) {
            var name = key.split('|')[1];
            var now = basisValue(key);
            var st = basisStats(key);
            /* the incomers are judged by A2, not here */
            if (name === 'Incomer A' || name === 'Incomer B') return;
            if (now === null) {
                rows.push({ name: name, state: 'unknown' }); anyUnknown = true; return;
            }
            var cont = continuousOf(name);
            var after = now + p.amps;      /* a feeder carries the actual current, not the
                                              diversified demand figure */
            var pct = cont ? after / cont * 100 : null;
            var state = pct === null ? 'norating' : pct > 100 ? 'fail' : pct > 87 ? 'watch' : 'pass';
            if (state === 'fail') anyFail = true;
            if (state === 'norating') anyUnknown = true;
            rows.push({ name: name, now: now, after: after, cont: cont, pct: pct,
                        state: state, st: st });
        });

        return push({
            id: 'A4', title: 'Feeders on the supply path',
            verdict: anyFail ? 'fail' : anyUnknown ? 'unknown' : 'pass',
            clause: 'KOC-E-009 Rev 3 cl. 6.3; KOC-E-003 Pt 1 cl. 11.2.2',
            rule: 'Every feeder carrying the load ≤ its continuous rating',
            rows: rows,
            detail: anyFail
                ? 'Rejected — ' + rows.filter(function (r) { return r.state === 'fail'; })
                    .map(function (r) { return r.name + ' would reach ' + fmt(r.pct) + ' %'; }).join(', ')
                    + '.'
                : 'The full ' + fmt(p.amps, 1) + ' A is applied at every level, with no diversity '
                  + 'between the load and its feeders.',
            note: DC_SYSTEM.unmeteredOnPath[p.point]
                ? 'Not testable on this path: ' + DC_SYSTEM.unmeteredOnPath[p.point].join(' and ')
                  + ' carry no meter. Their loading is inferred by A5 where possible.'
                : ''
        });
    }

    /* UPS chain, computed from the PDUs it feeds */
    function ruleUps(p) {
        var chain = DC_SYSTEM.ups.filter(function (u) {
            return u.feeds.indexOf('Main|' + p.point + '|') > -1;
        })[0];
        if (!chain) {
            /* Reported rather than omitted, so the sequence always reads A1
               to A7 and the reader can see the check was considered. That a
               load is NOT on a UPS is itself worth stating, especially for
               one declared critical. */
            return push({ id: 'A5', title: 'UPS backing', verdict: 'na',
                clause: 'KOC-E-011 Rev 2 cl. 8.7, 19.1.1',
                rule: 'UPS continuous output, with 15 % spare for future load',
                detail: 'Not applicable — no UPS supplies ' + p.point + ', so there is no UPS '
                      + 'capacity to test.'
                      + (p.category === 'critical'
                          ? ' Note that the load is declared critical yet would sit on the raw '
                            + 'supply at this point, held up only by the generator through the '
                            + 'ATS. Whether that is acceptable is a design question for the '
                            + 'load, not something these readings can settle.'
                          : '') });
        }

        var loads = DC_SYSTEM.ups.map(function (u) {
            var sum = 0, miss = false;
            u.feeds.forEach(function (k) {
                var m = basisValue(k);
                if (m === null) miss = true; else sum += m;
            });
            return { id: u.id, kva: u.kva, ratedA: ampsFromKva(u.kva), amps: sum, missing: miss };
        });
        var mine = loads.filter(function (l) { return l.id === chain.id; })[0];
        if (mine.missing) {
            return push({ id: 'A5', title: chain.id + ' capacity',
                verdict: 'unknown', clause: 'KOC-E-011 Rev 2 cl. 8.7, 19.1.1',
                rule: 'UPS continuous output, with 15 % spare for future load',
                detail: 'Cannot assess — a PDU reading on this chain is missing.' });
        }

        var after = mine.amps + p.amps;
        var required = 1.15 * after;
        var pass = mine.ratedA >= required;

        /* the 2N intent: either UPS alone carrying every PDU */
        var total = loads.reduce(function (s, l) { return s + l.amps; }, 0) + p.amps;
        var soloOk = mine.ratedA >= total;

        return push({
            id: 'A5', title: chain.id + ' capacity  (' + chain.kva + ' kVA)',
            verdict: pass ? (soloOk ? 'pass' : 'watch') : 'fail',
            clause: 'KOC-E-011 Rev 2 cl. 8.7, 19.1.1; cl. 8.2 for redundancy',
            rule: 'Continuous output with 15 % spare; and either UPS alone carrying the room',
            figures: [
                [chain.id + ' load now', fmt(mine.amps) + ' A  (' + fmt(kvaFromAmps(mine.amps)) + ' kVA)'],
                ['After the addition', fmt(after) + ' A'],
                ['Required with 15 %', fmt(required) + ' A'],
                [chain.id + ' rating', fmt(mine.ratedA) + ' A  (' + chain.kva + ' kVA)'],
                ['Both chains after', fmt(total) + ' A  (' + fmt(kvaFromAmps(total)) + ' kVA)'],
                ['One UPS alone carrying all', soloOk ? 'yes' : 'NO']
            ],
            detail: !pass
                ? 'Rejected — ' + chain.id + ' would be short by ' + fmt(required - mine.ratedA) + ' A.'
                : soloOk
                    ? chain.id + ' has capacity, and either UPS alone could still carry the whole room.'
                    : 'The chain itself has capacity, but after this addition ONE UPS could no longer '
                      + 'carry the whole room (' + fmt(total) + ' A against ' + fmt(mine.ratedA)
                      + ' A). The dual-corded arrangement would stop being N+1.',
            note: 'UPS output is not metered — loading is the sum of the PDUs on the chain. '
                + 'The "either UPS alone" test is the design intent recorded on the block '
                + 'diagram; KOC-E-011 cl. 8.2 requires a dual redundant UPS in standard form.'
        });
    }

    function rulePowerFactor(p) {
        var c = KOC.powerQuality.powerFactor;
        var pass = p.pf >= c.min;
        return push({
            id: 'A6', title: 'Power factor of the new load',
            verdict: pass ? 'pass' : 'watch',
            clause: 'KOC-E-003 Pt 1 cl. 9.5.3; KOC-E-006 cl. 9.4.2 (MEWRE Rule 5)',
            rule: 'System power factor ≥ 0.95 lagging',
            detail: pass
                ? 'At ' + p.pf.toFixed(2) + ' the new load does not pull the system below 0.95.'
                : 'The new load is stated at ' + p.pf.toFixed(2) + ', below the 0.95 the system '
                  + 'must maintain. It does not by itself breach the limit — that depends on the '
                  + 'whole system — but correction may be needed. System power factor is not '
                  + 'measured, so this cannot be confirmed from the readings.'
        });
    }

    function ruleUpstreamMew(p) {
        var c = KOC.upstream.mewFeederLimit;
        var d = basisDemand();
        if (!d) return null;
        var mw = kvaFromAmps(d.value + p.demandAmps) * p.pf / 1000;
        var pass = mw <= c.value;
        return push({
            id: 'A7', title: 'Upstream MEW feeder',
            verdict: pass ? 'pass' : 'fail',
            clause: 'KOC-E-003 Pt 1 Rev 4 cl. ' + c.clause,
            rule: 'Maximum power per MEW 11 kV feeder ≤ 5 MW',
            figures: [['Estimated demand after', fmt(mw, 2) + ' MW at PF ' + p.pf.toFixed(2)],
                      ['Limit', c.value + ' MW']],
            detail: pass ? 'Well within the MEW feeder limit.'
                         : 'Rejected — would exceed the 5 MW MEW feeder limit.',
            note: 'Estimated from the LV currents and the stated power factor; the true 11 kV '
                + 'demand is not metered here.'
        });
    }

    /* ---------------------------------------------------------
       render
       --------------------------------------------------------- */

    var CHIP = { pass: ['ok', 'Passes'], fail: ['bad', 'Fails'],
                 unknown: ['warn', 'Cannot assess'], watch: ['warn', 'Caution'],
                 na: ['muted', 'Not applicable'] };

    function card(r) {
        var c = el('div', 'rule ' + r.verdict);
        var h = el('div', 'rule-head');
        h.appendChild(el('span', 'rule-id', r.id));
        h.appendChild(el('span', 'rule-title', r.title));
        var m = CHIP[r.verdict] || CHIP.unknown;
        h.appendChild(el('span', 'chip ' + m[0], m[1]));
        c.appendChild(h);
        c.appendChild(el('div', 'rule-rule', r.rule));
        c.appendChild(el('div', 'rule-clause', r.clause));

        if (r.figures) {
            var f = el('div', 'figs');
            r.figures.forEach(function (x) {
                var row = el('div', 'fig');
                row.appendChild(el('span', '', x[0]));
                row.appendChild(el('b', '', x[1]));
                f.appendChild(row);
            });
            c.appendChild(f);
        }
        if (r.rows) {
            var t = el('div', 'ftable');
            var head = el('div', 'frow fhead');
            ['Feeder', 'Now', 'After', 'Continuous', '%', ''].forEach(function (x) {
                head.appendChild(el('span', '', x));
            });
            t.appendChild(head);
            r.rows.forEach(function (x) {
                var row = el('div', 'frow ' + x.state);
                row.appendChild(el('span', 'fname', x.name));
                if (x.state === 'unknown') {
                    var s = el('span', 'fmuted', 'not recorded');
                    s.style.gridColumn = '2 / -1';
                    row.appendChild(s);
                } else {
                    row.appendChild(el('span', '', fmt(x.now, 1) + ' A'));
                    row.appendChild(el('span', '', fmt(x.after, 1) + ' A'));
                    row.appendChild(el('span', 'fmuted', x.cont ? fmt(x.cont) + ' A' : '—'));
                    row.appendChild(el('span', 'fpct', x.pct === null ? '—' : fmt(x.pct) + ' %'));
                    row.appendChild(el('span', 'fstate',
                        x.state === 'fail' ? 'over rating' : x.state === 'watch' ? 'above 87 %' : ''));
                }
                t.appendChild(row);
            });
            c.appendChild(t);
        }
        if (r.detail) c.appendChild(el('p', 'rule-detail', r.detail));
        if (r.note) c.appendChild(el('p', 'rule-note', r.note));
        return c;
    }

    var COVER_TEXT = {
        good:    ['Period well covered',
                  'The records span the requested period, so the worst recorded condition is a '
                  + 'meaningful peak.'],
        partial: ['Period only partly covered',
                  'The records cover part of the requested period. The worst condition found is '
                  + 'real, but an earlier peak outside the recorded span would not appear here.'],
        thin:    ['Not enough history to judge',
                  'There are too few readings, or they span too short a time, for a worst-case to '
                  + 'mean anything. A peak that has not been recorded cannot be found.'],
        none:    ['No history in this period',
                  'Nothing was recorded in the requested period.']
    };

    function renderCoverage() {
        var host = $('coverage');
        var tbl = $('histTable');
        host.innerHTML = ''; tbl.innerHTML = '';

        if (basis === 'today') {
            $('coverSection').hidden = true;
            return;
        }
        $('coverSection').hidden = false;

        if (histError) {
            var eb = el('div', 'cover-banner thin');
            eb.appendChild(el('b', '', 'History could not be retrieved'));
            eb.appendChild(el('span', '', 'The sheet returned "' + histError + '", so this panel '
                + 'is empty because the request failed — not because the period is empty. '
                + 'Redeploy Code.gs as a New version, then try again.'));
            host.appendChild(eb);
            return;
        }

        var c = coverage();
        var t = COVER_TEXT[c.quality] || COVER_TEXT.none;
        var b = el('div', 'cover-banner ' + c.quality);
        b.appendChild(el('b', '', t[0]));

        var line = t[1];
        if (c.dates) {
            line += '  Found ' + c.dates + ' reading date' + (c.dates === 1 ? '' : 's')
                  + ' between ' + c.first + ' and ' + c.last + ' — a span of ' + c.spanDays
                  + ' day' + (c.spanDays === 1 ? '' : 's') + ' against the ' + c.wantDays
                  + ' days requested. ' + c.rows + ' readings in total, of which '
                  + c.demandDates + ' date' + (c.demandDates === 1 ? '' : 's')
                  + ' had both incomers recorded, which is what a site demand needs.';
        }
        b.appendChild(el('span', '', line));
        host.appendChild(b);

        if (!hist || !hist.stats || !Object.keys(hist.stats).length) return;

        /* the main equipment, worst first */
        var rows = [];
        DC_CONFIG.equipment.forEach(function (e) {
            var st = hist.stats['Main|' + e.name + '|'];
            if (!st) return;
            var cont = continuousOf(e.name);
            rows.push({ name: e.name, st: st, cont: cont,
                        pct: cont ? st.max / cont * 100 : null });
        });
        rows.sort(function (x, y) { return (y.pct || 0) - (x.pct || 0); });

        var head = el('div', 'hrow hhead');
        ['Equipment', 'Max', 'p95', 'Median', 'Mean', 'Min', 'Max was'].forEach(function (h) {
            head.appendChild(el('span', '', h));
        });
        tbl.appendChild(head);

        rows.forEach(function (r) {
            var row = el('div', 'hrow');
            row.appendChild(el('span', 'fname', r.name));
            row.appendChild(el('span', 'hnum hmax', fmt(r.st.max, 1)));
            row.appendChild(el('span', 'hnum', fmt(r.st.p95, 1)));
            row.appendChild(el('span', 'hnum', fmt(r.st.med, 1)));
            row.appendChild(el('span', 'hnum', fmt(r.st.avg, 1)));
            row.appendChild(el('span', 'hnum', fmt(r.st.min, 1)));
            row.appendChild(el('span', 'fmuted', r.st.maxDate + '  (' + r.st.n + ')'));
            tbl.appendChild(row);
        });
    }

    function run() {
        var p = proposal();
        var host = $('results');
        host.innerHTML = '';
        out = [];

        if (!p) {
            $('verdict').className = 'verdict';
            $('verdict').innerHTML = '';
            $('verdict').appendChild(el('div', 'verdict-title', 'Enter a load to assess'));
            $('summary').innerHTML = '';
            return;
        }

        /* what was proposed */
        var sm = $('summary');
        sm.innerHTML = '';
        [['Proposed load', fmt(p.kw, 1) + ' kW  ·  ' + fmt(p.kva, 1) + ' kVA  ·  ' + fmt(p.amps, 1) + ' A'],
         ['Power factor', p.pf.toFixed(2)],
         ['Load type', p.type + '  — diversity ' + (p.df * 100) + ' %'],
         ['Contribution to Maximum Demand', fmt(p.demandAmps, 1) + ' A'],
         ['Category', p.category],
         ['Connection point', p.point]].forEach(function (x) {
            var d = el('div', 'fig');
            d.appendChild(el('span', '', x[0]));
            d.appendChild(el('b', '', x[1]));
            sm.appendChild(d);
        });

        renderCoverage();

        ruleIncomer(p);
        ruleTransformer(p);
        ruleGenerator(p);
        ruleUpstream(p);
        ruleUps(p);
        rulePowerFactor(p);
        ruleUpstreamMew(p);

        out.forEach(function (r) { if (r) host.appendChild(card(r)); });

        /* verdict */
        var fails = out.filter(function (r) { return r && r.verdict === 'fail'; });
        var unknowns = out.filter(function (r) { return r && r.verdict === 'unknown'; });
        var watches = out.filter(function (r) { return r && r.verdict === 'watch'; });

        var v = $('verdict');
        v.innerHTML = '';
        var kind, title, sub;
        var cov = coverage();

        /* A missing history for one item is not a reason to withhold the
           answer for every other item. Anything the data DOES support is
           assessed and stated plainly; anything it does not is named, and
           the verdict is qualified by exactly that list rather than
           replaced by a refusal. */
        /* "Not applicable" is neither a pass nor a gap: the rule does not
           bear on this connection point at all, so it must not prop up an
           acceptance and must not be counted as something left untested. */
        var assessed = out.filter(function (r) {
            return r && r.verdict !== 'unknown' && r.verdict !== 'na';
        });

        /* A6 judges the stated power factor of the proposal itself and needs
           no measurement, so it can pass on a site with no readings at all.
           An acceptance resting on nothing else would be an acceptance that
           no capacity was ever checked. */
        var INPUT_ONLY = ['A6'];
        var measured = assessed.filter(function (r) {
            return INPUT_ONLY.indexOf(r.id) < 0;
        });

        if (basis !== 'today' && histError) {
            /* Not the same thing as an empty period: the request itself did
               not complete, so nothing here has been tested against history
               at all and no acceptance may be implied from it. */
            kind = 'warn'; title = 'History could not be read';
            sub = 'The sheet returned "' + histError + '", so no historical loading was '
                + 'retrieved and nothing below has been tested against it. If the Apps Script '
                + 'was deployed before this feature was added, open Deploy \u2192 Manage '
                + 'deployments and redeploy Code.gs as a New version. Until then, assess on a '
                + 'single day and treat the result as provisional.';
            v.className = 'verdict ' + kind;
            v.appendChild(el('div', 'verdict-title', title));
            v.appendChild(el('div', 'verdict-sub', sub));
            $('scopeNote').innerHTML = '';
            renderScope();
            renderOutstanding();
            return;
        }

        if (fails.length) {
            kind = 'bad'; title = 'Reject';
            sub = fails.length + ' rule' + (fails.length === 1 ? '' : 's') + ' failed — '
                + fails.map(function (r) { return r.id; }).join(', ')
                + '. ' + fails[0].detail;
        } else if (!measured.length) {
            kind = 'warn'; title = 'No capacity check was possible';
            sub = 'Nothing on the supply path has a reading in this period, so not one capacity '
                + 'rule could be computed'
                + (assessed.length ? ' — only ' + assessed.map(function (r) { return r.id; }).join(', ')
                    + ', which judge' + (assessed.length === 1 ? 's' : '') + ' the proposal itself '
                    + 'rather than the system carrying it' : '')
                + '. This is not an acceptance. Choose a different basis, or record the currents '
                + 'first.';
        } else if (unknowns.length) {
            kind = 'warn'; title = 'Accept on the parameters assessed';
            sub = assessed.length + ' of ' + out.length + ' rules were testable and all pass'
                + (watches.length ? ' (' + watches.length + ' with a caution)' : '')
                + '. ' + unknowns.length + ' could not be tested — '
                + unknowns.map(function (r) { return r.id; }).join(', ')
                + ' — because that equipment has no recorded history in this period. '
                + 'This is a conditional acceptance: it holds for what was checked, and the '
                + 'unchecked items must be closed before connection.';
        } else {
            kind = 'ok'; title = 'Accept subject to the outstanding checks';
            sub = 'Every rule testable from recorded currents passes'
                + (watches.length ? ', with ' + watches.length + ' caution' + (watches.length === 1 ? '' : 's') : '')
                + '. The items below still have to be completed before connection.';
        }
        v.className = 'verdict ' + kind;
        v.appendChild(el('div', 'verdict-title', title));
        v.appendChild(el('div', 'verdict-sub', sub));

        /* the span caveat now rides alongside the verdict instead of replacing it */
        var sn = $('scopeNote');
        sn.innerHTML = '';
        if (basis !== 'today' && (cov.quality === 'thin' || cov.quality === 'none') && assessed.length) {
            var n = el('div', 'cover-banner partial');
            n.appendChild(el('b', '', 'Read the worst case as a floor, not a ceiling'));
            n.appendChild(el('span', '', cov.dates
                ? 'The ' + cov.dates + ' reading date' + (cov.dates === 1 ? '' : 's')
                  + ' found span ' + cov.spanDays + ' day' + (cov.spanDays === 1 ? '' : 's')
                  + ' of the ' + cov.wantDays + ' requested. The peaks used below are real, and a '
                  + 'failure against them is real, but a higher peak may have occurred on a day '
                  + 'that was never recorded. Treat a pass as provisional.'
                : 'Nothing is recorded in this period.'));
            sn.appendChild(n);
        }

        renderScope();
        renderOutstanding();
    }

    /* An explicit statement of what the data did and did not support. The
       page should never leave the reader guessing which parameters stand
       behind a verdict. */
    function renderScope() {
        var host = $('assessedList');
        host.innerHTML = '';

        var did = out.filter(function (r) {
            return r && r.verdict !== 'unknown' && r.verdict !== 'na';
        });
        var didnt = out.filter(function (r) { return r && r.verdict === 'unknown'; });
        var na = out.filter(function (r) { return r && r.verdict === 'na'; });

        function block(label, arr, cls, mark, why) {
            if (!arr.length) return;
            host.appendChild(el('div', 'scope-head', label));
            arr.forEach(function (r) {
                var row = el('div', 'scope-row ' + cls);
                row.appendChild(el('span', 'mark', mark));
                var t = el('div', '');
                t.appendChild(el('b', '', r.id + ' \u00b7 ' + r.title));
                t.appendChild(el('div', 'rule-clause', r.clause));
                row.appendChild(t);
                row.appendChild(el('span', 'why', why(r)));
                host.appendChild(row);
            });
        }

        block('Assessed', did, 'yes', '\u2713', function (r) {
            var word = r.verdict === 'fail' ? 'Not acceptable'
                     : r.verdict === 'watch' ? 'Acceptable with a caution' : 'Acceptable';
            /* A1 already opens its detail with the same word, and "Acceptable
               - Acceptable - ..." reads like a stutter. */
            if (/^(Acceptable|Not acceptable|Rejected)\b/i.test(r.detail)) return r.detail;
            return word + ' \u2014 ' + r.detail;
        });
        block(histError ? 'Not assessed \u2014 history not retrieved'
                        : 'Not assessed \u2014 no data',
              didnt, 'no', '\u2014', function (r) {
            return r.detail;
        });
        block('Not applicable to this connection point', na, 'no', '\u00b7', function (r) {
            return r.detail;
        });

        if (didnt.length) {
            var f = el('div', 'scope-row no');
            f.appendChild(el('span', 'mark', '!'));
            var t = el('div', '');
            t.appendChild(el('b', '', 'What this means'));
            f.appendChild(t);
            f.appendChild(el('span', 'why',
                'The verdict above covers only the assessed rows. The items not assessed are '
                + 'not thereby acceptable \u2014 they are unknown, and each has to be closed by '
                + 'measurement or by calculation before the load is connected.'));
            host.appendChild(f);
        }
    }

    function renderOutstanding() {
        var os = $('outstanding');
        os.innerHTML = '';
        [['Cable capacity, derated', 'KOC-E-008 cl. 8.3.2 — 50 °C in air, 40 °C buried, grouping and installation method'],
         ['Voltage drop ≤ 2.5 %', 'KOC-E-008 cl. 8.3.4(a)(iii) — needs cable size, length and route'],
         ['Cable short-circuit withstand', 'KOC-E-008 cl. 8.3.1(c),(d) — at the actual protection clearing time'],
         ['Protection discrimination', 'KOC-E-006 cl. 8.6.6 — 0.3 s selectivity interval to be preserved'],
         ['Fault level within ratings', 'KOC-E-003 Pt 1 cl. 9.4.1(c)'],
         ['Incomer ACB continuous rating', 'A1 judges the incomers against the 2133 A transformer '
            + 'FLC. The ACB-3 / ACB-4 frame size and trip settings are not on record and may be lower.'],
         ['Board incomer including spare ways', 'KOC-E-009 cl. 26.2 — needs the way schedule for the board'],
         ['Load flow and short circuit studies, KOC approved', 'KOC-E-006 cl. 8.1.1 — required for anything beyond a trivial addition']
        ].forEach(function (x) {
            var row = el('div', 'narow');
            row.appendChild(el('b', '', x[0]));
            row.appendChild(el('span', 'rule-clause', x[1]));
            os.appendChild(row);
        });

        if (basis !== 'today') {
            var c = coverage();
            if (c.quality === 'partial' || c.quality === 'good') {
                var row = el('div', 'narow');
                row.appendChild(el('b', '', 'Confirm the period covers a summer peak'));
                row.appendChild(el('span', 'rule-clause',
                    'Kuwait ambient drives the annual maximum. ' + c.dates
                    + ' reading dates from ' + c.first + ' to ' + c.last
                    + ' — check that at least one July or August is inside that span.'));
                os.appendChild(row);
            }
        }
    }

    /* ---------------------------------------------------------
       data
       --------------------------------------------------------- */

    function setBadge(msg, busy) {
        var b = $('status');
        b.innerHTML = '';
        if (busy) b.appendChild(el('span', 'spinner'));
        b.appendChild(el('span', '', msg));
    }

    function yearsAgo(n) {
        var d = new Date($('date').value || new Date().toISOString().slice(0, 10));
        d.setFullYear(d.getFullYear() - n);
        return d.toISOString().slice(0, 10);
    }

    function loadHistory() {
        hist = null; histError = null;
        var to = $('date').value;
        var from = yearsAgo(Number(basis));
        setBadge('Reading ' + basis + ' year' + (basis === '1' ? '' : 's')
               + ' of history…', true);
        return fetch(endpointUrl(), {
            method: 'POST', body: JSON.stringify({ type: 'history', from: from, to: to })
        })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                if (!d || d.result !== 'success') throw new Error((d && d.message) || 'Unexpected response');
                hist = d;
                var c = d.cover || {};
                setBadge((c.rows || 0) + ' readings on ' + (c.dates || 0) + ' date'
                       + (c.dates === 1 ? '' : 's') + ' between ' + from + ' and ' + to);
                run();
            })
            .catch(function (e) {
                console.error('History load failed:', e);
                histError = e.message || 'unknown error';
                setBadge('Could not read history (' + histError + '). If the sheet was set up '
                       + 'before this feature, Code.gs needs redeploying as a New version.');
                run();
            });
    }

    function load() {
        var date = $('date').value;
        readings = {};
        if (!endpointUrl()) {
            setBadge('No sheet connected on this device — open the Load Reading page to connect');
            run();
            return Promise.resolve();
        }
        if (basis !== 'today') return loadHistory();
        setBadge('Reading the sheet…', true);
        return fetch(endpointUrl(), {
            method: 'POST', body: JSON.stringify({ type: 'status', date: date })
        })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                if (!d || d.result !== 'success') throw new Error((d && d.message) || 'Unexpected response');
                readings = d.recorded || {};
                setBadge(Object.keys(readings).length + ' readings recorded for ' + date
                       + ' — the study is judged against these');
                run();
            })
            .catch(function (e) {
                console.error('Additional load study failed to load readings:', e);
                setBadge('Could not read the sheet (' + e.message + ')');
                run();
            });
    }

    function init() {
        $('date').value = new Date().toISOString().slice(0, 10);

        /* connection points, generator-backed ones marked */
        var sel = $('point');
        DC_CONFIG.equipment.forEach(function (e) {
            if (e.name === 'Incomer A' || e.name === 'Incomer B') return;
            var o = document.createElement('option');
            o.value = e.name;
            var g = DC_SYSTEM.backedBy[e.name];
            o.textContent = e.name + (g ? '  · backed by ' + g : '  · utility only');
            sel.appendChild(o);
        });
        sel.value = 'PDU 1';

        try { plateBasis = localStorage.getItem(DERATE_KEY) || 'frame'; } catch (e) { plateBasis = 'frame'; }

        ['size', 'unit', 'pf', 'loadType', 'category', 'point', 'phases'].forEach(function (id) {
            $(id).addEventListener('input', run);
            $(id).addEventListener('change', run);
        });
        $('date').addEventListener('change', load);
        $('refresh').addEventListener('click', load);
        $('basis').addEventListener('change', function () {
            basis = $('basis').value;
            $('dateLabel').textContent = basis === 'today' ? 'on' : 'counting back from';
            load();
        });

        $('themeBtn').addEventListener('click', function () {
            var t = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', t);
            try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
        });
        var saved;
        try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
        document.documentElement.setAttribute('data-theme', saved || 'dark');

        load();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
