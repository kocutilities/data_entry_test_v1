/* =============================================================
   KOC Data Center - system model for assessment
   system-model.js

   What the assessment needs to know about this installation that the
   reading page does not: which transformers feed what, which generator
   backs which loads, and how the sections are arranged. Ratings come from
   nameplates and the single line diagram, cited per item.

   Kept separate from config.js because config.js is the reading sheet's
   equipment list, while this is the electrical structure the KOC rules are
   applied to.
   ============================================================= */

const DC_SYSTEM = {

    site: 'KOC Data Center',
    systemVoltage: 415,          /* LT board, 3 ph 4 W - LT panel drawing */
    arrangement: 'double radial',

    /* ---------------------------------------------------------
       transformers
       --------------------------------------------------------- */

    transformers: [
        { id: 'TR-A', kva: 1600, ratedA: 2133, incomer: 'Main|Incomer A|', breaker: 'ACB-4' },
        { id: 'TR-B', kva: 1600, ratedA: 2133, incomer: 'Main|Incomer B|', breaker: 'ACB-3' }
    ],

    /* The 1600 kVA / 2133 A on the plate is ALREADY the KOC-derated figure:
       2000 kVA x 0.8 = 1600 kVA, which is exactly KOC-E-003 cl. 11.2.2, and
       cl. 11.2.6 requires the nameplate to show the derated continuous
       rating. So the 0.8 factor must NOT be applied to it a second time. */
    transformerRatingIsDerated: true,
    transformerSource: 'ELIN nameplate, serial 1.538710 - 84 A HV / 2133 A LV',

    /* the coupler is normally open and interlocked, so a section cannot be
       carried by the other transformer while both incomers are closed.
       That is what makes the contingency case the binding one. */
    couplerNormallyOpen: true,

    /* ---------------------------------------------------------
       generators
       --------------------------------------------------------- */

    generators: [
        {
            id: 'GEN-1', make: 'Munartech DD1000', kva: 1000, kw: 800,
            ratedA: 1391, volts: 415, serial: 'M0471-7',
            role: 'emergency',
            /* ATS-001 backs the emergency section. There is no meter on the
               ATS-001 output, so the backed load is the sum of the section's
               feeders - a proxy, and noted as one on screen. */
            backs: {
                method: 'sum-of-feeders',
                keys: ['Main|EMSB 1|', 'Main|EMSB 4|', 'Main|EDB 27|',
                       'Main|Battery Charger & Fuel Pump|', 'Main|EMSB 9|', 'Main|EMSB 3|'],
                label: 'emergency (generator-backed) section, via ATS-001'
            }
        },
        {
            id: 'GEN-2', make: 'Caterpillar 3512', kva: 1360, kw: 1088,
            ratedA: 1640, volts: 440, serial: 'YAY 01204',
            role: 'emergency',
            /* ATS-002 is metered on LT way 9A, so this one is measured
               directly rather than inferred. */
            backs: {
                method: 'measured',
                keys: ['Main|ATS 002|'],
                label: 'ATS-002 panel, measured at LT way 9A'
            },
            note: 'The 1640 A plate figure corresponds to 1360 kVA at 480 V, not at ' +
                  'the 440 V also printed on the plate. Assessed against 1640 A as the ' +
                  'stated continuous current.'
        }
    ],

    /* ---------------------------------------------------------
       where a new load would actually land

       Adding load at a PDU does not only load that PDU. It raises every
       element upstream of it, and the additional-load study has to test
       each one. Only metered points can be tested; the unmetered links are
       named so the page can say what it could not check.

       Note the naming trap: the PDUs labelled "Feed A" (1,3,5,7) trace back
       to INCOMER B, because the emergency section hangs off Section B. The
       "Feed B" PDUs trace to Incomer A via ATS-002 on Section A way 9A.
       --------------------------------------------------------- */

    /* measured points that carry a load connected at this point, nearest first */
    upstream: {
        'PDU 1': ['Main|PDU 1|', 'Main|EMSB 1|', 'Main|Incomer B|'],
        'PDU 3': ['Main|PDU 3|', 'Main|EMSB 1|', 'Main|Incomer B|'],
        'PDU 5': ['Main|PDU 5|', 'Main|EMSB 1|', 'Main|Incomer B|'],
        'PDU 7': ['Main|PDU 7|', 'Main|EMSB 1|', 'Main|Incomer B|'],
        'PDU 6': ['Main|PDU 6|', 'Main|EMSB 2|', 'Main|ATS 002|', 'Main|Incomer A|'],
        'PDU 2': ['Main|PDU 2|', 'Main|EMSB 2|', 'Main|ATS 002|', 'Main|Incomer A|'],
        'PDU 4': ['Main|PDU 4|', 'Main|EMSB 2|', 'Main|ATS 002|', 'Main|Incomer A|'],
        'PDU 8': ['Main|PDU 8|', 'Main|EMSB 2|', 'Main|ATS 002|', 'Main|Incomer A|'],
        'EMSB 1': ['Main|EMSB 1|', 'Main|Incomer B|'],
        'EMSB 4': ['Main|EMSB 4|', 'Main|Incomer B|'],
        'EDB 27': ['Main|EDB 27|', 'Main|Incomer B|'],
        'Battery Charger & Fuel Pump': ['Main|Battery Charger & Fuel Pump|', 'Main|Incomer B|'],
        'EMSB 9': ['Main|EMSB 9|', 'Main|Incomer B|'],
        'EMSB 3': ['Main|EMSB 3|', 'Main|Incomer B|'],
        'MSB 10': ['Main|MSB 10|', 'Main|Incomer B|'],
        'MSB 8': ['Main|MSB 8|', 'Main|Incomer A|'],
        'MCC 2': ['Main|MCC 2|', 'Main|Incomer A|'],
        'MSB 7': ['Main|MSB 7|', 'Main|Incomer A|'],
        'DB 2': ['Main|DB 2|', 'Main|Incomer A|'],
        'ATS 002': ['Main|ATS 002|', 'Main|Incomer A|'],
        'EMSB 2': ['Main|EMSB 2|', 'Main|ATS 002|', 'Main|Incomer A|'],
        'EMCC 1': ['Main|EMCC 1|', 'Main|ATS 002|', 'Main|Incomer A|'],
        'Generator Control Panel': ['Main|Generator Control Panel|', 'Main|ATS 002|', 'Main|Incomer A|'],
        'EDB 28': ['Main|EDB 28|', 'Main|ATS 002|', 'Main|Incomer A|']
    },

    /* links on those paths that carry no meter, so cannot be tested */
    unmeteredOnPath: {
        'PDU 1': ['ESMSB-1', 'UPS-1'], 'PDU 3': ['ESMSB-1', 'UPS-1'],
        'PDU 5': ['ESMSB-1', 'UPS-1'], 'PDU 7': ['ESMSB-1', 'UPS-1'],
        'PDU 6': ['ESMSB-2', 'UPS-2'], 'PDU 2': ['ESMSB-2', 'UPS-2'],
        'PDU 4': ['ESMSB-2', 'UPS-2'], 'PDU 8': ['ESMSB-2', 'UPS-2']
    },

    /* which generator backs a connection point, if any */
    backedBy: {
        'EMSB 1': 'GEN-1', 'EMSB 4': 'GEN-1', 'EDB 27': 'GEN-1',
        'Battery Charger & Fuel Pump': 'GEN-1', 'EMSB 9': 'GEN-1', 'EMSB 3': 'GEN-1',
        'PDU 1': 'GEN-1', 'PDU 3': 'GEN-1', 'PDU 5': 'GEN-1', 'PDU 7': 'GEN-1',
        'ATS 002': 'GEN-2', 'EMSB 2': 'GEN-2', 'EMCC 1': 'GEN-2',
        'Generator Control Panel': 'GEN-2', 'EDB 28': 'GEN-2',
        'PDU 6': 'GEN-2', 'PDU 2': 'GEN-2', 'PDU 4': 'GEN-2', 'PDU 8': 'GEN-2'
        /* MSB 7, MSB 8, MSB 10, MCC 2 and DB 2 are utility only */
    },

    /* the two UPS chains. Output is not metered, but the sum of the PDUs each
       one feeds is, so its loading can be computed. */
    ups: [
        { id: 'UPS-1', kva: 500, feeds: ['Main|PDU 1|', 'Main|PDU 3|', 'Main|PDU 5|', 'Main|PDU 7|'],
          board: 'ESMSB-1' },
        { id: 'UPS-2', kva: 500, feeds: ['Main|PDU 6|', 'Main|PDU 2|', 'Main|PDU 4|', 'Main|PDU 8|'],
          board: 'ESMSB-2' }
    ],

    /* Design intent recorded on the transformer-to-rack block diagram: either
       UPS alone is meant to carry the whole room, so the usable ceiling is
       about 450 kW rather than 900 kW. KOC-E-011 cl. 8.2 and 11.1.3 require a
       dual redundant UPS with both halves on line, which is the same idea in
       standard form. Treated as design intent, not as a KOC clause. */
    upsEitherCarriesAll: true,

    /* ---------------------------------------------------------
       what the readings can and cannot answer
       --------------------------------------------------------- */

    /* R, Y and B currents alone cannot establish these. Each is listed with
       the KOC clause that would need it, so the page says why it is silent
       rather than quietly passing. */
    notAssessableFromCurrent: [
        { item: 'Power factor', clause: 'KOC-E-003 Pt 1 cl. 9.5.3 / KOC-E-006 cl. 9.4.2',
          needs: 'kW and kVA, or a PF reading, at the incomers' },
        { item: 'Voltage drop', clause: 'KOC-E-008 cl. 8.3.4(a)(iii) - 2.5 % on LV power',
          needs: 'cable size, length, installation method per feeder' },
        { item: 'Harmonic distortion', clause: 'KOC-E-016 cl. 8.4.1 - IEEE 519',
          needs: 'a harmonic survey or power quality logger' },
        { item: 'Fault level', clause: 'KOC-E-003 Pt 1 cl. 9.4.1(c)',
          needs: 'a short circuit study' },
        { item: 'Protection discrimination', clause: 'KOC-E-006 cl. 8.6.6 - 0.3 s selectivity',
          needs: 'relay and breaker settings, and a coordination study' },
        { item: 'Board incomer vs spare ways', clause: 'KOC-E-009 cl. 26.2',
          needs: 'the way schedule and rating of every spare compartment per board' }
    ]
};
