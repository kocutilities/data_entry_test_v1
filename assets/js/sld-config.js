/* =============================================================
   KOC Data Center - Single Line Diagram
   sld-config.js  -  topology and layout.

   Geometry follows the block diagram held in the vault at
   98-Attachments\KOC Data Center - Transformer to Server Rack.svg, so the
   two stay in step. Coordinates here are BOX CENTRES on a 2480 x 1290
   canvas; the SVG stores left/top corners, so they differ by w/2, h/2.

   The thing this diagram exists to show is which loads survive an incomer
   failure. Two supplies do that and they are separate:

     ATS-001  built into the LT switchboard, ACB-1 / ACB-2 2000 A
              interlocked, changed over automatically by GENERATOR 1.
              It backs the EMERGENCY section - EMSB-1, EMSB-4, EDB-27,
              B.C & F.P, EMSB-9, EMSB-3.

     ATS-002  a separate ASCO 7000 panel in the ATS Room, 2000 A, fed from
              Section A way 9A and by GENERATOR 2. It backs EDB-28, the
              generator control panel, EMSB-2 and EMCC-1.

   Everything else on the board - MSB-10, MSB-8, M.C.C-2, MSB-7, DB-2 - is
   utility only and is lost when its incomer is lost.

   'key' ties a node to the sheet using the same category|equipment|circuit
   key the reading page uses, so a node with a key can carry a measured
   current. Ratings come from config.js so the two pages cannot drift.

   Layout notes worth keeping:

   - Both generators sit at the top corners and their feeds are taken round
     the OUTSIDE of the switchboard. Dropping them straight down would cross
     the section busbars, which is exactly what they must not touch: GEN 1
     reaches the emergency section only through ATS-001.

   - The zones are stacked in the middle corridor and each PDU cord is an
     explicit orthogonal run. The left PDU row therefore reads 7-5-3-1, so
     the Zone 1 feeder is nearest the stack; with 1-3-5-7 the cords cross
     six times. On both sides the Zone 1 feeder is innermost and the Zone 4
     feeder outermost, which is why the two halves mirror.

   PDU incomer MCCBs: each PDU feed has a breaker at each end. The ESMSB
   end is 160 A on all eight; the PDU end is 160 A on PDU 1 to 6 and 200 A
   on PDU 7 and 8. The 200 A 4P MCCB noted on the PDU-7/8 drawing is the
   PDU-end device. The 160 A at the ESMSB end governs every feed, since a
   circuit is limited by its most restrictive protective device.
   ============================================================= */

const SLD = (function () {

    var nodes = [], edges = [];
    function node(o) { nodes.push(o); return o; }
    function edge(from, to, o) {
        edges.push(Object.assign({ from: from, to: to, side: 'utility' }, o || {}));
    }

    var XB = 850, XA = 1870;          /* the two incomer columns */

    /* ---------------- utility supply ---------------- */

    node({ id: 'hts', kind: 'hts', x: 1360, y: 117, w: 600, h: 42,
           label: 'M.E.W. AHMADI-M → COMPUTER CENTRE HT S/S', sub: '11 kV' });

    node({ id: 'trB', kind: 'transformer', x: XB, y: 212, w: 304, h: 68,
           label: 'TRANSFORMER B', sub: '1600 kVA · 11 kV / 433 V · Dy11 · Z 5.74 %',
           note: 'FLC 2133 A. ONAN, 1981. Nameplate serial 1.538710 - a ' +
                 '2000 kVA unit derated to 1600 kVA at Kuwait ambient.' });
    node({ id: 'trA', kind: 'transformer', x: XA, y: 212, w: 304, h: 68,
           label: 'TRANSFORMER A', sub: '1600 kVA · 11 kV / 433 V · Dy11 · Z 5.74 %',
           note: 'FLC 2133 A. ONAN, 1981.' });

    node({ id: 'acb3', kind: 'breaker', x: XB, y: 292, w: 210, h: 36,
           label: 'ACB-3 · 3200 A', sub: 'normally closed · B.C 65 kA',
           key: 'Main|Incomer B|' });
    node({ id: 'acb4', kind: 'breaker', x: XA, y: 292, w: 210, h: 36,
           label: 'ACB-4 · 3200 A', sub: 'normally closed · B.C 65 kA',
           key: 'Main|Incomer A|' });

    /* the 11 kV feeds drop from under the HT S/S and go into the inner side
       of each transformer, rather than looping over their tops */
    edge('hts', 'trB', { pts: [[1160, 138], [1160, 212], [1002, 212]] });
    edge('hts', 'trA', { pts: [[1560, 138], [1560, 212], [1718, 212]] });
    edge('trB', 'acb3'); edge('trA', 'acb4');

    /* ---------------- the LT board ---------------- */

    node({ id: 'busB', kind: 'busbar', x: 740, y: 406, w: 820, h: 24,
           label: 'SECTION B BUSBAR',
           note: 'ATS & Maintained Board. System 415 / 240 V, 3 Ph 4 W, ' +
                 '50 Hz. Busbar 3000 A, 80 kA for 1 s.' });
    node({ id: 'busA', kind: 'busbar', x: 1820, y: 406, w: 900, h: 24,
           label: 'SECTION A BUSBAR' });

    node({ id: 'coupler', kind: 'coupler', x: 1260, y: 407, w: 204, h: 58,
           label: 'BUS COUPLER · 3200 A', sub: 'normally open · interlocked',
           note: '4P manual switch disconnector. The interlock permits any ' +
                 'two of ACB-3, ACB-4 and the coupler, so the transformers ' +
                 'can never be paralleled and the LV fault level stays near ' +
                 '37 kA against an 80 kA busbar.' });

    edge('acb3', 'busB'); edge('acb4', 'busA');
    edge('busB', 'coupler', { side: 'open' });
    edge('coupler', 'busA', { side: 'open' });

    /* ---------------- ATS-001 and the emergency section ---------------- */

    node({ id: 'gen1', kind: 'generator', x: 400, y: 200, w: 220, h: 108,
           label: 'GENERATOR 1', sub: 'Munartech DD1000',
           sub2: '1000 kVA', sub3: '1391 A · 415 V',
           note: 's/n M0471-7, 800 kW, 1500 rpm. Connects through a 2000 A ' +
                 'ACB-2 emergency breaker.' });

    node({ id: 'ats1', kind: 'ats', x: 650, y: 467, w: 610, h: 42,
           label: 'ATS-001 · BUILT INTO THE SWITCHBOARD',
           sub: 'ACB-1 / ACB-2 · 2000 A · interlocked · auto changeover',
           note: 'Not a separate cubicle - it is part of the LT switchboard.' });

    node({ id: 'ebar', kind: 'embar', x: 750, y: 523, w: 810, h: 24,
           label: 'EMERGENCY (GENERATOR-BACKED) SECTION' });

    edge('busB', 'ats1', { side: 'utility' });
    /* round the left of the switchboard - a straight drop would cut the
       Section B busbar, which the generator must never touch */
    edge('gen1', 'ats1', { side: 'emerg',
          pts: [[400, 254], [400, 296], [262, 296], [262, 467], [345, 467]] });
    edge('ats1', 'ebar', { side: 'emerg' });

    /* ---------------- feeders ---------------- */

    var EM = [['EMSB-1', '1D · 1000 A', 'EMSB 1'], ['EMSB-4', '1C · 400 A', 'EMSB 4'],
              ['EDB-27', '1B · 125 A', 'EDB 27'], ['B.C & F.P', '1A · 125 A', 'Battery Charger & Fuel Pump'],
              ['EMSB-9', '2D · 800 A', 'EMSB 9'], ['EMSB-3', '2B · 400 A', 'EMSB 3']];
    EM.forEach(function (f, i) {
        node({ id: 'em' + i, kind: 'board', x: 408 + i * 136, y: 663, w: 128, h: 46,
               label: f[0], sub: f[1], key: 'Main|' + f[2] + '|', side: 'emerg' });
        edge('ebar', 'em' + i, { side: 'emerg' });
    });

    node({ id: 'msb10', kind: 'board', x: 1250, y: 663, w: 128, h: 46,
           label: 'MSB-10', sub: '6D · 630 A', key: 'Main|MSB 10|',
           note: 'E Building. Utility only - lost if Section B is lost.' });
    edge('busB', 'msb10', { pts: [[1080, 418], [1080, 452], [1250, 452], [1250, 640]] });

    var UT = [['MSB-8', '8B · 400 A', 'MSB 8', 'D Bldg'], ['M.C.C-2', '8D · 800 A', 'MCC 2', ''],
              ['MSB-7', '8E · 250 A', 'MSB 7', 'C Bldg'], ['DB-2', '8F · 125 A', 'DB 2', 'Gen room'],
              ['ATS-002', '9A · 2000 A', 'ATS 002', '']];
    UT.forEach(function (f, i) {
        node({ id: 'ut' + i, kind: 'board', x: 1458 + i * 181, y: 663, w: 168, h: 46,
               label: f[0], sub: f[1], key: 'Main|' + f[2] + '|',
               note: f[3] ? f[3] + '. Utility only unless backed downstream.' : '' });
        edge('busA', 'ut' + i);
    });

    /* ---------------- ATS-002 ---------------- */

    node({ id: 'gen2', kind: 'generator', x: 2200, y: 200, w: 220, h: 108,
           label: 'GENERATOR 2', sub: 'Caterpillar 3512',
           sub2: '1360 kVA · 400 kW load bank', sub3: '1640 A · 440 V',
           note: 's/n YAY 01204, 1088 kW, 1500 rpm, plus a 400 kW load bank. ' +
                 '1640 A on the plate corresponds to 1360 kVA at 480 V rather ' +
                 'than at the 440 V also printed on it.' });

    node({ id: 'ats2', kind: 'ats', x: 1900, y: 758, w: 660, h: 44,
           label: 'ATS-002 · AUTOMATIC TRANSFER SWITCH',
           sub: 'ASCO Series 7000 · 2000 A · separate panel in ATS Room' });

    node({ id: 'a2bar', kind: 'embar', x: 1900, y: 813, w: 660, h: 24,
           label: 'ATS-002 PANEL BUSBAR · 2000 A, 3P & N' });

    edge('ut4', 'ats2');
    edge('gen2', 'ats2', { side: 'emerg',
          pts: [[2200, 254], [2200, 296], [2372, 296], [2372, 758], [2234, 758]] });
    edge('ats2', 'a2bar', { side: 'emerg' });

    var A2 = [['ATS ROOM EDB-28', 'L6 · 40 A', 'EDB 28'],
              ['GEN. CTRL PANEL', 'L5 · 125 A', 'Generator Control Panel'],
              ['EMSB-2', 'L1 · 1000 A', 'EMSB 2'],
              ['EMCC-1', 'L2 · 800 A', 'EMCC 1']];
    A2.forEach(function (f, i) {
        node({ id: 'a2_' + i, kind: 'board', x: 1645 + i * 155, y: 858, w: 146, h: 44,
               label: f[0], sub: f[1], key: 'Main|' + f[2] + '|', small: true });
        edge('a2bar', 'a2_' + i, { side: 'emerg' });
    });

    /* ---------- EMSB-9 sub-distribution, and the racks with no UPS ---------- */

    node({ id: 'edb24', kind: 'board', x: 952, y: 740, w: 256, h: 46,
           label: 'EDB-24', sub: 'EMSB-9 way 6 · 63 A',
           note: 'EMSB-9 also feeds EDB-25 (way 7, 63 A) and EDB-26 ' +
                 '(way 4, 65 A, corridor).' });
    edge('em4', 'edb24', { side: 'emerg' });

    node({ id: 'k0102', kind: 'norack', x: 952, y: 860, w: 236, h: 82,
           label: 'RACK-K01 / K02', sub: '3-phase, from EDB-24 · 31 kW',
           note: 'Single supply and no UPS. These two racks are the exception ' +
                 'to the dual-corded arrangement everything else uses.' });
    edge('edb24', 'k0102', { side: 'emerg' });

    /* ---------------- UPS chains ---------------- */

    node({ id: 'ups1', kind: 'ups', x: 800, y: 949, w: 304, h: 50,
           label: '500 kVA UPS-1', sub: '1000 A ACB in · 2 × 800 A ACB main/bypass' });
    node({ id: 'bat1', kind: 'battery', x: 1029, y: 949, w: 126, h: 44,
           label: 'BATTERY BANK', sub: '240 Nos · 1000 Ah' });
    node({ id: 'esmsb1', kind: 'board', x: 800, y: 1032, w: 600, h: 40,
           label: 'ESMSB-1 · 630 A TP MCCB incomer' });

    edge('em0', 'ups1', { side: 'emerg' });
    edge('ups1', 'bat1', { side: 'a' });
    edge('ups1', 'esmsb1', { side: 'a' });

    node({ id: 'ups2', kind: 'ups', x: 1955, y: 949, w: 304, h: 50,
           label: '500 kVA UPS-2', sub: '1000 A ACB in · 2 × 800 A ACB main/bypass' });
    node({ id: 'bat2', kind: 'battery', x: 2184, y: 949, w: 126, h: 44,
           label: 'BATTERY BANK', sub: '240 Nos · 1000 Ah' });
    node({ id: 'esmsb2', kind: 'board', x: 1955, y: 1032, w: 600, h: 40,
           label: 'ESMSB-2 · 630 A TP MCCB incomer' });

    edge('a2_2', 'ups2', { side: 'b' });
    edge('ups2', 'bat2', { side: 'b' });
    edge('ups2', 'esmsb2', { side: 'b' });

    /* ---------------- PDUs ----------------
       Left row runs 7-5-3-1 so the Zone 1 feeder is nearest the zone stack;
       the cords then nest instead of crossing. Right row 6-2-4-8 already
       had that order. */

    var PA = ['PDU 7', 'PDU 5', 'PDU 3', 'PDU 1'];
    var PB = ['PDU 6', 'PDU 2', 'PDU 4', 'PDU 8'];

    PA.forEach(function (p, i) {
        var x = 575 + i * 150;
        node({ id: 'pa' + i, kind: 'pdu', x: x, y: 1116, w: 132, h: 48,
               label: p.replace(' ', '-'), sub: 'Feed A', key: 'Main|' + p + '|', side: 'a' });
        edge('esmsb1', 'pa' + i, { side: 'a', pts: [[x, 1052], [x, 1092]] });
    });
    PB.forEach(function (p, i) {
        var x = 1730 + i * 150;
        node({ id: 'pb' + i, kind: 'pdu', x: x, y: 1116, w: 132, h: 48,
               label: p.replace(' ', '-'), sub: 'Feed B', key: 'Main|' + p + '|', side: 'b' });
        edge('esmsb2', 'pb' + i, { side: 'b', pts: [[x, 1052], [x, 1092]] });
    });

    /* ---------------- zones ----------------
       Stacked in the middle corridor, fed horizontally from both sides. Each
       cord drops to its own channel below the PDU row, runs in to its own
       riser, and comes up to the zone: Zone 1 takes the topmost channel and
       the riser closest to the stack, Zone 4 the lowest and outermost. Every
       run is 90 degrees and none of the eight crosses another. */

    var ZL = 1248, ZR = 1452, PBOT = 1140;
    var ZONES = [
        ['ZONE 1', 'PDU-1 + PDU-6', '27 racks · A / B / K', 750, 'pa3', 'pb0', 1164, 1164, 1536],
        ['ZONE 2', 'PDU-3 + PDU-2', '39 racks · B / C / D / E', 860, 'pa2', 'pb1', 1188, 1188, 1512],
        ['ZONE 3', 'PDU-5 + PDU-4', '14 racks · F / G', 970, 'pa1', 'pb2', 1212, 1212, 1488],
        ['ZONE 4', 'PDU-7 + PDU-8', '33 racks · M / L', 1080, 'pa0', 'pb3', 1236, 1236, 1464]
    ];
    ZONES.forEach(function (z, i) {
        var y = z[3], chan = z[6], vxL = z[7], vxR = z[8];
        node({ id: 'z' + i, kind: 'zone', x: 1350, y: y, w: 204, h: 82,
               label: z[0], sub: z[1], sub2: z[2],
               note: 'Every rack takes one cord from ' + z[1].split(' + ')[0] +
                     ' and one from ' + z[1].split(' + ')[1] + ', on the two ' +
                     'different UPS systems, so losing either side leaves the ' +
                     'servers running.' });

        var a = nodes.filter(function (n) { return n.id === z[4]; })[0];
        var b = nodes.filter(function (n) { return n.id === z[5]; })[0];
        edge(z[4], 'z' + i, { side: 'a',
              pts: [[a.x, PBOT], [a.x, chan], [vxL, chan], [vxL, y], [ZL, y]] });
        edge(z[5], 'z' + i, { side: 'b',
              pts: [[b.x, PBOT], [b.x, chan], [vxR, chan], [vxR, y], [ZR, y]] });
    });

    return { canvas: { w: 2480, h: 1290 }, nodes: nodes, edges: edges };
})();
