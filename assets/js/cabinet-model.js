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

    /* ---------------------------------------------------------
       a whole EMSB lost: the other UPS chain carries the room

       Per EI-CC-S/S-001 (issue 06-09-26), each EMSB is nothing but its
       UPS's input board: a 1000 A TP ACB incomer splitting into an 800 A
       MAIN and an 800 A BYPASS ACB, both to the one UPS. So losing an EMSB
       takes away its UPS's input AND its bypass. The UPS rides through on
       its battery, then stops, and with it its ESMSB, its four PDUs and
       everything they feed. Battery autonomy is not on file, so this is
       worked for the end state: that whole feed gone, every dual-corded
       server on the other one.

       What each device on the surviving path then carries:

         transformer     its incomer now + the failed EMSB's current - the
         ATS             UPS input moves from one supply path to the other
         EMSB / UPS in   this EMSB now + the failed one: the surviving UPS
                         draws what both drew. 800 A main ACB governs; the
                         1000 A incomer and the feeder way above it carry
                         the same current and are larger.
         UPS output      the eight PDU incomers summed, phase by phase.
         ESMSB incomer   Neither is metered; the sum is the measured part.
         PDU incomers    own + partner, phase by phase - pduLoss above.
         cabinets        each cabinet's failover for that feed.

       Rating basis, one per kind of device, each cited:
         breaker      continuous 0.8 x plate, trips at the plate
                      KOC-E-003 Pt 1 cl. 11.2.2; KOC-E-009 cl. 6.3
         UPS          continuous = its kVA plate, as the Additional Load
                      Study takes it; 125 % for 10 min is the overload
                      capability, KOC-E-011 cl. 8.7
         transformer  2133 A plate is already the derated rating (cl.
                      11.2.6); no permissible overload, KOC-E-005 cl. 7.2
         generator    plate current continuous (MD + 15 %, E-003 cl.
                      13.3.2); 10 % overload for 1 h in 12, E-007 cl. 11.1.6
       Normal is <= 87 % of continuous on every kind - the 15 % margin.
       --------------------------------------------------------- */

    var V_LINE = 415;

    /* ACB-1 / ACB-2, the ATS-001 built into the LT board - sld-config.js */
    var ATS001_PLATE = 2000;

    var SIDE = {
        'EMSB 1': {
            feed: 'A', board: 'EMSB-1', ups: 'UPS-1', esmsb: 'ESMSB-1',
            pdus: ['PDU 1', 'PDU 3', 'PDU 5', 'PDU 7'],
            incomer: 'Incomer B', transformer: 'Transformer B', gen: 'GEN-1',
            feeder: 'LT board way 1D, 1000 A'
        },
        'EMSB 2': {
            feed: 'B', board: 'EMSB-2', ups: 'UPS-2', esmsb: 'ESMSB-2',
            pdus: ['PDU 6', 'PDU 2', 'PDU 4', 'PDU 8'],
            incomer: 'Incomer A', transformer: 'Transformer A', gen: 'GEN-2',
            feeder: 'ATS-002 way L1, 1000 A',
            /* ESMSB-2 way 5, 63 A TP MCCB, 4C x 25 mm2. Not metered, and on
               this feed only: lost with EMSB-2, carried by UPS-2 otherwise. */
            unmetered: { name: 'ULDB-1', way: 'ESMSB-2 way 5', plate: 63 }
        }
    };
    var OTHER = { 'EMSB 1': 'EMSB 2', 'EMSB 2': 'EMSB 1' };

    var UPS_INPUT_ACB = 800, UPS_INCOMER_ACB = 1000, ESMSB_MCCB = 630;

    function sys() { return (typeof DC_SYSTEM !== 'undefined') ? DC_SYSTEM : null; }

    function sumPh(list) {
        var out = { R: 0, Y: 0, B: 0 };
        for (var i = 0; i < list.length; i++) {
            if (!list[i]) return null;               /* one unread = no sum */
            out.R += list[i].R; out.Y += list[i].Y; out.B += list[i].B;
        }
        return out;
    }

    function peakOf(ph) {
        var p = ['R', 'Y', 'B'].reduce(function (m, k) { return ph[k] > ph[m] ? k : m; }, 'R');
        return { ph: p, I: ph[p] };
    }

    /* The status of one device, from its worst phase, on its own basis. */
    function judge(basis, peak, plate) {
        var cont = basis === 'breaker' ? plate * CONT : plate;
        /* rounded before it is compared, so a load exactly on a line (110 A
           on a 100 A generator) is not pushed over it by floating point */
        var pct = Math.round(peak / cont * 100 * 1e6) / 1e6;
        var state;
        if (basis === 'breaker')          state = peak > plate ? 'overload' : pct > 100 ? 'critical' : pct > MARGIN ? 'high' : 'normal';
        else if (basis === 'ups')         state = pct > 125 ? 'overload' : pct > 100 ? 'critical' : pct > MARGIN ? 'high' : 'normal';
        else if (basis === 'generator')   state = pct > 110 ? 'overload' : pct > 100 ? 'critical' : pct > MARGIN ? 'high' : 'normal';
        else /* transformer */            state = pct > 100 ? 'overload' : pct > MARGIN ? 'high' : 'normal';
        return { cont: cont, pct: pct, state: state };
    }

    /* One device on the surviving path. now + added = after, phase by phase. */
    function device(o) {
        var d = { id: o.id, name: o.name, sub: o.sub, basis: o.basis, plate: o.plate,
                  plateText: o.plateText, note: o.note || '', how: o.how || '' };
        if (!o.now || !o.added) { d.state = 'unread'; d.missing = o.missingText || 'not read'; return d; }
        d.now = o.now; d.added = o.added;
        d.after = { R: o.now.R + o.added.R, Y: o.now.Y + o.added.Y, B: o.now.B + o.added.B };
        var pk = peakOf(d.after), pn = peakOf(d.now);
        d.peak = pk.I; d.peakPh = pk.ph; d.nowPeak = pn.I;
        var j = judge(o.basis, d.peak, o.plate);
        d.cont = j.cont; d.pct = j.pct; d.state = j.state;
        d.nowPct = pn.I / j.cont * 100;
        d.headroom = j.cont - d.peak;
        if (o.basis === 'ups') d.kva = (d.after.R + d.after.Y + d.after.B) * V_PHASE / 1000;
        return d;
    }

    /* Cabinet status when one whole feed is lost - every cabinet at once. */
    function stateOnFeedLoss(res, feed) {
        if (res.state === 'unread' || res.state === 'incomplete') return res.state;
        return statusOf(feed === 'A' ? res.loseA : res.loseB);
    }

    function emsbLoss(recorded, results, which) {
        var s = SIDE[which], o = SIDE[OTHER[which]];
        var S = sys();
        var lostNow = phaseRead(recorded, which);        /* its current moves across */

        var chain = [];

        /* transformer the surviving path hangs off */
        var tr = S ? S.transformers.filter(function (t) { return t.incomer === 'Main|' + o.incomer + '|'; })[0] : null;
        chain.push(device({
            id: 'tr', name: o.transformer, sub: o.incomer + ' · ' + (tr ? tr.breaker : ''),
            basis: 'transformer', plate: tr ? tr.ratedA : 2133,
            plateText: (tr ? tr.ratedA : 2133) + ' A plate, already the derated rating',
            now: phaseRead(recorded, o.incomer), added: lostNow,
            how: 'Incomer reading + what ' + s.board + ' drew'
        }));

        /* the ATS on that path. ATS-002 is metered at LT way 9A; ATS-001 is
           not, so it is the sum of the six emergency-section feeders */
        if (o.feed === 'B') {
            var ats2 = incomer('ATS 002');
            chain.push(device({
                id: 'ats', name: 'ATS-002', sub: 'ASCO 7000 · LT way 9A',
                basis: 'breaker', plate: ats2 ? ats2.rated : 2000,
                plateText: (ats2 ? ats2.rated : 2000) + ' A',
                now: phaseRead(recorded, 'ATS 002'), added: lostNow,
                how: 'Measured at LT way 9A + what ' + s.board + ' drew'
            }));
        } else {
            var keys = S ? S.generators[0].backs.keys : [];
            var feeders = keys.map(function (k) { return phaseRead(recorded, k.split('|')[1]); });
            chain.push(device({
                id: 'ats', name: 'ATS-001', sub: 'emergency section · ACB-1 / ACB-2',
                basis: 'breaker', plate: ATS001_PLATE, plateText: ATS001_PLATE + ' A',
                now: keys.length ? sumPh(feeders) : null, added: lostNow,
                how: 'Not metered: the sum of its six feeders + what ' + s.board + ' drew',
                missingText: 'a feeder on the emergency section was not read'
            }));
        }

        /* the surviving EMSB, i.e. the surviving UPS's input */
        chain.push(device({
            id: 'emsb', name: o.board + ' → ' + o.ups + ' input', sub: o.feeder,
            basis: 'breaker', plate: UPS_INPUT_ACB,
            plateText: UPS_INPUT_ACB + ' A main ACB (' + UPS_INCOMER_ACB + ' A incomer)',
            now: phaseRead(recorded, OTHER[which]), added: lostNow,
            how: o.board + ' reading + ' + s.board + '’s: ' + o.ups + ' takes on what ' + s.ups + ' drew'
        }));

        /* UPS output and ESMSB incomer - the same current, two ratings */
        var ownPdus = sumPh(o.pdus.map(function (p) { return phaseRead(recorded, p); }));
        var lostPdus = sumPh(s.pdus.map(function (p) { return phaseRead(recorded, p); }));
        var um = o.unmetered;
        var S_UPS = S ? S.ups.filter(function (u) { return u.id === o.ups; })[0] : null;
        var kva = S_UPS ? S_UPS.kva : 500;
        var upsA = kva * 1000 / (Math.sqrt(3) * V_LINE);
        var ups = device({
            id: 'ups', name: o.ups, sub: upsA.toFixed(1) + ' A a phase at ' + V_LINE + ' V',
            basis: 'ups', plate: upsA, plateText: kva + ' kVA',
            now: ownPdus, added: lostPdus,
            how: 'Not metered: the eight PDU incomers summed',
            missingText: 'a PDU incomer was not read'
        });
        ups.kvaPlate = kva;
        chain.push(ups);
        chain.push(device({
            id: 'esmsb', name: o.esmsb + ' incomer', sub: 'TP MCCB, fed from ' + o.ups,
            basis: 'breaker', plate: ESMSB_MCCB, plateText: ESMSB_MCCB + ' A',
            now: ownPdus, added: lostPdus,
            how: 'Not metered: the eight PDU incomers summed',
            missingText: 'a PDU incomer was not read'
        }));
        /* a load on the surviving board that no reading covers: bound it by
           its own breaker, so the page can say what it would take to matter */
        if (um) {
            [ups, chain[chain.length - 1]].forEach(function (d) {
                if (d.state === 'unread') return;
                d.unmetered = um;
                var worst = judge(d.basis, d.peak + um.plate, d.plate);
                d.ifFull = { peak: d.peak + um.plate, pct: worst.pct, state: worst.state };
            });
        }

        /* the four surviving PDU incomers */
        var pdus = s.pdus.map(function (lost, i) {
            var d = pduLoss(recorded, lost, o.pdus[i]);
            var r = { id: 'pdu' + i, name: d.surv + ' incomer', sub: 'carries ' + lost + ' as well',
                      basis: 'breaker', plate: d.plate, lostPdu: lost, zone: ZONE[lost] };
            if (d.state === 'unread') { r.state = 'unread'; r.missing = 'incomer not read'; return r; }
            r.plateText = d.plate + ' A MCCB at the ESMSB';
            r.now = d.before; r.after = d.after;
            r.added = { R: d.after.R - d.before.R, Y: d.after.Y - d.before.Y, B: d.after.B - d.before.B };
            r.peak = d.peak; r.peakPh = d.peakPh; r.cont = d.cont; r.pct = d.pctCont;
            r.nowPeak = peakOf(d.before).I; r.nowPct = r.nowPeak / d.cont * 100;
            r.headroom = d.headroom; r.state = d.state;
            return r;
        });

        /* every cabinet, on the surviving feed */
        var cab = { normal: 0, high: 0, critical: 0, overload: 0, missing: 0, worst: [] };
        (results || []).forEach(function (r) {
            var st = stateOnFeedLoss(r, s.feed);
            if (st === 'unread' || st === 'incomplete' || !st) { cab.missing++; return; }
            cab[st]++;
            if (st !== 'normal') {
                var f = s.feed === 'A' ? r.loseA : r.loseB;
                cab.worst.push({ res: r, state: st, worst: f.worst });
            }
        });
        cab.worst.sort(function (a, b) {
            return STATUS.indexOf(b.state) - STATUS.indexOf(a.state) || b.worst.pctCont - a.worst.pctCont;
        });
        cab.state = cab.overload ? 'overload' : cab.critical ? 'critical' : cab.high ? 'high' : 'normal';

        /* second contingency: the utility is lost too, and the generator
           behind the surviving path carries it through its ATS */
        var gen = null;
        var G = S ? S.generators.filter(function (g) { return g.id === o.gen; })[0] : null;
        if (G) {
            var atsRow = chain[1];
            gen = device({
                id: 'gen', name: G.id + ' · ' + G.make, sub: 'if the utility supply is lost as well',
                basis: 'generator', plate: G.ratedA, plateText: G.ratedA + ' A · ' + G.kva + ' kVA',
                now: atsRow.now || null, added: lostNow,
                how: 'What ' + atsRow.name + ' carries after the transfer',
                missingText: atsRow.missing
            });
        }

        /* what goes dark, and what is relieved */
        var gone = [
            { name: s.board, what: 'fails', detail: 'Takes ' + s.ups + '’s input and its bypass with it — both 800 A ACBs are on this board.' },
            { name: s.ups, what: 'battery, then off',
              detail: 'Carries ' + (s.feed === 'A' ? 'Feed A' : 'Feed B') + ' on its battery (240 cells, 1000 Ah) until the battery is exhausted. Autonomy is not on file, so this analysis takes the end state.' },
            { name: s.esmsb + ' · ' + s.pdus.join(', '), what: 'de-energised',
              detail: 'Every server moves its whole load to its other supply, on ' + o.pdus.join(', ') + '.' }
        ];
        var singles = build().singleFed.filter(function (c) { return (s.feed === 'A' ? c.A : c.B).length; });
        if (singles.length) {
            gone.push({ name: singles.length + ' loads with no second feed', what: 'go dark',
                        detail: singles.map(function (c) { return c.name + ' (' + c.A.concat(c.B)[0].pdu + ')'; }).join(', '),
                        dark: true });
        }
        if (s.unmetered) {
            gone.push({ name: s.unmetered.name, what: 'goes dark',
                        detail: s.unmetered.way + ', ' + s.unmetered.plate + ' A — on this feed only.', dark: true });
        }
        var relief = null;
        var trNow = phaseRead(recorded, s.incomer);
        if (trNow && lostNow) {
            var rel = { R: trNow.R - lostNow.R, Y: trNow.Y - lostNow.Y, B: trNow.B - lostNow.B };
            relief = { name: s.transformer, incomer: s.incomer, now: peakOf(trNow).I, after: peakOf(rel).I };
        }

        /* the verdict: worst of the path and the cabinets. The generator is
           a second contingency and is reported, not folded in. */
        var rows = chain.concat(pdus);
        var unread = rows.filter(function (d) { return d.state === 'unread'; });
        var judged = rows.filter(function (d) { return d.state !== 'unread'; });
        var worstDev = judged.reduce(function (m, d) {
            return !m || STATUS.indexOf(d.state) > STATUS.indexOf(m.state) ||
                   (d.state === m.state && d.pct > m.pct) ? d : m;
        }, null);
        var state = [worstDev ? worstDev.state : 'normal', cab.state]
            .reduce(function (a, b) { return worse(a, b); });

        return {
            which: which, board: s.board, lostFeed: s.feed, survFeed: o.feed,
            lostUps: s.ups, survUps: o.ups, survBoard: o.board, survPdus: o.pdus, lostPdus: s.pdus,
            chain: chain, pdus: pdus, cabinets: cab, gen: gen, gone: gone, relief: relief,
            worstDevice: worstDev, unread: unread, state: state,
            complete: unread.length === 0 && cab.missing === 0
        };
    }

    /* One breaker on its own, now: the same thresholds as the failover. */
    function levelOf(I, plate) {
        if (I === null || I === undefined || !plate) return null;
        var pct = I / (plate * CONT) * 100;
        return I > plate ? 'overload' : pct > 100 ? 'critical' : pct > MARGIN ? 'high' : 'normal';
    }

    return {
        build: build, analyse: analyse, pduPairs: pduPairs,
        emsbLoss: emsbLoss, stateOnFeedLoss: stateOnFeedLoss,
        statusOf: statusOf, levelOf: levelOf, judge: judge,
        STATUS: STATUS, MARGIN: MARGIN, CONT: CONT, V_PHASE: V_PHASE
    };
})();

if (typeof module !== 'undefined') module.exports = DC_CABINETS;
