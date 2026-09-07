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
