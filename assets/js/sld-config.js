/* =============================================================
   KOC Data Center - Single Line Diagram
   sld-config.js  -  topology and layout.

   Transcribed from the KOC Computer Center transformer-to-server-rack
   block diagram, which is drawn from single line diagram EI-CC-S/S-001
   updated 05-09-26, the server room layout updated 05-09-26, and the LT
   panel drawing (ATS & Maintained Board).

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
   ============================================================= */

const SLD = (function () {

    var nodes = [], edges = [];
    function node(o) { nodes.push(o); return o; }
    function edge(from, to, o) {
        edges.push(Object.assign({ from: from, to: to, side: 'utility' }, o || {}));
    }

    var XB = 700, XA = 1850;          /* the two incomer columns */

    /* ---------------- utility supply ---------------- */

    node({ id: 'hts', kind: 'hts', x: 1275, y: 40, w: 700, h: 50,
           label: 'M.E.W. AHMADI-M → COMPUTER CENTRE HT S/S', sub: '11 kV' });

    node({ id: 'trB', kind: 'transformer', x: XB, y: 132, w: 300, h: 66,
           label: 'TRANSFORMER B', sub: '1600 kVA · 11 kV / 433 V · Dy11 · Z 5.74 %',
           note: 'FLC 2133 A. ONAN, 1981. Nameplate serial 1.538710 - a ' +
                 '2000 kVA unit derated to 1600 kVA at Kuwait ambient.' });
    node({ id: 'trA', kind: 'transformer', x: XA, y: 132, w: 300, h: 66,
           label: 'TRANSFORMER A', sub: '1600 kVA · 11 kV / 433 V · Dy11 · Z 5.74 %',
           note: 'FLC 2133 A. ONAN, 1981.' });

    node({ id: 'acb3', kind: 'breaker', x: XB, y: 216, w: 210, h: 44,
           label: 'ACB-3 · 3200 A', sub: 'normally closed · B.C 65 kA',
           key: 'Main|Incomer B|' });
    node({ id: 'acb4', kind: 'breaker', x: XA, y: 216, w: 210, h: 44,
           label: 'ACB-4 · 3200 A', sub: 'normally closed · B.C 65 kA',
           key: 'Main|Incomer A|' });

    edge('hts', 'trB'); edge('hts', 'trA');
    edge('trB', 'acb3'); edge('trA', 'acb4');

    /* ---------------- the LT board ---------------- */

    node({ id: 'busB', kind: 'busbar', x: 700, y: 288, w: 900, h: 22,
           label: 'SECTION B BUSBAR',
           note: 'ATS & Maintained Board. System 415 / 240 V, 3 Ph 4 W, ' +
                 '50 Hz. Busbar 3000 A, 80 kA for 1 s.' });
    node({ id: 'busA', kind: 'busbar', x: 1850, y: 288, w: 900, h: 22,
           label: 'SECTION A BUSBAR' });

    node({ id: 'coupler', kind: 'coupler', x: 1275, y: 288, w: 226, h: 52,
           label: 'BUS COUPLER · 3200 A', sub: 'normally open · interlocked',
           note: '4P manual switch disconnector. The interlock permits any ' +
                 'two of ACB-3, ACB-4 and the coupler, so the transformers ' +
                 'can never be paralleled and the LV fault level stays near ' +
                 '37 kA against an 80 kA busbar.' });

    edge('acb3', 'busB'); edge('acb4', 'busA');
    edge('busB', 'coupler', { side: 'open' });
    edge('coupler', 'busA', { side: 'open' });

    /* ---------------- ATS-001 and the emergency section ---------------- */

    node({ id: 'gen1', kind: 'generator', x: 140, y: 348, w: 210, h: 78,
           label: 'GENERATOR 1', sub: 'Munartech DD1000 · 1000 kVA · 1391 A · 415 V',
           note: 's/n M0471-7, 800 kW, 1500 rpm. Connects through a 2000 A ' +
                 'ACB-2 emergency breaker.' });

    node({ id: 'ats1', kind: 'ats', x: 660, y: 348, w: 600, h: 52,
           label: 'ATS-001 · BUILT INTO THE SWITCHBOARD',
           sub: 'ACB-1 / ACB-2 · 2000 A · interlocked · auto changeover',
           note: 'Not a separate cubicle - it is part of the LT switchboard.' });

    node({ id: 'ebar', kind: 'embar', x: 660, y: 408, w: 760, h: 20,
           label: 'EMERGENCY (GENERATOR-BACKED) SECTION' });

    edge('busB', 'ats1', { side: 'utility' });
    edge('gen1', 'ats1', { side: 'emerg' });
    edge('ats1', 'ebar', { side: 'emerg' });

    /* ---------------- feeders ---------------- */

    var EM = [['EMSB-1', '1D · 1000 A', 'EMSB 1'], ['EMSB-4', '1C · 400 A', 'EMSB 4'],
              ['EDB-27', '1B · 125 A', 'EDB 27'], ['B.C & F.P', '1A · 125 A', 'Battery Charger & Fuel Pump'],
              ['EMSB-9', '2D · 800 A', 'EMSB 9'], ['EMSB-3', '2B · 400 A', 'EMSB 3']];
    EM.forEach(function (f, i) {
        node({ id: 'em' + i, kind: 'board', x: 330 + i * 132, y: 484, w: 118, h: 46,
               label: f[0], sub: f[1], key: 'Main|' + f[2] + '|', side: 'emerg' });
        edge('ebar', 'em' + i, { side: 'emerg' });
    });

    node({ id: 'msb10', kind: 'board', x: 1125, y: 484, w: 112, h: 46,
           label: 'MSB-10', sub: '6D · 630 A', key: 'Main|MSB 10|',
           note: 'E Building. Utility only - lost if Section B is lost.' });
    edge('busB', 'msb10');

    var UT = [['MSB-8', '8B · 400 A', 'MSB 8', 'D Bldg'], ['M.C.C-2', '8D · 800 A', 'MCC 2', ''],
              ['MSB-7', '8E · 400 A', 'MSB 7', 'C Bldg'], ['DB-2', '8F · 125 A', 'DB 2', 'Gen room'],
              ['ATS-002', '9A · 2000 A', 'ATS 002', '']];
    UT.forEach(function (f, i) {
        node({ id: 'ut' + i, kind: 'board', x: 1470 + i * 190, y: 484, w: 130, h: 46,
               label: f[0], sub: f[1], key: 'Main|' + f[2] + '|',
               note: f[3] ? f[3] + '. Utility only unless backed downstream.' : '' });
        edge('busA', 'ut' + i);
    });

    /* ---------------- ATS-002 ---------------- */

    node({ id: 'gen2', kind: 'generator', x: 2380, y: 576, w: 200, h: 78,
           label: 'GENERATOR 2', sub: 'Caterpillar 3512 · 1360 kVA · 1640 A · 440 V',
           note: 's/n YAY 01204, 1088 kW, 1500 rpm, plus a 400 kW load bank. ' +
                 '1640 A on the plate corresponds to 1360 kVA at 480 V rather ' +
                 'than at the 440 V also printed on it.' });

    node({ id: 'ats2', kind: 'ats', x: 1960, y: 576, w: 620, h: 52,
           label: 'ATS-002 · AUTOMATIC TRANSFER SWITCH',
           sub: 'ASCO Series 7000 · 2000 A · separate panel in ATS Room' });

    node({ id: 'a2bar', kind: 'embar', x: 1960, y: 636, w: 600, h: 20,
           label: 'ATS-002 PANEL BUSBAR · 2000 A, 3P & N' });

    edge('ut4', 'ats2');
    edge('gen2', 'ats2', { side: 'emerg' });
    edge('ats2', 'a2bar', { side: 'emerg' });

    var A2 = [['ATS ROOM EDB-28', 'L6 · 40 A', 'EDB 28'],
              ['GEN. CTRL PANEL', 'L5 · 125 A', 'Generator Control Panel'],
              ['EMSB-2', 'L1 · 1000 A', 'EMSB 2'],
              ['EMCC-1', 'L2 · 800 A', 'EMCC 1']];
    A2.forEach(function (f, i) {
        node({ id: 'a2_' + i, kind: 'board', x: 1735 + i * 150, y: 706, w: 138, h: 46,
               label: f[0], sub: f[1], key: 'Main|' + f[2] + '|', small: true });
        edge('a2bar', 'a2_' + i, { side: 'emerg' });
    });

    /* ---------- EMSB-9 sub-distribution, and the racks with no UPS ---------- */

    node({ id: 'edb24', kind: 'board', x: 140, y: 570, w: 210, h: 52,
           label: 'EDB-24', sub: 'EMSB-9 way 6 · 63 A',
           note: 'EMSB-9 also feeds EDB-25 (way 7, 63 A) and EDB-26 ' +
                 '(way 4, 65 A, corridor).' });
    edge('em4', 'edb24', { side: 'emerg' });

    node({ id: 'k0102', kind: 'norack', x: 140, y: 1070, w: 220, h: 76,
           label: 'RACK-K01 / K02', sub: '3-phase, from EDB-24 · 31 kW',
           note: 'Single supply and no UPS. These two racks are the exception ' +
                 'to the dual-corded arrangement everything else uses.' });
    edge('edb24', 'k0102', { side: 'none' });

    /* ---------------- UPS chains ---------------- */

    node({ id: 'ups1', kind: 'ups', x: 660, y: 790, w: 320, h: 56,
           label: '500 kVA UPS-1', sub: '1000 A ACB in · 2 × 800 A ACB main/bypass' });
    node({ id: 'bat1', kind: 'battery', x: 940, y: 790, w: 160, h: 48,
           label: 'BATTERY BANK', sub: '240 Nos · 1000 Ah' });
    node({ id: 'esmsb1', kind: 'board', x: 660, y: 870, w: 440, h: 44,
           label: 'ESMSB-1 · 630 A TP MCCB incomer' });

    edge('em0', 'ups1', { side: 'a' });
    edge('ups1', 'bat1', { side: 'a' });
    edge('ups1', 'esmsb1', { side: 'a' });

    node({ id: 'ups2', kind: 'ups', x: 2035, y: 790, w: 320, h: 56,
           label: '500 kVA UPS-2', sub: '1000 A ACB in · 2 × 800 A ACB main/bypass' });
    node({ id: 'bat2', kind: 'battery', x: 2315, y: 790, w: 160, h: 48,
           label: 'BATTERY BANK', sub: '240 Nos · 1000 Ah' });
    node({ id: 'esmsb2', kind: 'board', x: 2035, y: 870, w: 440, h: 44,
           label: 'ESMSB-2 · 630 A TP MCCB incomer' });

    edge('a2_2', 'ups2', { side: 'b' });
    edge('ups2', 'bat2', { side: 'b' });
    edge('ups2', 'esmsb2', { side: 'b' });

    /* ---------------- PDUs ---------------- */

    var PA = ['PDU 1', 'PDU 3', 'PDU 5', 'PDU 7'];
    var PB = ['PDU 6', 'PDU 2', 'PDU 4', 'PDU 8'];

    PA.forEach(function (p, i) {
        node({ id: 'pa' + i, kind: 'pdu', x: 495 + i * 124, y: 946, w: 114, h: 46,
               label: p.replace(' ', '-'), sub: 'Feed A', key: 'Main|' + p + '|', side: 'a' });
        edge('esmsb1', 'pa' + i, { side: 'a' });
    });
    PB.forEach(function (p, i) {
        node({ id: 'pb' + i, kind: 'pdu', x: 1870 + i * 124, y: 946, w: 114, h: 46,
               label: p.replace(' ', '-'), sub: 'Feed B', key: 'Main|' + p + '|', side: 'b' });
        edge('esmsb2', 'pb' + i, { side: 'b' });
    });

    /* ---------------- zones ---------------- */

    var ZONES = [
        ['ZONE 1', 'PDU-1 + PDU-6', '27 racks · A / B / K', '236 kW', 'pa0', 'pb0'],
        ['ZONE 2', 'PDU-3 + PDU-2', '39 racks · B / C / D / E', '254 kW', 'pa1', 'pb1'],
        ['ZONE 3', 'PDU-5 + PDU-4', '14 racks · F / G', '133 kW', 'pa2', 'pb2'],
        ['ZONE 4', 'PDU-7 + PDU-8', '33 racks · M / L', 'not scheduled', 'pa3', 'pb3']
    ];
    ZONES.forEach(function (z, i) {
        node({ id: 'z' + i, kind: 'zone', x: 1090 + i * 240, y: 1064, w: 214, h: 88,
               label: z[0], sub: z[1], sub2: z[2], sub3: z[3],
               note: 'Every rack takes one cord from ' + z[1].split(' + ')[0] +
                     ' and one from ' + z[1].split(' + ')[1] + ', on the two ' +
                     'different UPS systems, so losing either side leaves the ' +
                     'servers running.' });
        edge(z[4], 'z' + i, { side: 'a', curve: true });
        edge(z[5], 'z' + i, { side: 'b', curve: true });
    });

    return { canvas: { w: 2520, h: 1140 }, nodes: nodes, edges: edges };
})();
