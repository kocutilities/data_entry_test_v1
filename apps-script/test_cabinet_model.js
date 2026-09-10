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
for (const f of ['config.js', 'koc-criteria.js', 'cabinet-model.js']) {
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
        console.log('  whole PDU lost:');
        M.pduPairs(rec).forEach(p => p.governing && console.log('    zone %d  lose %s -> %s carries %s A (%s)  %s % of 128 A  %s',
            p.zone, p.governing.lost, p.governing.surv, r1(p.governing.peak), p.governing.peakPh,
            r1(p.governing.pctCont), p.state));
    }
    console.log('\n%d passed, %d failed\n', pass, fail);
    process.exit(fail ? 1 : 0);
})();
