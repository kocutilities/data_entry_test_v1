/* =============================================================
   KOC Data Center - Single Line Diagram
   sld-config.js  -  the topology and where every part sits.

   Ratings and feed points are the same ones config.js carries, so the
   diagram and the reading page cannot drift apart.

   'key' ties a node to the sheet, using the same category|equipment|circuit
   key the reading page uses. A node with a key can show a measured current;
   one without is drawn from the drawings alone.

   Sources
     transformer nameplate      ELIN, serial 1.538710, 1600 kVA, 84 A HV /
                                2133 A LV, which puts the HV side at 11 kV
     generator nameplates       Munartech DD1000 s/n M0471-7, 1000 kVA 415 V
                                1391 A; Caterpillar 3512 s/n YAY 01204,
                                1360 kVA 440 V 1640 A
     LT board                   Computer Centre LT panel drawing - board
                                title ATS & MAINTAINED BOARD, 3000 A busbar,
                                415 V system
     feeder ways and order      Computer Centre single line diagram, 06-09-26
     PDU feeds                  PDU single line diagrams - PDU 7 fed from
                                ESMSB-1, PDU 8 from ESMSB-2
   ============================================================= */

const SLD = (function () {

    var W = 1620;

    var nodes = [];
    var edges = [];

    function node(o) { nodes.push(o); return o; }
    function edge(from, to, o) {
        edges.push(Object.assign({ from: from, to: to, side: 'main' }, o || {}));
    }

    /* ---------- incoming, transformers, main breakers ---------- */

    var XA = 430, XB = 1130;          /* the two incomer columns */

    node({ id: 'hvA', kind: 'source', x: XA, y: 46, w: 150, h: 40,
           label: '11 kV', sub: 'Incomer A' });
    node({ id: 'hvB', kind: 'source', x: XB, y: 46, w: 150, h: 40,
           label: '11 kV', sub: 'Incomer B' });

    node({ id: 'trA', kind: 'transformer', x: XA, y: 150, w: 170, h: 62,
           label: 'TR-A', sub: '1600 kVA · 2133 A',
           note: 'ELIN 1.538710. 2000 kVA nameplate derated to 1600 kVA at ' +
                 'Kuwait ambient, per KOC-E-003 cl. 11.2.2.' });
    node({ id: 'trB', kind: 'transformer', x: XB, y: 150, w: 170, h: 62,
           label: 'TR-B', sub: '1600 kVA · 2133 A' });

    node({ id: 'acb4', kind: 'breaker', x: XA, y: 250, w: 128, h: 40,
           label: 'ACB-4', key: 'Main|Incomer A|',
           note: 'Transformer A incomer. Readings recorded against Incomer A.' });
    node({ id: 'acb3', kind: 'breaker', x: XB, y: 250, w: 128, h: 40,
           label: 'ACB-3', key: 'Main|Incomer B|',
           note: 'Transformer B incomer. Readings recorded against Incomer B.' });

    edge('hvA', 'trA'); edge('hvB', 'trB');
    edge('trA', 'acb4'); edge('trB', 'acb3');

    /* ---------- generators into ATS-001 ---------- */

    node({ id: 'gen1', kind: 'generator', x: 110, y: 330, w: 176, h: 62,
           label: 'GEN-1', sub: '1000 kVA · 1391 A',
           note: 'Munartech DD1000, s/n M0471-7, 800 kW, 415 V, 1500 rpm.' });
    node({ id: 'gen2', kind: 'generator', x: 1450, y: 330, w: 176, h: 62,
           label: 'GEN-2', sub: '1360 kVA · 1640 A',
           note: 'Caterpillar 3512, s/n YAY 01204, 1088 kW, 440 V, 1500 rpm. ' +
                 '1640 A is the nameplate figure, which corresponds to ' +
                 '1360 kVA at 480 V rather than at 440 V.' });

    node({ id: 'ats1', kind: 'ats', x: 880, y: 330, w: 200, h: 44,
           label: 'ATS-001', sub: 'built into the LT board',
           note: 'Not a separate cubicle - it is part of the LT switchboard.' });

    edge('gen1', 'ats1', { side: 'gen' });
    edge('gen2', 'ats1', { side: 'gen' });

    /* ---------- the LT board ---------- */

    node({ id: 'bus', kind: 'busbar', x: 780, y: 412, w: 1300, h: 30,
           label: 'ATS & MAINTAINED BOARD',
           sub: '415 V · 3000 A busbar',
           note: 'Two sections joined by a bus coupler with no automatic ' +
                 'function - isolation and coupling are both manual.' });

    node({ id: 'coupler', kind: 'coupler', x: 780, y: 412, w: 34, h: 26,
           label: 'BC', sub: 'bus coupler, manual' });

    edge('acb4', 'bus'); edge('acb3', 'bus'); edge('ats1', 'bus');

    /* ---------- feeders, in single line diagram order ---------- */

    var FEEDERS = [
        ['EMSB 1',  '1D'], ['EMSB 4',  '1C'], ['EDB 27',  '1B'],
        ['B.C & F.P', '1A'], ['EMSB 9', '2D'], ['EMSB 3',  '2B'],
        ['MSB 10',  '6D'], ['MSB 8',   '8B'], ['MCC 2',   '8D'],
        ['MSB 7',   '8E'], ['DB 2',    '8F'], ['ATS 002', '9A']
    ];
    var NAMEKEY = { 'B.C & F.P': 'Battery Charger & Fuel Pump' };

    var fx0 = 150, fx1 = 1410, fy = 530;
    FEEDERS.forEach(function (f, i) {
        var name = f[0];
        var full = NAMEKEY[name] || name;
        node({ id: 'f' + i, kind: 'board', label: name, sub: 'way ' + f[1],
               x: fx0 + (fx1 - fx0) * i / (FEEDERS.length - 1), y: fy,
               w: 104, h: 44, key: 'Main|' + full + '|' });
        edge('bus', 'f' + i);
    });

    /* ---------- A side: EMSB 1 -> UPS 1 -> ESMSB-1 -> PDUs ---------- */

    node({ id: 'ups1', kind: 'ups', x: 330, y: 656, w: 168, h: 50,
           label: 'UPS-1', sub: '500 kVA' });
    node({ id: 'esmsb1', kind: 'board', x: 330, y: 750, w: 168, h: 46,
           label: 'ESMSB-1', sub: 'A side' });
    edge('f0', 'ups1', { side: 'a' });
    edge('ups1', 'esmsb1', { side: 'a' });

    /* ---------- B side: ATS 002 -> EMSB 2 -> UPS 2 -> ESMSB-2 ---------- */

    node({ id: 'emsb2', kind: 'board', x: 1230, y: 656, w: 168, h: 46,
           label: 'EMSB 2', sub: 'ATS-002 way L1', key: 'Main|EMSB 2|' });
    node({ id: 'ups2', kind: 'ups', x: 1230, y: 742, w: 168, h: 50,
           label: 'UPS-2', sub: '500 kVA' });
    node({ id: 'esmsb2', kind: 'board', x: 1230, y: 836, w: 168, h: 46,
           label: 'ESMSB-2', sub: 'B side' });
    edge('f11', 'emsb2', { side: 'b' });
    edge('emsb2', 'ups2', { side: 'b' });
    edge('ups2', 'esmsb2', { side: 'b' });

    /* the rest of what ATS-002 feeds */
    var ATS2 = [['EMCC 1', 'L2', 'Main|EMCC 1|'],
                ['Gen Control Panel', 'L5', 'Main|Generator Control Panel|'],
                ['EDB 28', 'L6', 'Main|EDB 28|']];
    ATS2.forEach(function (a, i) {
        node({ id: 'a2_' + i, kind: 'board', label: a[0], sub: 'way ' + a[1],
               x: 1500, y: 656 + i * 66, w: 150, h: 40, key: a[2], small: true });
        edge('f11', 'a2_' + i, { side: 'b', spine: 1410 });
    });

    /* ---------- PDUs ---------- */

    var PDUA = ['PDU 1', 'PDU 3', 'PDU 5', 'PDU 7'];
    var PDUB = ['PDU 6', 'PDU 2', 'PDU 4', 'PDU 8'];
    var py = 960;

    PDUA.forEach(function (p, i) {
        node({ id: 'pa' + i, kind: 'pdu', label: p, sub: 'Feed A',
               x: 180 + i * 132, y: py, w: 116, h: 46, key: 'Main|' + p + '|' });
        edge('esmsb1', 'pa' + i, { side: 'a' });
    });
    PDUB.forEach(function (p, i) {
        node({ id: 'pb' + i, kind: 'pdu', label: p, sub: 'Feed B',
               x: 1000 + i * 132, y: py, w: 116, h: 46, key: 'Main|' + p + '|' });
        edge('esmsb2', 'pb' + i, { side: 'b' });
    });

    /* ---------- the cabins ---------- */

    node({ id: 'cabins', kind: 'cabins', x: 780, y: 1120, w: 1180, h: 76,
           label: 'Server cabins',
           sub: '144 cabinets, each dual corded — one A-side cord, one B-side',
           note: 'Every cabin takes one supply from an A-side PDU and one ' +
                 'from a B-side PDU, so either side can be lost without ' +
                 'dropping the load.' });

    PDUA.forEach(function (p, i) { edge('pa' + i, 'cabins', { side: 'a' }); });
    PDUB.forEach(function (p, i) { edge('pb' + i, 'cabins', { side: 'b' }); });

    return { canvas: { w: W, h: 1240 }, nodes: nodes, edges: edges };
})();
