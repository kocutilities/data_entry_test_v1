/* =============================================================
   KOC Data Center - cabinet load model
   cabinet-model.js

   Every cabinet is fed twice: once from an odd PDU (Feed A, UPS-1) and
   once from an even PDU (Feed B, UPS-2). Each server has two power
   supplies, one on each feed. If a PDU fails, every server behind it
   draws its whole load through its other supply - so the SURVIVING
   breaker carries the cabinet's entire current. This file works out,
   for each cabinet, whether it can.

   Pure calculation: no page, no network. cabinets.js draws it;
   test_cabinet_model.js checks it.

   THE BREAKER LIMITS - the same basis the assessment page uses
     continuous rating = 0.8 x plate          KOC-E-003 Pt 1 cl. 11.2.2
     margin line       = 87 % of continuous   the 15 % spare margin,
                                              as assessment.js R5 uses
     trip              = the plate itself

   STATUS, from the worst surviving breaker after either PDU is lost
     Normal     <= 87 % of continuous     margin intact
     High Load  <= 100 % of continuous    within rating, margin used
     Critical   above continuous, up to the plate - holds, not sustainable
     Overload   above the plate - the breaker trips and the cabinet
                goes dark on a single PDU failure: no redundancy at all

   THE FAILOVER MODEL
   A way with the same number on both PDUs serves the same rack position
   (the layout marks each rack "P1 Q74 / P6 Q74"), and the same number
   is on the same phase on both. So for a cabinet whose two sides match,
   the surviving breaker carries exactly its own current plus its
   partner's. 115 of the 118 cabinets match.

   Three do not - A-14, G-01 and G-02 have different ways, and phases,
   on each side. There, matching ways are paired as above and the
   current on a way with no partner is spread over the surviving ways in
   proportion to what they already carry (each server's other supply is
   already on one of them). Those rows are marked approximate.

   A reading that was not taken is not zero. A cabinet with any way
   unread is not given a status - treating the gap as 0 A would report
   "Normal" for load nobody measured.
   ============================================================= */

var DC_CABINETS = (function () {
    'use strict';

    var V_PHASE = 415 / Math.sqrt(3);                /* 239.6 V, per phase */
    var CONT    = KOC.deratingFactor.value;          /* 0.8, cl. 11.2.2    */
    var MARGIN  = 87;                                /* % of continuous    */

    var STATUS = ['normal', 'high', 'critical', 'overload'];

    function isSpare(rack) { return /SPARE/i.test(rack || ''); }

    function plateOf(breaker) {
        var m = String(breaker || '').match(/(\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : null;
    }

    function phasesOf(ph) { return ph === '3' ? ['R', 'Y', 'B'] : [ph]; }

    /* Row letter for grouping - "Cabin A-02" -> A, "L-06" -> L, "Cabin A05" -> A. */
    function rowOf(name) {
        var s = String(name).replace(/^cabin\s*/i, '');
        var m = s.match(/[A-Za-z]/);
        return m ? m[0].toUpperCase() : '?';
    }

    var ZONE = { 'PDU 1': 1, 'PDU 6': 1, 'PDU 3': 2, 'PDU 2': 2,
                 'PDU 5': 3, 'PDU 4': 3, 'PDU 7': 4, 'PDU 8': 4 };

    /* ---------------------------------------------------------
       the cabinets, from config
       --------------------------------------------------------- */

    function build() {
        var byName = {};
        Object.keys(DC_CONFIG.pduCircuits).forEach(function (pdu) {
            var feed = DC_PDU_FEED[pdu];
            DC_CONFIG.pduCircuits[pdu].forEach(function (c) {
                if (isSpare(c.rack)) return;
                var cab = byName[c.rack] || (byName[c.rack] = { name: c.rack, A: [], B: [] });
                cab[feed].push({ pdu: pdu, q: c.c, ph: c.ph, plate: plateOf(c.breaker),
                                 key: 'PDU|' + pdu + '|' + c.c });
            });
        });

        var dual = [], single = [];
        Object.keys(byName).forEach(function (n) {
            var c = byName[n];
            c.row  = rowOf(n);
            c.zone = ZONE[(c.A[0] || c.B[0]).pdu];
            (c.A.length && c.B.length ? dual : single).push(c);
        });

        /* matched = identical way number and phase on both sides */
        dual.forEach(function (c) {
            var sig = function (ways) {
                return ways.map(function (w) { return w.q + w.ph; }).sort().join(',');
            };
            c.matched = sig(c.A) === sig(c.B);

            /* Paired ways with different breakers. The smaller one is what
               limits redundancy: after a failure it carries everything. 58
               paired ways differ across zones 1-3 on the 10-09 drawings. */
            c.mismatch = [];
            c.A.forEach(function (a) {
                c.B.forEach(function (b) {
                    if (a.q === b.q && a.plate !== b.plate) {
                        c.mismatch.push({ q: a.q, plateA: a.plate, plateB: b.plate });
                    }
                });
            });
        });

        var order = function (a, b) {
            return a.zone - b.zone || a.row.localeCompare(b.row) ||
                   a.name.localeCompare(b.name, undefined, { numeric: true });
        };
        dual.sort(order); single.sort(order);
        return { cabinets: dual, singleFed: single };
    }

    /* ---------------------------------------------------------
       one cabinet, for one date's readings
       --------------------------------------------------------- */

    function num(v) {
        if (v === '' || v === null || v === undefined) return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    /* A way's channels: one per phase it carries, each with its own current. */
    function channels(ways, recorded) {
        var out = [], unread = [];
        ways.forEach(function (w) {
            var rec = recorded[w.key];
            phasesOf(w.ph).forEach(function (p) {
                var I = rec ? num(rec[p.toLowerCase()]) : null;
                if (I === null) { if (unread.indexOf(w) === -1) unread.push(w); }
                out.push({ way: w, phase: p, pair: w.q + '|' + p, plate: w.plate,
                           cont: w.plate === null ? null : w.plate * CONT, I: I });
            });
        });
        return { list: out, unread: unread };
    }

    function sum(list) { return list.reduce(function (s, c) { return s + (c.I || 0); }, 0); }

    /* The lost side's current moves onto the survivor. Returns every
       survivor channel with the current it would then carry. */
    function failover(lost, surv) {
        var byPair = {};
        surv.forEach(function (c) { byPair[c.pair] = c; });

        var after = surv.map(function (c) { return { ch: c, I: c.I }; });
        var idx = {};
        after.forEach(function (a, i) { idx[a.ch.pair] = i; });

        var orphan = 0;
        lost.forEach(function (c) {
            if (byPair[c.pair]) after[idx[c.pair]].I += c.I;   /* exact partner */
            else orphan += c.I;                                /* no partner    */
        });

        if (orphan > 0 && after.length) {
            /* spread over the survivors in proportion to what they carry;
               if they carry nothing, in proportion to their ratings */
            var base = sum(surv), byRating = base <= 0;
            var denom = byRating
                ? surv.reduce(function (s, c) { return s + (c.plate || 0); }, 0)
                : base;
            after.forEach(function (a) {
                var w = byRating ? (a.ch.plate || 0) : (a.ch.I || 0);
                a.I += denom > 0 ? orphan * w / denom : orphan / after.length;
            });
        }

        var worst = null;
        after.forEach(function (a) {
            a.pctCont  = a.ch.cont ? a.I / a.ch.cont * 100 : null;
            a.pctPlate = a.ch.plate ? a.I / a.ch.plate * 100 : null;
            a.overPlate = a.ch.plate !== null && a.I > a.ch.plate;
            if (a.pctCont !== null && (!worst || a.pctCont > worst.pctCont)) worst = a;
        });
        return { after: after, worst: worst, approximate: orphan > 0 };
    }

    function statusOf(f) {
        if (!f || !f.worst) return null;
        var w = f.worst;
        if (w.overPlate)        return 'overload';
        if (w.pctCont > 100)    return 'critical';
        if (w.pctCont > MARGIN) return 'high';
        return 'normal';
    }

    function worse(a, b) {
        if (!a) return b; if (!b) return a;
        return STATUS.indexOf(a) >= STATUS.indexOf(b) ? a : b;
    }

    /* Per breaker, as it stands now: its highest phase against its rating. */
    function breakers(ways, chans) {
        return ways.map(function (w) {
            var mine = chans.filter(function (c) { return c.way === w; });
            var read = mine.every(function (c) { return c.I !== null; });
            var peak = read ? Math.max.apply(null, mine.map(function (c) { return c.I; })) : null;
            var cont = w.plate === null ? null : w.plate * CONT;
            return {
                pdu: w.pdu, q: w.q, ph: w.ph, plate: w.plate, cont: cont, read: read,
                phases: mine.map(function (c) { return { p: c.phase, I: c.I }; }),
                peak: peak,
                pctPlate: read && w.plate ? peak / w.plate * 100 : null,
                available: read && cont !== null ? cont - peak : null
            };
        });
    }

    function analyse(cab, recorded) {
        var A = channels(cab.A, recorded), B = channels(cab.B, recorded);
        var unread = A.unread.concat(B.unread);
        var res = {
            cab: cab,
            breakersA: breakers(cab.A, A.list),
            breakersB: breakers(cab.B, B.list),
            unread: unread
        };

        var totalWays = cab.A.length + cab.B.length;
        if (unread.length === totalWays) { res.state = 'unread'; return res; }
        if (unread.length)                { res.state = 'incomplete'; return res; }

        var IA = sum(A.list), IB = sum(B.list), total = IA + IB;
        res.IA = IA; res.IB = IB; res.total = total;
        res.kVA = total * V_PHASE / 1000;
        res.shareA = total > 0 ? IA / total : null;

        res.loseA = failover(A.list, B.list);     /* PDU on Feed A fails */
        res.loseB = failover(B.list, A.list);     /* PDU on Feed B fails */
        res.approximate = res.loseA.approximate || res.loseB.approximate || !cab.matched;

        var sA = statusOf(res.loseA), sB = statusOf(res.loseB);
        res.state = worse(sA, sB);
        res.governing = STATUS.indexOf(sA) >= STATUS.indexOf(sB) ? res.loseA : res.loseB;
        res.governingLost = res.governing === res.loseA ? 'A' : 'B';

        /* Can the survivor carry it: within its continuous rating after
           the failure, on both failure cases. */
        res.survives = res.state === 'normal' || res.state === 'high';
        return res;
    }

    /* ---------------------------------------------------------
       a whole PDU lost: can its partner's incomer carry both?
       --------------------------------------------------------- */

    var PAIRS = [['PDU 1', 'PDU 6'], ['PDU 3', 'PDU 2'], ['PDU 5', 'PDU 4'], ['PDU 7', 'PDU 8']];

    function incomer(name) {
        for (var i = 0; i < DC_CONFIG.equipment.length; i++) {
            if (DC_CONFIG.equipment[i].name === name) return DC_CONFIG.equipment[i];
        }
        return null;
    }

    function phaseRead(recorded, name) {
        var r = recorded['Main|' + name + '|'];
        if (!r) return null;
        var v = { R: num(r.r), Y: num(r.y), B: num(r.b) };
        return (v.R === null || v.Y === null || v.B === null) ? null : v;
    }

    /* One direction: `lost` fails, `surv` carries both, phase by phase.
       All of the lost PDU's current is moved across. That overstates it a
       little - loads on a single feed, such as the building sockets on
       PDU 1, go dark rather than transfer - so the answer errs safe. */
    function pduLoss(recorded, lost, surv) {
        var a = phaseRead(recorded, lost), b = phaseRead(recorded, surv);
        var eq = incomer(surv);
        if (!a || !b || !eq) return { lost: lost, surv: surv, state: 'unread' };
        var plate = eq.rated, cont = plate * CONT;
        var after = { R: a.R + b.R, Y: a.Y + b.Y, B: a.B + b.B };
        var peakPh = ['R', 'Y', 'B'].reduce(function (m, p) { return after[p] > after[m] ? p : m; }, 'R');
        var peak = after[peakPh];
        var pctCont = peak / cont * 100;
        var state = peak > plate ? 'overload' : pctCont > 100 ? 'critical'
                  : pctCont > MARGIN ? 'high' : 'normal';
        return { lost: lost, surv: surv, before: b, after: after, peak: peak, peakPh: peakPh,
                 plate: plate, cont: cont, pctCont: pctCont, headroom: cont - peak, state: state };
    }

    function pduPairs(recorded) {
        return PAIRS.map(function (p, i) {
            var x = pduLoss(recorded, p[0], p[1]), y = pduLoss(recorded, p[1], p[0]);
            var both = [x, y].filter(function (d) { return d.state !== 'unread'; });
            var gov = both.length ? both.reduce(function (m, d) { return d.pctCont > m.pctCont ? d : m; }) : null;
            return { zone: i + 1, a: p[0], b: p[1], loseA: x, loseB: y, governing: gov,
                     state: gov ? gov.state : 'unread' };
        });
    }

    /* One breaker on its own, now: the same thresholds as the failover. */
    function levelOf(I, plate) {
        if (I === null || I === undefined || !plate) return null;
        var pct = I / (plate * CONT) * 100;
        return I > plate ? 'overload' : pct > 100 ? 'critical' : pct > MARGIN ? 'high' : 'normal';
    }

    return {
        build: build, analyse: analyse, pduPairs: pduPairs,
        statusOf: statusOf, levelOf: levelOf,
        STATUS: STATUS, MARGIN: MARGIN, CONT: CONT, V_PHASE: V_PHASE
    };
})();

if (typeof module !== 'undefined') module.exports = DC_CABINETS;
