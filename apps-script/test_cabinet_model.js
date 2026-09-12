/* =============================================================
   test_cabinet_model.js

   Checks the cabinet failover model against cases with a known answer -
   one at each side of every status boundary - and against the real
   equipment list.

       node apps-script/test_cabinet_model.js
   ============================================================= */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const JS = path.resolve(__dirname, '..', 'assets', 'js');
const sandbox = {
    location: { search: '', pathname: '/', hash: '' },
    history: { replaceState() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    console
};
vm.createContext(sandbox);
for (const f of ['config.js', 'koc-criteria.js', 'system-model.js', 'cabinet-model.js']) {
    vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sandbox, { filename: f });
}
const M = vm.runInContext('DC_CABINETS', sandbox);
const CFG = vm.runInContext('DC_CONFIG', sandbox);

let pass = 0, fail = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log('  %s  %s%s', ok ? 'PASS' : 'FAIL', name,
        ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want));
    ok ? pass++ : fail++;
}
const section = t => console.log('\n' + t);
const r1 = n => Math.round(n * 10) / 10;

/* A made-up cabinet, so the arithmetic is checked on numbers we can do by hand. */
function cab(A, B, name) {
    const mk = (pdu, list) => list.map(([q, ph, plate]) =>
        ({ pdu, q, ph, plate, key: 'PDU|' + pdu + '|' + q }));
    const c = { name: name || 'Test', A: mk('PDU 1', A), B: mk('PDU 6', B), row: 'T', zone: 1 };
    const sig = w => w.map(x => x.q + x.ph).sort().join(',');
    c.matched = sig(c.A) === sig(c.B);
    return c;
}
const rd = (pdu, q, v) => ({ ['PDU|' + pdu + '|' + q]: v });

/* ======================================================== the equipment list */
section('Cabinets built from config');
{
    const { cabinets, singleFed } = M.build();
    check('118 dual-fed cabinets', cabinets.length, 118);
    check('8 single-fed loads kept apart', singleFed.length, 8);
    check('no single-fed load is a cabinet', singleFed.filter(s => /cabin|^L-|^M-/i.test(s.name)).map(s => s.name), []);
    check('115 pair exactly', cabinets.filter(c => c.matched).length, 115);
    check('the three that do not', cabinets.filter(c => !c.matched).map(c => c.name).sort(),
          ['Cabin A-14', 'Cabin G-01', 'Cabin G-02']);
    /* the pairing key is way|phase; that only works if each side sits on one PDU */
    check('each side of every cabinet is on a single PDU',
          cabinets.filter(c => new Set(c.A.map(w => w.pdu)).size > 1 || new Set(c.B.map(w => w.pdu)).size > 1)
                  .map(c => c.name), []);
    check('every A side is on an odd PDU, every B side on an even one',
          cabinets.filter(c => c.A.some(w => +w.pdu.slice(4) % 2 === 0) || c.B.some(w => +w.pdu.slice(4) % 2 === 1))
                  .map(c => c.name), []);
    check('58 paired ways carry different breakers on each side',
          cabinets.reduce((s, c) => s + c.mismatch.length, 0), 58);
    check('G-10 is one: 16 A on PDU 5, 25 A on PDU 4',
          cabinets.find(c => c.name === 'Cabin G-10').mismatch, [{ q: 'Q24', plateA: 16, plateB: 25 }]);
    check('Cabin A-02 is PDU 1 Q2 and PDU 6 Q2, the example given',
          (() => { const c = cabinets.find(x => x.name === 'Cabin A-02');
                   return c ? [c.A.map(w => w.pdu + ' ' + w.q), c.B.map(w => w.pdu + ' ' + w.q)] : null; })(),
          [['PDU 1 Q2'], ['PDU 6 Q2']]);
}

/* ======================================================== every status boundary */
section('Status boundaries - 25 A breaker, continuous 20 A, margin 17.4 A');
{
    const c = cab([['Q7', 'R', 25]], [['Q7', 'R', 25]]);
    const at = (a, b) => M.analyse(c, Object.assign(rd('PDU 1', 'Q7', { r: a }), rd('PDU 6', 'Q7', { r: b })));

    let x = at(5, 5);
    check('5 + 5 A: survivor carries 10 A', x.governing.worst.I, 10);
    check('  ... 50 % of continuous -> Normal', [r1(x.governing.worst.pctCont), x.state], [50, 'normal']);

    x = at(8.6, 8.7);                                  /* 17.3 A = 86.5 % */
    check('17.3 A -> Normal (just inside the 87 % margin)', x.state, 'normal');
    x = at(8.8, 8.8);                                  /* 17.6 A = 88 %   */
    check('17.6 A -> High Load (past the margin)', x.state, 'high');
    x = at(10, 10);                                    /* 20 A = 100 %    */
    check('20.0 A -> High Load (exactly continuous)', x.state, 'high');
    x = at(10.1, 10);                                  /* 20.1 A          */
    check('20.1 A -> Critical (above continuous)', x.state, 'critical');
    x = at(12.5, 12.5);                                /* 25 A = plate    */
    check('25.0 A -> Critical (at the plate, not over)', x.state, 'critical');
    x = at(12.6, 12.5);                                /* 25.1 A          */
    check('25.1 A -> Overload (over the plate - it trips)', x.state, 'overload');

    x = at(5, 5);
    check('survives: Normal and High Load do', [at(5, 5).survives, at(9, 9).survives], [true, true]);
    check('survives: Critical and Overload do not', [at(11, 11).survives, at(13, 13).survives], [false, false]);
}

section('Present loading, per breaker');
{
    const c = cab([['Q7', 'R', 25]], [['Q7', 'R', 25]]);
    const x = M.analyse(c, Object.assign(rd('PDU 1', 'Q7', { r: 6 }), rd('PDU 6', 'Q7', { r: 4 })));
    check('A breaker at 6 A is 24 % of its 25 A plate', r1(x.breakersA[0].pctPlate), 24);
    check('  ... 14 A available to its 20 A continuous rating', x.breakersA[0].available, 14);
    check('split 60 / 40', r1(x.shareA * 100), 60);
    check('load in kVA at 239.6 V a phase', r1(x.kVA), r1(10 * 415 / Math.sqrt(3) / 1000));
    check('lose A: B carries 10 A', x.loseA.worst.I, 10);
    check('lose B: A carries 10 A', x.loseB.worst.I, 10);
}

section('Three-phase cabinet');
{
    const c = cab([['Q1', '3', 20]], [['Q1', '3', 20]]);
    const x = M.analyse(c, Object.assign(
        rd('PDU 1', 'Q1', { r: 5, y: 6, b: 4 }), rd('PDU 6', 'Q1', { r: 5, y: 7, b: 4 })));
    check('each phase paired with its own partner', x.loseA.after.map(a => [a.ch.phase, a.I]),
          [['R', 10], ['Y', 13], ['B', 8]]);
    check('worst phase governs: Y at 13 A of 16 A continuous = 81 %', r1(x.governing.worst.pctCont), 81.3);
    check('  ... Normal', x.state, 'normal');
}

section('Several ways a side, each paired with its own');
{
    const c = cab([['Q8', 'Y', 25], ['Q9', 'B', 25]], [['Q8', 'Y', 25], ['Q9', 'B', 25]]);
    const x = M.analyse(c, Object.assign(
        rd('PDU 1', 'Q8', { y: 3 }), rd('PDU 1', 'Q9', { b: 9 }),
        rd('PDU 6', 'Q8', { y: 3 }), rd('PDU 6', 'Q9', { b: 9 })));
    /* summing the sides would say 24 A over 40 A continuous = 60 %;
       really Q9 carries 18 A of its own 20 A = 90 % */
    check('pairing, not pooling: the busy way governs at 90 %', r1(x.governing.worst.pctCont), 90);
    check('  ... High Load, where pooling would have said Normal', x.state, 'high');
}

/* ======================================================== the three odd ones */
section('Unmatched cabinets - A-14 has one A way and two B ways');
{
    const { cabinets } = M.build();
    const a14 = cabinets.find(c => c.name === 'Cabin A-14');
    const x = M.analyse(a14, Object.assign(
        rd('PDU 1', 'Q27', { b: 6 }),
        rd('PDU 6', 'Q26', { y: 2 }), rd('PDU 6', 'Q27', { b: 4 })));
    check('marked approximate', x.approximate, true);
    /* lose B: A-Q27 takes its partner B-Q27 exactly (4 A) plus B-Q26, which
       has no A partner (2 A), since Q27 is A-14's only A way: 6+4+2 = 12 A */
    check('lose B: the one A way takes everything', r1(x.loseB.after[0].I), 12);
    /* lose A: A-Q27 pairs exactly with B-Q27 -> 4+6 = 10 A; B-Q26 keeps 2 A */
    check('lose A: exact partner takes it, no orphan', x.loseA.after.map(a => [a.ch.way.q, r1(a.I)]),
          [['Q26', 2], ['Q27', 10]]);
    check('total current conserved in both cases',
          [r1(x.loseA.after.reduce((s, a) => s + a.I, 0)), r1(x.loseB.after.reduce((s, a) => s + a.I, 0))],
          [12, 12]);
}

/* ======================================================== no reading is not a pass */
section('Unread ways are never counted as zero');
{
    const c = cab([['Q7', 'R', 25]], [['Q7', 'R', 25]]);
    let x = M.analyse(c, {});
    check('nothing read -> unread, no status', [x.state, x.total], ['unread', undefined]);
    x = M.analyse(c, rd('PDU 6', 'Q7', { r: 3 }));
    check('one side read -> incomplete, no status', x.state, 'incomplete');
    check('  ... names the way not read', x.unread.map(w => w.pdu + ' ' + w.q), ['PDU 1 Q7']);
    check('  ... and does not claim it survives', x.survives, undefined);

    const t = cab([['Q1', '3', 20]], [['Q1', '3', 20]]);
    x = M.analyse(t, Object.assign(rd('PDU 1', 'Q1', { r: 5, y: '', b: 4 }), rd('PDU 6', 'Q1', { r: 5, y: 5, b: 4 })));
    check('a three-phase way with a blank phase -> incomplete', x.state, 'incomplete');

    x = M.analyse(c, Object.assign(rd('PDU 1', 'Q7', { r: 0 }), rd('PDU 6', 'Q7', { r: 0 })));
    check('0 A that was read IS a reading -> Normal', x.state, 'normal');
}

/* ======================================================== a whole PDU */
section('A whole PDU lost - its partner incomer carries both, 160 A plate / 128 A continuous');
{
    const inc = (n, r, y, b) => ({ ['Main|' + n + '|']: { r, y, b } });
    let p = M.pduPairs(Object.assign(inc('PDU 1', 50, 60, 40), inc('PDU 6', 50, 60, 40)));
    check('zone 1: 60 + 60 = 120 A on Y', [p[0].governing.peak, p[0].governing.peakPh], [120, 'Y']);
    check('  ... 93.8 % of 128 A -> High Load', [r1(p[0].governing.pctCont), p[0].state], [93.8, 'high']);
    p = M.pduPairs(Object.assign(inc('PDU 1', 70, 60, 40), inc('PDU 6', 70, 60, 40)));
    check('140 A -> Critical (over 128, under 160)', p[0].state, 'critical');
    p = M.pduPairs(Object.assign(inc('PDU 1', 81, 60, 40), inc('PDU 6', 80, 60, 40)));
    check('161 A -> Overload (the incomer trips)', p[0].state, 'overload');
    check('no incomer reading -> unread', M.pduPairs({})[0].state, 'unread');
    check('uses each PDU\'s configured rating', CFG.equipment.find(e => e.name === 'PDU 6').rated, 160);
}

/* ======================================================== a whole EMSB */
section('Rating basis per device - each boundary, both sides');
{
    const J = (basis, I, plate) => M.judge(basis, I, plate).state;
    /* breaker, 100 A plate: continuous 80 A, margin 69.6 A */
    check('breaker 69.6 A -> Normal', J('breaker', 69.6, 100), 'normal');
    check('breaker 69.7 A -> High Load', J('breaker', 69.7, 100), 'high');
    check('breaker 80.1 A -> Critical', J('breaker', 80.1, 100), 'critical');
    check('breaker 100 A -> Critical (at the plate, not over)', J('breaker', 100, 100), 'critical');
    check('breaker 100.1 A -> Overload', J('breaker', 100.1, 100), 'overload');
    /* UPS: the plate is continuous; 125 % for 10 min, KOC-E-011 cl. 8.7 */
    check('UPS 87 % -> Normal', J('ups', 87, 100), 'normal');
    check('UPS 100 % -> High Load', J('ups', 100, 100), 'high');
    check('UPS 125 % -> Critical', J('ups', 125, 100), 'critical');
    check('UPS 125.1 % -> Overload', J('ups', 125.1, 100), 'overload');
    /* transformer: no permissible overload, KOC-E-005 cl. 7.2 */
    check('transformer 100 % -> High Load', J('transformer', 2133, 2133), 'high');
    check('transformer 100.1 % -> Overload, never Critical', J('transformer', 2135.2, 2133), 'overload');
    /* generator: 10 % for 1 h, KOC-E-007 cl. 11.1.6 */
    check('generator 110 % -> Critical', J('generator', 110, 100), 'critical');
    check('generator 110.1 % -> Overload', J('generator', 110.1, 100), 'overload');
}

section('A whole EMSB lost - the other UPS chain carries the room');
{
    const inc = (n, r, y, b) => ({ ['Main|' + n + '|']: { r, y, b } });
    const base = Object.assign({},
        inc('Incomer A', 1000, 1000, 1000), inc('Incomer B', 500, 500, 500),
        inc('ATS 002', 470, 480, 470), inc('EMSB 1', 180, 185, 185), inc('EMSB 2', 190, 190, 190),
        inc('EMSB 4', 40, 40, 40), inc('EDB 27', 2, 2, 2), inc('Battery Charger & Fuel Pump', 0, 0, 0),
        inc('EMSB 9', 180, 180, 180), inc('EMSB 3', 40, 40, 40),
        inc('PDU 1', 50, 60, 40), inc('PDU 3', 50, 50, 50), inc('PDU 5', 30, 30, 30), inc('PDU 7', 45, 45, 45),
        inc('PDU 6', 50, 60, 40), inc('PDU 2', 60, 40, 50), inc('PDU 4', 25, 25, 25), inc('PDU 8', 50, 40, 50));
    const e = M.emsbLoss(base, [], 'EMSB 1');
    const row = id => e.chain.find(d => d.id === id);
    check('EMSB-1 lost -> Feed B carries, via UPS-2', [e.lostFeed, e.survFeed, e.survUps], ['A', 'B', 'UPS-2']);
    check('path, source to rack', e.chain.map(d => d.name),
          ['Transformer A', 'ATS-002', 'EMSB-2 \u2192 UPS-2 input', 'UPS-2', 'ESMSB-2 incomer']);
    check('transformer A takes on what EMSB-1 drew: 1000 + 185', row('tr').peak, 1185);
    check('ATS-002: 480 + 185 on Y', [row('ats').peak, row('ats').peakPh], [665, 'Y']);
    check('EMSB-2 carries both UPS inputs: 190 + 185', row('emsb').peak, 375);
    check('  ... judged on the 800 A main ACB, 640 A continuous', row('emsb').cont, 640);
    /* R: 50+50+30+45 + 50+60+25+50 = 360; Y: 60+50+30+45 + 60+40+25+40 = 350 */
    check('UPS output = all eight PDU incomers, phase by phase', [row('ups').after.R, row('ups').after.Y], [360, 350]);
    check('  ... against 500 kVA = 695.6 A a phase', r1(row('ups').plate), 695.6);
    check('ESMSB-2: 360 A of 504 A continuous', [row('esmsb').peak, row('esmsb').cont], [360, 504]);
    check('ULDB-1 is bounded, not ignored: +63 A', row('esmsb').ifFull.peak, 423);
    check('PDU 6 carries PDU 1 as well: 60 + 60 on Y', [e.pdus[0].name, e.pdus[0].peak], ['PDU 6 incomer', 120]);
    check('the Feed A single-feed loads go dark with it', e.gone.some(g => g.dark && /8 loads/.test(g.name)), true);
    check('transformer B is relieved: busiest phase R, 500 - 180', e.relief.after, 320);
    check('generator is reported, not in the verdict', [e.gen.name.slice(0, 5), e.state], ['GEN-2', 'high']);

    const e2 = M.emsbLoss(base, [], 'EMSB 2');
    check('EMSB-2 lost -> via ATS-001, the sum of its six feeders + 190',
          [e2.chain[1].name, e2.chain[1].after.R], ['ATS-001', 180 + 40 + 2 + 0 + 180 + 40 + 190]);
    check('  ... and ULDB-1 goes dark, not transferred', e2.gone.some(g => g.name === 'ULDB-1'), true);
    check('  ... and no ULDB-1 bound on ESMSB-1', e2.chain.find(d => d.id === 'esmsb').ifFull, undefined);

    const gap = Object.assign({}, base); delete gap['Main|PDU 3|'];
    const e3 = M.emsbLoss(gap, [], 'EMSB 1');
    check('a PDU incomer unread -> UPS and ESMSB not assessed, not 0 A',
          [e3.chain.find(d => d.id === 'ups').state, e3.chain.find(d => d.id === 'esmsb').state], ['unread', 'unread']);
    check('  ... and the case is marked incomplete', e3.complete, false);

    /* cabinets move with the feed: the Feed A lost case uses loseA for every one */
    const c = cab([['Q7', 'R', 16]], [['Q7', 'R', 25]]);
    const x = M.analyse(c, Object.assign(rd('PDU 1', 'Q7', { r: 7 }), rd('PDU 6', 'Q7', { r: 10 })));
    check('cabinet: Feed B lost -> the 16 A carries 17 A and trips', M.stateOnFeedLoss(x, 'B'), 'overload');
    check('cabinet: Feed A lost -> the 25 A carries it at 85 %', M.stateOnFeedLoss(x, 'A'), 'normal');
    check('unread cabinet stays unread in either case', M.stateOnFeedLoss(M.analyse(c, {}), 'A'), 'unread');
}

/* ======================================================== the diagram agrees */
section('The single line diagram counts the same cabinets');
{
    vm.runInContext(fs.readFileSync(path.join(JS, 'sld-config.js'), 'utf8'), sandbox, { filename: 'sld-config.js' });
    const S = vm.runInContext('SLD', sandbox);
    const { cabinets } = M.build();
    const byZone = {};
    cabinets.forEach(c => { (byZone[c.zone] = byZone[c.zone] || []).push(c); });
    const zones = S.nodes.filter(n => n.kind === 'zone');
    check('four zones on the diagram', zones.length, 4);
    zones.forEach((z, i) => {
        const mine = byZone[i + 1];
        const rows = [...new Set(mine.map(c => c.row))].sort().join(' / ');
        check('zone ' + (i + 1) + ': the diagram label is the count the model gives',
              z.sub2, mine.length + ' Live Cabinets · ' + rows);
    });
    check('the four zones account for every dual-fed cabinet',
          zones.reduce((s, z) => s + parseInt(z.sub2, 10), 0), cabinets.length);
    check('single-fed loads are not counted as cabinets anywhere',
          M.build().singleFed.every(c => /socket|corridor|RMS|LAN/i.test(c.name)), true);
}

/* ======================================================== the real readings */
section('Against the sheet, 2026-08-16');
(async () => {
    const url = Buffer.from(CFG.endpointEncoded, 'base64').toString('utf8').split('').reverse().join('');
    let rec;
    try {
        rec = (await (await fetch(url, { method: 'POST',
            body: JSON.stringify({ type: 'status', date: '2026-08-16' }) })).json()).recorded;
    } catch (e) { console.log('  (sheet not reachable - skipped: ' + e.message + ')'); }

    if (rec) {
        const { cabinets } = M.build();
        const all = cabinets.map(c => M.analyse(c, rec));
        const tally = {};
        all.forEach(a => { tally[a.state] = (tally[a.state] || 0) + 1; });
        console.log('  status tally:', JSON.stringify(tally));
        check('every cabinet gets exactly one state', all.every(a => a.state), true);
        check('the unread are A-01 and H-04, missed on both feeds',
              all.filter(a => a.state === 'unread').map(a => a.cab.name).sort(), ['Cabin A-01', 'Cabin H-04']);
        check('the incomplete is D-03, missed on one feed',
              all.filter(a => a.state === 'incomplete').map(a => a.cab.name), ['Cabin D-03']);

        /* single-phase readings must be in their own phase column, or the
           model would read the way as blank */
        const wrongCol = [];
        Object.keys(CFG.pduCircuits).forEach(pdu => CFG.pduCircuits[pdu].forEach(c => {
            const v = rec['PDU|' + pdu + '|' + c.c];
            if (!v || c.ph === '3') return;
            const own = v[c.ph.toLowerCase()];
            if (own === '' || own === null || own === undefined) wrongCol.push(pdu + ' ' + c.c);
        }));
        check('every single-phase reading is in its own phase column', wrongCol, []);

        const top = all.filter(a => a.governing).sort((x, y) => y.governing.worst.pctCont - x.governing.worst.pctCont).slice(0, 6);
        console.log('  highest after a PDU loss:');
        top.forEach(a => console.log('    %s  %s  %s A on %s %s  %s % of %s A continuous',
            a.state.padEnd(9), a.cab.name.padEnd(12), r1(a.governing.worst.I),
            a.governing.worst.ch.way.pdu, a.governing.worst.ch.way.q, r1(a.governing.worst.pctCont),
            a.governing.worst.ch.cont));
        const e1 = M.emsbLoss(rec, all, 'EMSB 1'), e2 = M.emsbLoss(rec, all, 'EMSB 2');
        check('EMSB-1 lost: L-17 above rating -> Critical', e1.state, 'critical');
        check('  ... UPS-2 at 55.1 %, ESMSB-2 at 76.1 %',
              [r1(e1.chain[3].pct), r1(e1.chain[4].pct)], [55.1, 76.1]);
        check('  ... PDU 6 incomer 127.6 A, High Load', [r1(e1.pdus[0].peak), e1.pdus[0].state], [127.6, 'high']);
        check('  ... cabinets 109 / 5 / 1 / 0, 3 not read',
              [e1.cabinets.normal, e1.cabinets.high, e1.cabinets.critical, e1.cabinets.overload, e1.cabinets.missing],
              [109, 5, 1, 0, 3]);
        check('EMSB-2 lost: G-10 trips -> Overload', [e2.state, e2.cabinets.worst[0].res.cab.name], ['overload', 'Cabin G-10']);
        check('  ... transformer B 690 A, 32.3 %', [e2.chain[0].peak, r1(e2.chain[0].pct)], [690, 32.3]);
        [e1, e2].forEach(e => {
            console.log('  %s fails:', e.board);
            e.chain.concat(e.pdus).forEach(d => console.log('    %s  %s  %s -> %s A  %s %',
                d.state.padEnd(9), d.name.padEnd(24), r1(d.nowPeak), r1(d.peak), r1(d.pct)));
        });
        console.log('  whole PDU lost:');
        M.pduPairs(rec).forEach(p => p.governing && console.log('    zone %d  lose %s -> %s carries %s A (%s)  %s % of 128 A  %s',
            p.zone, p.governing.lost, p.governing.surv, r1(p.governing.peak), p.governing.peakPh,
            r1(p.governing.pctCont), p.state));
    }
    console.log('\n%d passed, %d failed\n', pass, fail);
    process.exit(fail ? 1 : 0);
})();
