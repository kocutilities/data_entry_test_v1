/* =============================================================
   KOC Data Center - Load Reading
   config.js  -  the data that changes. Edit here, not in the page.

   Sources:
     equipment    single line diagram EI-CC-S/S-001, issue 06-09-26
     PDU circuits DATA CENTER #1 UPDATED RUNNING LOAD DETAILS.xlsx, sheet NEW
   ============================================================= */

const DC_CONFIG = {

  /* Google Apps Script web-app URL that receives the readings.

     BUILT IN, so every PC in the office connects with nothing to set up.
     Decided 2026-09-10 by Jais: the per-device setup link was tried and does
     not fit a page used by several people on several PCs.

     What that costs, written down so it is not forgotten. The deployment
     must accept "Anyone" for the page to reach it at all, and this
     repository is public, so the URL is readable by anyone who looks - and
     whoever holds it can read the readings and can append to, or overwrite
     rows in, the sheet. It is kept below reversed and base64-encoded so the
     repository holds no plain script.google.com/macros/s/ string for the
     scrapers that hunt public code for one. That is a speed bump against
     bots, NOT protection: anyone reading the page can decode it.

     If it is ever abused: in Apps Script, Deploy > Manage deployments,
     archive this deployment and create a new one, then put the new URL here.
     The old URL stops working the moment it is archived, and every PC picks
     up the new one on its next load because this setting takes precedence
     over anything a device has stored. Google Sheets keeps version history,
     so tampered rows can be restored from File > Version history.

     To encode a new URL, run in the browser console:
         btoa('https://script.google.com/macros/s/.../exec'.split('').reverse().join(''))
     and paste the result into endpointEncoded. Or put the plain URL in
     endpoint and leave endpointEncoded empty - either works.

     After editing Code.gs you must redeploy as a NEW VERSION (Manage
     deployments > pencil > New version), which keeps this same URL. A NEW
     DEPLOYMENT makes a new URL and would need this line changing. */
  endpoint: '',
  endpointEncoded: 'Y2V4ZS9BNlV1TVV1blJrSlNoYlJZOGNnT2hkU2owY19McDQxZTFIWUh6eWVqdnZCVVFNMnNBdkhpVTgybExQcjFFR1hjUTFjeWJjeWZLQS9zL3NvcmNhbS9tb2MuZWxnb29nLnRwaXJjcy8vOnNwdHRo',

  /* Shown in the page header and written to every row. */
  site: 'KOC Data Center',

  /* Pole/phase settings made on the page, pasted back in here so they
     belong to the project rather than to one browser's storage.
     Use "Copy phase setup" on the PDU section to generate this block.
     Keys are equipment|circuit, values '3', 'R', 'Y' or 'B'. */
  phaseOverrides: {
  },

  /* ---------------------------------------------------------------
     Main equipment and feeders.
     rated  - device rating in amperes, used for the % loading badge.

     For the PDU feeds there is a breaker at each end, and they differ:
       ratedSource - the MCCB at the ESMSB end. 160 A on all eight.
       ratedLoad   - the MCCB at the PDU end. 160 A on PDU 1 to 6,
                     200 A on PDU 7 and 8.
     'rated' carries the LOWER of the two, because a circuit's continuous
     capability is set by its most restrictive protective device - so all
     eight PDU feeds are governed by the 160 A at the ESMSB end, including
     the two whose PDU-end breaker is 200 A.
     --------------------------------------------------------------- */
  equipment: [
    { name: 'Incomer A',                    source: 'Transformer A via ACB-4',   rated: 2133, note: '% shown against transformer FLC 2133 A', cable: '3R 1Cx630 mm²', cableAt: 'TR-A to ACB-4' },
    { name: 'Incomer B',                    source: 'Transformer B via ACB-3',   rated: 2133, note: '% shown against transformer FLC 2133 A', cable: '3R 1Cx630 mm²', cableAt: 'TR-B to ACB-3' },
    { name: 'EMSB 1',                        source: 'LT board way 1D',           rated: 1000, note: '', cable: '2R 4Cx400 mm²', cableAt: 'way 1D' },
    { name: 'EMSB 4',                        source: 'LT board way 1C',           rated: 400,  note: '', cable: '2R 4Cx240 mm² Cu/XLPE/SWA/PVC', cableAt: 'way 1C' },
    { name: 'EDB 27',                        source: 'LT board way 1B',           rated: 125,  note: 'Generator Room', cable: '4Cx35 mm²', cableAt: 'way 1B' },
    { name: 'Battery Charger & Fuel Pump',   source: 'LT board way 1A',           rated: 125,  note: '', cable: '4Cx6 mm²', cableAt: 'way 1A' },
    { name: 'EMSB 9',                        source: 'LT board way 2D',           rated: 630, ratedSource: 800, ratedLoad: 630,  note: '', cable: '2R 4Cx400 mm²', cableAt: 'way 2D' },
    { name: 'EMSB 3',                        source: 'LT board way 2B',           rated: 400,  note: '', cable: '2R 4Cx300 mm² Cu/XLPE/SWA/PVC', cableAt: 'way 2B' },
    { name: 'MSB 10',                        source: 'LT board way 6D',           rated: 630,  note: 'E Building', cable: '2R 4Cx400 mm² Cu/XLPE/SWA/PVC', cableAt: 'way 6D' },
    { name: 'MSB 8',                         source: 'LT board way 8B',           rated: 400,  note: 'D Building', cable: '4Cx185 mm² Cu/XLPE/SWA/PVC', cableAt: 'way 8B' },
    { name: 'MCC 2',                         source: 'LT board way 8D',           rated: 800,  note: '', cable: '2R 4Cx300 mm²', cableAt: 'M.C.C room' },
    { name: 'MSB 7',                         source: 'LT board way 8E',           rated: 250, ratedSource: 400, ratedLoad: 250,  note: 'C Building', cable: '4Cx95 mm² Cu/XLPE/SWA/PVC', cableAt: 'C-BLDG feeder' },
    { name: 'DB 2',                          source: 'LT board way 8F',           rated: 125,  note: 'Generator Room', cable: '4Cx25 mm²', cableAt: 'generator room' },
    { name: 'ATS 002',                       source: 'LT board way 9A',           rated: 2000, note: '', cable: '2R 4Cx300 mm² XLPE/SWA', cableAt: 'way 9A to ATS-002' },
{ name: 'PDU 1',                         source: 'ESMSB-1',                   rated: 160, note: 'Feed A', ratedSource: 160, ratedLoad: 160, cable: '1x4Cx70 mm² PVC/SWA/PVC', cableAt: 'ESMSB-1 way 2' },
{ name: 'PDU 3',                         source: 'ESMSB-1',                   rated: 160, note: 'Feed A', ratedSource: 160, ratedLoad: 160, cable: '1x4Cx70 mm² PVC/SWA/PVC', cableAt: 'ESMSB-1 way 3' },
{ name: 'PDU 5',                         source: 'ESMSB-1',                   rated: 160, note: 'Feed A', ratedSource: 160, ratedLoad: 160, cable: '1x4Cx50 mm² PVC/SWA/PVC', cableAt: 'ESMSB-1 way 4' , cableNote: 'Confirmed as-built 2026-09-07. PDU 5 and PDU 6 run on 50 mm² where the other six run on 70 mm², behind the same 160 A breaker — this is the installation, not a drafting error.' },
{ name: 'PDU 7',                         source: 'ESMSB-1',                   rated: 160, note: 'Feed A', ratedSource: 160, ratedLoad: 200, cable: '1x4Cx70 mm² PVC/SWA/PVC', cableAt: 'ESMSB-1 way 5' },
{ name: 'PDU 6',                         source: 'ESMSB-2',                   rated: 160, note: 'Feed B', ratedSource: 160, ratedLoad: 160, cable: '1x4Cx50 mm² PVC/SWA/PVC', cableAt: 'ESMSB-2 way 9' , cableNote: 'Confirmed as-built 2026-09-07. PDU 5 and PDU 6 run on 50 mm² where the other six run on 70 mm², behind the same 160 A breaker — this is the installation, not a drafting error.' },
{ name: 'PDU 2',                         source: 'ESMSB-2',                   rated: 160, note: 'Feed B', ratedSource: 160, ratedLoad: 160, cable: '1x4Cx70 mm² PVC/SWA/PVC', cableAt: 'ESMSB-2 way 7' },
{ name: 'PDU 4',                         source: 'ESMSB-2',                   rated: 160, note: 'Feed B', ratedSource: 160, ratedLoad: 160, cable: '1x4Cx70 mm² PVC/SWA/PVC', cableAt: 'ESMSB-2 way 8' },
{ name: 'PDU 8',                         source: 'ESMSB-2',                   rated: 160, note: 'Feed B', ratedSource: 160, ratedLoad: 200, cable: '1x4Cx70 mm² PVC/SWA/PVC', cableAt: 'ESMSB-2 way 10' },
    { name: 'EDB 28',                        source: 'ATS-002 way L6',            rated: 40,   note: 'ATS Room', cable: '4Cx16 mm²', cableAt: 'ATS-002 way L6' },
    { name: 'Generator Control Panel',       source: 'ATS-002 way L5',            rated: 125,  note: '', cable: '5Cx35 mm²', cableAt: 'ATS-002 way L5' },
    { name: 'EMSB 2',                        source: 'ATS-002 way L1',            rated: 1000, note: '', cable: '2R 4Cx300 mm²', cableAt: 'ATS-002 way L1' },
    { name: 'EMCC 1',                        source: 'ATS-002 way L2',            rated: 800,  note: '', cable: '2R 4Cx300 mm²', cableAt: 'ATS-002 way L2' },
  ],

  /* ---------------------------------------------------------------
     PDU outgoing breakers, per PDU.
     Taken from the data centre load schedule. 'rack' is the load the
     circuit serves - shown next to the input so the reader can confirm
     they are at the right breaker.

     'ph' is the pole count and phase of the way, which decides how many
     inputs the page shows:

         ph: '3'   four pole RCBO, three phase load - R, Y and B recorded
         ph: 'R'   two pole RCBO, red phase + neutral   - only R recorded
         ph: 'Y'   two pole, yellow phase + neutral     - only Y recorded
         ph: 'B'   two pole, blue phase + neutral       - only B recorded

     Source: the phase letters printed on the PDU single line diagrams
     (PDU-01 Single line diagram.pdf and PDU-1 to PDU-8 SLD.pdf). Ways 1
     to 6 are the four pole group; from way 7 the ways rotate R, Y, B by
     way number, so phase = [R,Y,B][(n-1) mod 3]. That was checked against
     all 480 phase letters printed across the eight PDU blocks and matched
     every one, so it is transcribed here rather than assumed.

     --------------------------------------------------------------- */
  pduCircuits: {
    'PDU 1': [
        { c: 'Q1', rack: 'Cabin A-01', breaker: '20A', ph: '3' },
        { c: 'Q2', rack: 'Cabin A-02', breaker: '20A', ph: '3' },
        { c: 'Q3', rack: 'Cabin A-03', breaker: '20A', ph: '3' },
        { c: 'Q4', rack: 'Cabin A-04', breaker: '20A', ph: '3' },
        { c: 'Q5', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q6', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q7', rack: 'Cabin A-07', breaker: '25A', ph: 'R' },
        { c: 'Q8', rack: 'Cabin A-08', breaker: '25A', ph: 'Y' },
        { c: 'Q9', rack: 'Cabin A-08', breaker: '25A', ph: 'B' },
        { c: 'Q10', rack: 'Cabin A-09', breaker: '25A', ph: 'R' },
        { c: 'Q11', rack: 'Cabin A-09', breaker: '25A', ph: 'Y' },
        { c: 'Q12', rack: 'Cabin A-10', breaker: '25A', ph: 'B' },
        { c: 'Q13', rack: 'Cabin A-10', breaker: '25A', ph: 'R' },
        { c: 'Q14', rack: 'Cabin B-02', breaker: '25A', ph: 'Y' },
        { c: 'Q15', rack: 'Cabin B-02', breaker: '25A', ph: 'B' },
        { c: 'Q16', rack: 'Cabin B-03', breaker: '25A', ph: 'R' },
        { c: 'Q17', rack: 'Cabin B-03', breaker: '25A', ph: 'Y' },
        { c: 'Q18', rack: 'Cabin B-04', breaker: '32A', ph: 'B' },
        { c: 'Q19', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q20', rack: 'Cabin B-06', breaker: '32A', ph: 'Y' },
        { c: 'Q21', rack: 'Cabin B-07', breaker: '32A', ph: 'B' },
        { c: 'Q22', rack: 'Cabin B-09', breaker: '25A', ph: 'R' },
        { c: 'Q23', rack: 'Cabin B-09', breaker: '25A', ph: 'Y' },
        { c: 'Q24', rack: 'Cabin B-05', breaker: '32A', ph: 'B' },
        { c: 'Q25', rack: 'Cabin B-05', breaker: '32A', ph: 'R' },
        { c: 'Q26', rack: 'SPARE Cabin A-14', breaker: '32A', ph: 'Y' },
        { c: 'Q27', rack: 'Cabin A-14', breaker: '32A', ph: 'B' },
        { c: 'Q28', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q29', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q30', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q31', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q32', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q33', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q34', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q35', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q36', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q37', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q38', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q39', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q40', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q41', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q42', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q43', rack: 'Cabin K-05', breaker: '25A', ph: 'R' },
        { c: 'Q44', rack: 'Cabin K-06', breaker: '25A', ph: 'Y' },
        { c: 'Q45', rack: 'Cabin K-06', breaker: '25A', ph: 'B' },
        { c: 'Q46', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'R' },
        { c: 'Q47', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'Y' },
        { c: 'Q48', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'B' },
        { c: 'Q49', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'R' },
        { c: 'Q50', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'Y' },
        { c: 'Q51', rack: 'Cabin A05 SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q52', rack: 'Cabin A05', breaker: '25A', ph: 'R' },
        { c: 'Q53', rack: 'Cabin A06', breaker: '25A', ph: 'Y' },
        { c: 'Q54', rack: 'Cabin A06', breaker: '25A', ph: 'B' },
        { c: 'Q55', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q56', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q57', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q58', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q59', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q60', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q61', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q62', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q63', rack: 'A Building corridor near admin', breaker: '25A', ph: 'B' },
        { c: 'Q64', rack: 'C Building LAN Room C-106', breaker: '16A', ph: 'R' },
        { c: 'Q65', rack: 'A Building Telecom room wall socket', breaker: '16A', ph: 'Y' },
        { c: 'Q66', rack: 'B Building LAN Room ind. socket', breaker: '16A', ph: 'B' },
        { c: 'Q67', rack: 'B Building LAN Room 13A socket', breaker: '16A', ph: 'R' },
        { c: 'Q68', rack: 'A Building Telecom room wall socket', breaker: '16A', ph: 'Y' },
        { c: 'Q69', rack: 'A Building Room A14 wall socket', breaker: '16A', ph: 'B' },
        { c: 'Q70', rack: 'A Building Room A14 floor socket', breaker: '16A', ph: 'R' },
        { c: 'Q71', rack: 'A Building Room A14 floor socket', breaker: '16A', ph: 'Y' },
        { c: 'Q72', rack: 'A Building Room A14 floor socket', breaker: '16A', ph: 'B' },
        { c: 'Q73', rack: 'A Building Room A14 floor socket', breaker: '16A', ph: 'R' },
        { c: 'Q74', rack: 'Cabin A11', breaker: '25A', ph: 'Y' },
        { c: 'Q75', rack: 'RMS', breaker: '16A', ph: 'B' },
        { c: 'Q76', rack: 'Cabin A12', breaker: '25A', ph: 'R' },
        { c: 'Q77', rack: 'Cabin A13', breaker: '16A', ph: 'Y' },
        { c: 'Q78', rack: 'SPARE', breaker: '16A', ph: 'B' }
    ],
    'PDU 3': [
        { c: 'Q1', rack: 'SPARE Cabin C-03', breaker: '25A', ph: '3' },
        { c: 'Q2', rack: 'SPARE Cabin C-03', breaker: '25A', ph: '3' },
        { c: 'Q3', rack: 'SPARE Cabin C-03', breaker: '25A', ph: '3' },
        { c: 'Q4', rack: 'Cabin C-04', breaker: '25A', ph: '3' },
        { c: 'Q5', rack: 'SPARE', breaker: '25A', ph: '3' },
        { c: 'Q6', rack: 'SPARE', breaker: '25A', ph: '3' },
        { c: 'Q7', rack: 'Cabin C-02', breaker: '32A', ph: 'R' },
        { c: 'Q8', rack: 'Cabin C-05', breaker: '32A', ph: 'Y' },
        { c: 'Q9', rack: 'Cabin C-05', breaker: '32A', ph: 'B' },
        { c: 'Q10', rack: 'Cabin C-07', breaker: '25A', ph: 'R' },
        { c: 'Q11', rack: 'SPARE Cabin C-07', breaker: '25A', ph: 'Y' },
        { c: 'Q12', rack: 'Cabin C-08', breaker: '25A', ph: 'B' },
        { c: 'Q13', rack: 'Cabin C-09', breaker: '32A', ph: 'R' },
        { c: 'Q14', rack: 'Cabin C-09', breaker: '32A', ph: 'Y' },
        { c: 'Q15', rack: 'Cabin C-10', breaker: '25A', ph: 'B' },
        { c: 'Q16', rack: 'Cabin C-11', breaker: '16A', ph: 'R' },
        { c: 'Q17', rack: 'Cabin C-12', breaker: '16A', ph: 'Y' },
        { c: 'Q18', rack: 'Cabin D-02', breaker: '25A', ph: 'B' },
        { c: 'Q19', rack: 'Cabin D-03', breaker: '25A', ph: 'R' },
        { c: 'Q20', rack: 'Cabin D-04', breaker: '25A', ph: 'Y' },
        { c: 'Q21', rack: 'Cabin D-04', breaker: '32A', ph: 'B' },
        { c: 'Q22', rack: 'Cabin D-05', breaker: '25A', ph: 'R' },
        { c: 'Q23', rack: 'Cabin D-06', breaker: '25A', ph: 'Y' },
        { c: 'Q24', rack: 'Cabin D-06', breaker: '25A', ph: 'B' },
        { c: 'Q25', rack: 'Cabin D-06A', breaker: '25A', ph: 'R' },
        { c: 'Q26', rack: 'Cabin D-07', breaker: '25A', ph: 'Y' },
        { c: 'Q27', rack: 'Cabin D-08', breaker: '25A', ph: 'B' },
        { c: 'Q28', rack: 'Cabin D-09', breaker: '25A', ph: 'R' },
        { c: 'Q29', rack: 'Cabin D-10', breaker: '25A', ph: 'Y' },
        { c: 'Q30', rack: 'Cabin D-11', breaker: '25A', ph: 'B' },
        { c: 'Q31', rack: 'Cabin D-11', breaker: '25A', ph: 'R' },
        { c: 'Q32', rack: 'Cabin D-12', breaker: '25A', ph: 'Y' },
        { c: 'Q33', rack: 'Cabin D-12', breaker: '25A', ph: 'B' },
        { c: 'Q34', rack: 'Cabin D-13', breaker: '16A', ph: 'R' },
        { c: 'Q35', rack: 'Cabin D-14', breaker: '16A', ph: 'Y' },
        { c: 'Q36', rack: 'Cabin E-01', breaker: '32A', ph: 'B' },
        { c: 'Q37', rack: 'Cabin E-06', breaker: '32A', ph: 'R' },
        { c: 'Q38', rack: 'Cabin E-07', breaker: '25A', ph: 'Y' },
        { c: 'Q39', rack: 'Cabin E-09', breaker: '16A', ph: 'B' },
        { c: 'Q40', rack: 'Cabin E-10', breaker: '16A', ph: 'R' },
        { c: 'Q41', rack: 'Cabin E-11', breaker: '16A', ph: 'Y' },
        { c: 'Q42', rack: 'SPARE Cabin E-12', breaker: '16A', ph: 'B' },
        { c: 'Q43', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q44', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'Y' },
        { c: 'Q45', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'B' },
        { c: 'Q46', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'R' },
        { c: 'Q47', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'Y' },
        { c: 'Q48', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'B' },
        { c: 'Q49', rack: 'Cabin C-13', breaker: '25A', ph: 'R' },
        { c: 'Q50', rack: 'Cabin C-14', breaker: '25A', ph: 'Y' },
        { c: 'Q51', rack: 'Cabin B-10', breaker: '32A', ph: 'B' },
        { c: 'Q52', rack: 'Cabin B-11', breaker: '32A', ph: 'R' },
        { c: 'Q53', rack: 'Cabin B-12', breaker: '32A', ph: 'Y' },
        { c: 'Q54', rack: 'Cabin B-13', breaker: '32A', ph: 'B' },
        { c: 'Q55', rack: 'Cabin B-14', breaker: '32A', ph: 'R' },
        { c: 'Q56', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q57', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q58', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q59', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q60', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q61', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q62', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q63', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q64', rack: 'Cabin E-13', breaker: '32A', ph: 'R' },
        { c: 'Q65', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q66', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q67', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q68', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q69', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q70', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q71', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q72', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q73', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q74', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q75', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q76', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q77', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q78', rack: 'SPARE', breaker: '16A', ph: 'B' }
    ],
    'PDU 5': [
        { c: 'Q1', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q2', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q3', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q4', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q5', rack: 'Cabin H-12', breaker: '25A', ph: '3' },
        { c: 'Q6', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q7', rack: 'Cabin F-01', breaker: '16A', ph: 'R' },
        { c: 'Q8', rack: 'SPARE Cabin F-01', breaker: '16A', ph: 'Y' },
        { c: 'Q9', rack: 'Cabin F-02', breaker: '16A', ph: 'B' },
        { c: 'Q10', rack: 'Cabin F-03', breaker: '16A', ph: 'R' },
        { c: 'Q11', rack: 'Cabin F-04', breaker: '16A', ph: 'Y' },
        { c: 'Q12', rack: 'Cabin F-05', breaker: '16A', ph: 'B' },
        { c: 'Q13', rack: 'Cabin F-06', breaker: '16A', ph: 'R' },
        { c: 'Q14', rack: 'Cabin F-03', breaker: '16A', ph: 'Y' },
        { c: 'Q15', rack: 'Cabin F-07', breaker: '16A', ph: 'B' },
        { c: 'Q16', rack: 'Cabin F-09', breaker: '16A', ph: 'R' },
        { c: 'Q17', rack: 'Cabin G-01', breaker: '16A', ph: 'Y' },
        { c: 'Q18', rack: 'Cabin G-02', breaker: '16A', ph: 'B' },
        { c: 'Q19', rack: 'Cabin G-03', breaker: '16A', ph: 'R' },
        { c: 'Q20', rack: 'Cabin G-04', breaker: '16A', ph: 'Y' },
        { c: 'Q21', rack: 'Cabin G-05', breaker: '16A', ph: 'B' },
        { c: 'Q22', rack: 'Cabin G-08', breaker: '16A', ph: 'R' },
        { c: 'Q23', rack: 'Cabin G-09', breaker: '16A', ph: 'Y' },
        { c: 'Q24', rack: 'Cabin G-10', breaker: '16A', ph: 'B' },
        { c: 'Q25', rack: 'Cabin H-01', breaker: '16A', ph: 'R' },
        { c: 'Q26', rack: 'Cabin H-02', breaker: '16A', ph: 'Y' },
        { c: 'Q27', rack: 'Cabin H-03', breaker: '16A', ph: 'B' },
        { c: 'Q28', rack: 'SPARE Cabin H-03', breaker: '16A', ph: 'R' },
        { c: 'Q29', rack: 'Cabin H-04', breaker: '16A', ph: 'Y' },
        { c: 'Q30', rack: 'SPARE Cabin H-05', breaker: '16A', ph: 'B' },
        { c: 'Q31', rack: 'SPARE Cabin H-05', breaker: '16A', ph: 'R' },
        { c: 'Q32', rack: 'Cabin H-06', breaker: '25A', ph: 'Y' },
        { c: 'Q33', rack: 'SPARE Cabin H-08', breaker: '25A', ph: 'B' },
        { c: 'Q34', rack: 'Cabin H-09', breaker: '25A', ph: 'R' },
        { c: 'Q35', rack: 'Cabin H-10', breaker: '25A', ph: 'Y' },
        { c: 'Q36', rack: 'SPARE Cabin I-05', breaker: '25A', ph: 'B' },
        { c: 'Q37', rack: 'SPARE Cabin I-05', breaker: '25A', ph: 'R' },
        { c: 'Q38', rack: 'SPARE Cabin I-06', breaker: '25A', ph: 'Y' },
        { c: 'Q39', rack: 'SPARE Cabin I-06', breaker: '25A', ph: 'B' },
        { c: 'Q40', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q41', rack: 'Cabin G-02', breaker: '25A', ph: 'Y' },
        { c: 'Q42', rack: 'Cabin G-01', breaker: '25A', ph: 'B' },
        { c: 'Q43', rack: 'SPARE IND. SOCKET', breaker: '16A', ph: 'R' },
        { c: 'Q44', rack: 'SPARE IND. SOCKET', breaker: '16A', ph: 'Y' },
        { c: 'Q45', rack: 'SPARE IND. SOCKET', breaker: '16A', ph: 'B' },
        { c: 'Q46', rack: 'SPARE IND. SOCKET', breaker: '16A', ph: 'R' },
        { c: 'Q47', rack: 'SPARE IND. SOCKET', breaker: '16A', ph: 'Y' },
        { c: 'Q48', rack: 'Cabin G-10 SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q49', rack: 'Cabin H-11', breaker: '16A', ph: 'R' },
        { c: 'Q50', rack: 'Cabin H-11 SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q51', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q52', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q53', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q54', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q55', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q56', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q57', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q58', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q59', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q60', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q61', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q62', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q63', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q64', rack: 'Cabin H-12 SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q65', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q66', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q67', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q68', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q69', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q70', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q71', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q72', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q73', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q74', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q75', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q76', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q77', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q78', rack: 'Cabin G-01', breaker: '25A', ph: 'B' }
    ],
    'PDU 7': [
        { c: 'Q1', rack: 'Cabin M-01', breaker: '20A', ph: 'R' },
        { c: 'Q2', rack: 'Cabin M-02', breaker: '20A', ph: 'Y' },
        { c: 'Q3', rack: 'Cabin M-03', breaker: '20A', ph: 'B' },
        { c: 'Q4', rack: 'Cabin M-04', breaker: '20A', ph: 'R' },
        { c: 'Q5', rack: 'Cabin M-05', breaker: '20A', ph: 'Y' },
        { c: 'Q6', rack: 'Cabin M-06', breaker: '20A', ph: 'B' },
        { c: 'Q7', rack: 'Cabin M-07', breaker: '20A', ph: 'R' },
        { c: 'Q8', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q9', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q10', rack: 'Cabin M-08', breaker: '20A', ph: 'R' },
        { c: 'Q11', rack: 'Cabin M-09', breaker: '20A', ph: 'Y' },
        { c: 'Q12', rack: 'Cabin M-10', breaker: '20A', ph: 'B' },
        { c: 'Q13', rack: 'Cabin M-11', breaker: '20A', ph: 'R' },
        { c: 'Q14', rack: 'Cabin M-12 SPARE', breaker: '20A', ph: 'Y' },
        { c: 'Q15', rack: 'Cabin M-13', breaker: '32A', ph: 'B' },
        { c: 'Q16', rack: 'Cabin M-15', breaker: '20A', ph: 'R' },
        { c: 'Q17', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q18', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q19', rack: 'Cabin M-16', breaker: '20A', ph: 'R' },
        { c: 'Q20', rack: 'L-01', breaker: '20A', ph: 'Y' },
        { c: 'Q21', rack: 'L-02', breaker: '20A', ph: 'B' },
        { c: 'Q22', rack: 'L-03', breaker: '20A', ph: 'R' },
        { c: 'Q23', rack: 'L-04', breaker: '20A', ph: 'Y' },
        { c: 'Q24', rack: 'L-05', breaker: '20A', ph: 'B' },
        { c: 'Q25', rack: 'L-06', breaker: '20A', ph: 'R' },
        { c: 'Q26', rack: 'L-07', breaker: '20A', ph: 'Y' },
        { c: 'Q27', rack: 'L-08', breaker: '20A', ph: 'B' },
        { c: 'Q28', rack: 'L-09', breaker: '20A', ph: 'R' },
        { c: 'Q29', rack: 'L-10', breaker: '20A', ph: 'Y' },
        { c: 'Q30', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q31', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q32', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q33', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q34', rack: 'L-11', breaker: '20A', ph: 'R' },
        { c: 'Q35', rack: 'L-12', breaker: '20A', ph: 'Y' },
        { c: 'Q36', rack: 'L-13', breaker: '20A', ph: 'B' },
        { c: 'Q37', rack: 'SPARE', breaker: '20A', ph: 'R' },
        { c: 'Q38', rack: 'L-15', breaker: '20A', ph: 'Y' },
        { c: 'Q39', rack: 'L-16', breaker: '20A', ph: 'B' },
        { c: 'Q40', rack: 'L-17', breaker: '20A', ph: 'R' },
        { c: 'Q41', rack: 'L-18', breaker: '20A', ph: 'Y' },
        { c: 'Q42', rack: 'L-19', breaker: '20A', ph: 'B' },
        { c: 'Q43', rack: 'SPARE', breaker: '20A', ph: 'R' },
        { c: 'Q44', rack: 'L-14', breaker: '32A', ph: 'Y' },
        { c: 'Q45', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q46', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q47', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q48', rack: 'SPARE', breaker: '32A', ph: '3' }
    ],
    'PDU 6': [
        { c: 'Q1', rack: 'Cabin A-01', breaker: '25A', ph: '3' },
        { c: 'Q2', rack: 'Cabin A-02', breaker: '25A', ph: '3' },
        { c: 'Q3', rack: 'Cabin A-03', breaker: '25A', ph: '3' },
        { c: 'Q4', rack: 'Cabin A-04', breaker: '25A', ph: '3' },
        { c: 'Q5', rack: 'SPARE', breaker: '25A', ph: '3' },
        { c: 'Q6', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q7', rack: 'Cabin A-07', breaker: '25A', ph: 'R' },
        { c: 'Q8', rack: 'Cabin A-08', breaker: '25A', ph: 'Y' },
        { c: 'Q9', rack: 'Cabin A-08', breaker: '25A', ph: 'B' },
        { c: 'Q10', rack: 'Cabin A-09', breaker: '25A', ph: 'R' },
        { c: 'Q11', rack: 'Cabin A-09', breaker: '25A', ph: 'Y' },
        { c: 'Q12', rack: 'Cabin A-10', breaker: '25A', ph: 'B' },
        { c: 'Q13', rack: 'Cabin A-10', breaker: '25A', ph: 'R' },
        { c: 'Q14', rack: 'Cabin B-02', breaker: '25A', ph: 'Y' },
        { c: 'Q15', rack: 'Cabin B-02', breaker: '25A', ph: 'B' },
        { c: 'Q16', rack: 'Cabin B-03', breaker: '25A', ph: 'R' },
        { c: 'Q17', rack: 'Cabin B-03', breaker: '25A', ph: 'Y' },
        { c: 'Q18', rack: 'Cabin B-04', breaker: '32A', ph: 'B' },
        { c: 'Q19', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q20', rack: 'Cabin B-06', breaker: '32A', ph: 'Y' },
        { c: 'Q21', rack: 'Cabin B-07', breaker: '32A', ph: 'B' },
        { c: 'Q22', rack: 'Cabin B-09', breaker: '25A', ph: 'R' },
        { c: 'Q23', rack: 'Cabin B-09', breaker: '25A', ph: 'Y' },
        { c: 'Q24', rack: 'Cabin B-05', breaker: '32A', ph: 'B' },
        { c: 'Q25', rack: 'Cabin B-05', breaker: '32A', ph: 'R' },
        { c: 'Q26', rack: 'Cabin A-14', breaker: '32A', ph: 'Y' },
        { c: 'Q27', rack: 'Cabin A-14', breaker: '32A', ph: 'B' },
        { c: 'Q28', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q29', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q30', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q31', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q32', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q33', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q34', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q35', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q36', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q37', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q38', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q39', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q40', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q41', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q42', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q43', rack: 'Cabin K-05', breaker: '25A', ph: 'R' },
        { c: 'Q44', rack: 'Cabin K-06', breaker: '25A', ph: 'Y' },
        { c: 'Q45', rack: 'Cabin K-06', breaker: '25A', ph: 'B' },
        { c: 'Q46', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'R' },
        { c: 'Q47', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'Y' },
        { c: 'Q48', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'B' },
        { c: 'Q49', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'R' },
        { c: 'Q50', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'Y' },
        { c: 'Q51', rack: 'Cabin A05 SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q52', rack: 'Cabin A05', breaker: '25A', ph: 'R' },
        { c: 'Q53', rack: 'Cabin A06', breaker: '25A', ph: 'Y' },
        { c: 'Q54', rack: 'Cabin A06', breaker: '25A', ph: 'B' },
        { c: 'Q55', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q56', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q57', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q58', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q59', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q60', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q61', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q62', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q63', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q64', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q65', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q66', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q67', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q68', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q69', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q70', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q71', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q72', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q73', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q74', rack: 'Cabin A11', breaker: '25A', ph: 'Y' },
        { c: 'Q75', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q76', rack: 'Cabin A12', breaker: '25A', ph: 'R' },
        { c: 'Q77', rack: 'Cabin A13', breaker: '16A', ph: 'Y' },
        { c: 'Q78', rack: 'SPARE', breaker: '16A', ph: 'B' }
    ],
    'PDU 2': [
        { c: 'Q1', rack: 'SPARE Cabin C-03', breaker: '32A', ph: '3' },
        { c: 'Q2', rack: 'SPARE Cabin C-03', breaker: '32A', ph: '3' },
        { c: 'Q3', rack: 'SPARE Cabin C-03', breaker: '32A', ph: '3' },
        { c: 'Q4', rack: 'Cabin C-04', breaker: '32A', ph: '3' },
        { c: 'Q5', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q6', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q7', rack: 'Cabin C-02', breaker: '32A', ph: 'R' },
        { c: 'Q8', rack: 'Cabin C-05', breaker: '32A', ph: 'Y' },
        { c: 'Q9', rack: 'Cabin C-05', breaker: '32A', ph: 'B' },
        { c: 'Q10', rack: 'Cabin C-07', breaker: '32A', ph: 'R' },
        { c: 'Q11', rack: 'SPARE Cabin C-07', breaker: '32A', ph: 'Y' },
        { c: 'Q12', rack: 'Cabin C-08', breaker: '32A', ph: 'B' },
        { c: 'Q13', rack: 'Cabin C-09', breaker: '32A', ph: 'R' },
        { c: 'Q14', rack: 'Cabin C-09', breaker: '32A', ph: 'Y' },
        { c: 'Q15', rack: 'Cabin C-10', breaker: '32A', ph: 'B' },
        { c: 'Q16', rack: 'Cabin C-11', breaker: '32A', ph: 'R' },
        { c: 'Q17', rack: 'Cabin C-12', breaker: '32A', ph: 'Y' },
        { c: 'Q18', rack: 'Cabin D-02', breaker: '32A', ph: 'B' },
        { c: 'Q19', rack: 'Cabin D-03', breaker: '32A', ph: 'R' },
        { c: 'Q20', rack: 'Cabin D-04', breaker: '32A', ph: 'Y' },
        { c: 'Q21', rack: 'Cabin D-04', breaker: '32A', ph: 'B' },
        { c: 'Q22', rack: 'Cabin D-05', breaker: '32A', ph: 'R' },
        { c: 'Q23', rack: 'Cabin D-06', breaker: '32A', ph: 'Y' },
        { c: 'Q24', rack: 'Cabin D-06', breaker: '32A', ph: 'B' },
        { c: 'Q25', rack: 'Cabin D-06A', breaker: '32A', ph: 'R' },
        { c: 'Q26', rack: 'Cabin D-07', breaker: '32A', ph: 'Y' },
        { c: 'Q27', rack: 'Cabin D-08', breaker: '32A', ph: 'B' },
        { c: 'Q28', rack: 'Cabin D-09', breaker: '32A', ph: 'R' },
        { c: 'Q29', rack: 'Cabin D-10', breaker: '32A', ph: 'Y' },
        { c: 'Q30', rack: 'Cabin D-11', breaker: '32A', ph: 'B' },
        { c: 'Q31', rack: 'Cabin D-11', breaker: '32A', ph: 'R' },
        { c: 'Q32', rack: 'Cabin D-12', breaker: '32A', ph: 'Y' },
        { c: 'Q33', rack: 'Cabin D-12', breaker: '32A', ph: 'B' },
        { c: 'Q34', rack: 'Cabin D-13', breaker: '32A', ph: 'R' },
        { c: 'Q35', rack: 'Cabin D-14', breaker: '32A', ph: 'Y' },
        { c: 'Q36', rack: 'Cabin E-01', breaker: '32A', ph: 'B' },
        { c: 'Q37', rack: 'Cabin E-06', breaker: '32A', ph: 'R' },
        { c: 'Q38', rack: 'Cabin E-07', breaker: '32A', ph: 'Y' },
        { c: 'Q39', rack: 'Cabin E-09', breaker: '32A', ph: 'B' },
        { c: 'Q40', rack: 'Cabin E-10', breaker: '32A', ph: 'R' },
        { c: 'Q41', rack: 'Cabin E-11', breaker: '32A', ph: 'Y' },
        { c: 'Q42', rack: 'SPARE Cabin E-12', breaker: '32A', ph: 'B' },
        { c: 'Q43', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q44', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q45', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q46', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q47', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q48', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q49', rack: 'Cabin C-13', breaker: '32A', ph: 'R' },
        { c: 'Q50', rack: 'Cabin C-14', breaker: '32A', ph: 'Y' },
        { c: 'Q51', rack: 'Cabin B-10', breaker: '32A', ph: 'B' },
        { c: 'Q52', rack: 'Cabin B-11', breaker: '32A', ph: 'R' },
        { c: 'Q53', rack: 'Cabin B-12', breaker: '32A', ph: 'Y' },
        { c: 'Q54', rack: 'Cabin B-13', breaker: '32A', ph: 'B' },
        { c: 'Q55', rack: 'Cabin B-14', breaker: '32A', ph: 'R' },
        { c: 'Q56', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q57', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q58', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q59', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q60', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q61', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q62', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q63', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q64', rack: 'Cabin E-13', breaker: '32A', ph: 'R' },
        { c: 'Q65', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q66', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q67', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q68', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q69', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q70', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q71', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q72', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q73', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q74', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q75', rack: 'SPARE', breaker: '32A', ph: 'B' },
        { c: 'Q76', rack: 'SPARE', breaker: '32A', ph: 'R' },
        { c: 'Q77', rack: 'SPARE', breaker: '32A', ph: 'Y' },
        { c: 'Q78', rack: 'SPARE', breaker: '32A', ph: 'B' }
    ],
    'PDU 4': [
        { c: 'Q1', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q2', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q3', rack: 'SPARE', breaker: '25A', ph: '3' },
        { c: 'Q4', rack: 'SPARE', breaker: '20A', ph: '3' },
        { c: 'Q5', rack: 'Cabin H-12', breaker: '25A', ph: '3' },
        { c: 'Q6', rack: 'SPARE', breaker: '25A', ph: '3' },
        { c: 'Q7', rack: 'Cabin F-01', breaker: '25A', ph: 'R' },
        { c: 'Q8', rack: 'SPARE Cabin F-01', breaker: '25A', ph: 'Y' },
        { c: 'Q9', rack: 'Cabin F-02', breaker: '25A', ph: 'B' },
        { c: 'Q10', rack: 'Cabin F-03', breaker: '25A', ph: 'R' },
        { c: 'Q11', rack: 'Cabin F-04', breaker: '25A', ph: 'Y' },
        { c: 'Q12', rack: 'Cabin F-05', breaker: '25A', ph: 'B' },
        { c: 'Q13', rack: 'Cabin F-06', breaker: '25A', ph: 'R' },
        { c: 'Q14', rack: 'Cabin F-03', breaker: '25A', ph: 'Y' },
        { c: 'Q15', rack: 'Cabin F-07', breaker: '25A', ph: 'B' },
        { c: 'Q16', rack: 'Cabin F-09', breaker: '25A', ph: 'R' },
        { c: 'Q17', rack: 'Cabin G-01', breaker: '25A', ph: 'Y' },
        { c: 'Q18', rack: 'Cabin G-02', breaker: '25A', ph: 'B' },
        { c: 'Q19', rack: 'Cabin G-03', breaker: '25A', ph: 'R' },
        { c: 'Q20', rack: 'Cabin G-04', breaker: '25A', ph: 'Y' },
        { c: 'Q21', rack: 'Cabin G-05', breaker: '25A', ph: 'B' },
        { c: 'Q22', rack: 'Cabin G-08', breaker: '25A', ph: 'R' },
        { c: 'Q23', rack: 'Cabin G-09', breaker: '25A', ph: 'Y' },
        { c: 'Q24', rack: 'Cabin G-10', breaker: '25A', ph: 'B' },
        { c: 'Q25', rack: 'Cabin H-01', breaker: '25A', ph: 'R' },
        { c: 'Q26', rack: 'Cabin H-02', breaker: '25A', ph: 'Y' },
        { c: 'Q27', rack: 'Cabin H-03', breaker: '25A', ph: 'B' },
        { c: 'Q28', rack: 'SPARE Cabin H-03', breaker: '16A', ph: 'R' },
        { c: 'Q29', rack: 'Cabin H-04', breaker: '16A', ph: 'Y' },
        { c: 'Q30', rack: 'SPARE Cabin H-05', breaker: '16A', ph: 'B' },
        { c: 'Q31', rack: 'SPARE Cabin H-05', breaker: '16A', ph: 'R' },
        { c: 'Q32', rack: 'Cabin H-06', breaker: '16A', ph: 'Y' },
        { c: 'Q33', rack: 'SPARE Cabin H-08', breaker: '16A', ph: 'B' },
        { c: 'Q34', rack: 'Cabin H-09', breaker: '16A', ph: 'R' },
        { c: 'Q35', rack: 'Cabin H-10', breaker: '16A', ph: 'Y' },
        { c: 'Q36', rack: 'SPARE Cabin I-05', breaker: '16A', ph: 'B' },
        { c: 'Q37', rack: 'SPARE Cabin I-05', breaker: '16A', ph: 'R' },
        { c: 'Q38', rack: 'SPARE Cabin I-06', breaker: '16A', ph: 'Y' },
        { c: 'Q39', rack: 'SPARE Cabin I-06', breaker: '16A', ph: 'B' },
        { c: 'Q40', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q41', rack: 'Cabin G-02', breaker: '25A', ph: 'Y' },
        { c: 'Q42', rack: 'Cabin G-01', breaker: '16A', ph: 'B' },
        { c: 'Q43', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'R' },
        { c: 'Q44', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'Y' },
        { c: 'Q45', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'B' },
        { c: 'Q46', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'R' },
        { c: 'Q47', rack: 'SPARE IND. SOCKET', breaker: '25A', ph: 'Y' },
        { c: 'Q48', rack: 'Cabin G-10 SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q49', rack: 'Cabin H-11', breaker: '25A', ph: 'R' },
        { c: 'Q50', rack: 'Cabin H-11 SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q51', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q52', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q53', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q54', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q55', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q56', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q57', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q58', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q59', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q60', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q61', rack: 'SPARE', breaker: '25A', ph: 'R' },
        { c: 'Q62', rack: 'SPARE', breaker: '25A', ph: 'Y' },
        { c: 'Q63', rack: 'SPARE', breaker: '25A', ph: 'B' },
        { c: 'Q64', rack: 'Cabin H-12 SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q65', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q66', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q67', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q68', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q69', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q70', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q71', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q72', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q73', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q74', rack: 'SPARE', breaker: '16A', ph: 'Y' },
        { c: 'Q75', rack: 'SPARE', breaker: '16A', ph: 'B' },
        { c: 'Q76', rack: 'SPARE', breaker: '16A', ph: 'R' },
        { c: 'Q77', rack: 'Cabin G-02', breaker: '16A', ph: 'Y' },
        { c: 'Q78', rack: 'SPARE', breaker: '16A', ph: 'B' }
    ],
    'PDU 8': [
        { c: 'Q1', rack: 'Cabin M-01', breaker: '20A', ph: 'R' },
        { c: 'Q2', rack: 'Cabin M-02', breaker: '20A', ph: 'Y' },
        { c: 'Q3', rack: 'Cabin M-03', breaker: '20A', ph: 'B' },
        { c: 'Q4', rack: 'Cabin M-04', breaker: '20A', ph: 'R' },
        { c: 'Q5', rack: 'Cabin M-05', breaker: '20A', ph: 'Y' },
        { c: 'Q6', rack: 'Cabin M-06', breaker: '20A', ph: 'B' },
        { c: 'Q7', rack: 'Cabin M-07', breaker: '20A', ph: 'R' },
        { c: 'Q8', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q9', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q10', rack: 'Cabin M-08', breaker: '20A', ph: 'R' },
        { c: 'Q11', rack: 'Cabin M-09', breaker: '20A', ph: 'Y' },
        { c: 'Q12', rack: 'Cabin M-10', breaker: '20A', ph: 'B' },
        { c: 'Q13', rack: 'Cabin M-11', breaker: '20A', ph: 'R' },
        { c: 'Q14', rack: 'Cabin M-12 SPARE', breaker: '20A', ph: 'Y' },
        { c: 'Q15', rack: 'Cabin M-13', breaker: '32A', ph: 'B' },
        { c: 'Q16', rack: 'Cabin M-15', breaker: '20A', ph: 'R' },
        { c: 'Q17', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q18', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q19', rack: 'Cabin M-16', breaker: '20A', ph: 'R' },
        { c: 'Q20', rack: 'L-01', breaker: '20A', ph: 'Y' },
        { c: 'Q21', rack: 'L-02', breaker: '20A', ph: 'B' },
        { c: 'Q22', rack: 'L-03', breaker: '20A', ph: 'R' },
        { c: 'Q23', rack: 'L-04', breaker: '20A', ph: 'Y' },
        { c: 'Q24', rack: 'L-05', breaker: '20A', ph: 'B' },
        { c: 'Q25', rack: 'L-06', breaker: '20A', ph: 'R' },
        { c: 'Q26', rack: 'L-07', breaker: '20A', ph: 'Y' },
        { c: 'Q27', rack: 'L-08', breaker: '20A', ph: 'B' },
        { c: 'Q28', rack: 'L-09', breaker: '20A', ph: 'R' },
        { c: 'Q29', rack: 'L-10', breaker: '20A', ph: 'Y' },
        { c: 'Q30', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q31', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q32', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q33', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q34', rack: 'L-11', breaker: '20A', ph: 'R' },
        { c: 'Q35', rack: 'L-12', breaker: '20A', ph: 'Y' },
        { c: 'Q36', rack: 'L-13', breaker: '20A', ph: 'B' },
        { c: 'Q37', rack: 'SPARE', breaker: '20A', ph: 'R' },
        { c: 'Q38', rack: 'L-15', breaker: '20A', ph: 'Y' },
        { c: 'Q39', rack: 'L-16', breaker: '20A', ph: 'B' },
        { c: 'Q40', rack: 'L-17', breaker: '20A', ph: 'R' },
        { c: 'Q41', rack: 'L-18', breaker: '20A', ph: 'Y' },
        { c: 'Q42', rack: 'L-19', breaker: '20A', ph: 'B' },
        { c: 'Q43', rack: 'SPARE', breaker: '20A', ph: 'R' },
        { c: 'Q44', rack: 'L-14', breaker: '32A', ph: 'Y' },
        { c: 'Q45', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q46', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q47', rack: 'SPARE', breaker: '32A', ph: '3' },
        { c: 'Q48', rack: 'SPARE', breaker: '32A', ph: '3' }
    ],
  }
};

/* Feed side of each PDU - used for grouping and colour. */
const DC_PDU_FEED = {
  'PDU 1': 'A', 'PDU 3': 'A', 'PDU 5': 'A', 'PDU 7': 'A',
  'PDU 6': 'B', 'PDU 2': 'B', 'PDU 4': 'B', 'PDU 8': 'B'
};


/* =============================================================
   Where the sheet URL comes from

   In this order:

     1. The URL built into DC_CONFIG above. Every PC uses it with nothing
        to set up. See the note on endpoint for what that costs and how to
        replace the URL if it is ever abused.

     2. localStorage on the device - written by a ?sheet=<url> link or by
        the banner on the Load Reading page. Only consulted when nothing is
        built in, so it can no longer pin a PC to an old URL.

   The ?sheet= link still works and is kept for a private copy with no
   URL built in; with one built in, it has nothing to do.
   ============================================================= */

var DC_ENDPOINT = (function () {
    'use strict';

    var KEY = 'koc-dc-endpoint';

    /* An Apps Script web app URL and nothing else, so a malformed or
       hostile ?sheet= is dropped rather than stored and posted to. */
    var SHAPE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

    function stored() {
        try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
    }

    /* Take ?sheet= if it is there, keep it, and remove it from the address
       so it is not bookmarked, screenshotted or forwarded by accident. */
    (function adopt() {
        var m = /[?&]sheet=([^&#]*)/.exec(location.search);
        if (!m) return;

        var url = '';
        try { url = decodeURIComponent(m[1] || ''); } catch (e) { url = ''; }
        if (SHAPE.test(url)) {
            try { localStorage.setItem(KEY, url); } catch (e) { /* private mode */ }
        }

        var qs = location.search
            .replace(/([?&])sheet=[^&#]*/, '$1')
            .replace(/[?&]$/, '')
            .replace(/\?&/, '?');
        try {
            history.replaceState(null, '', location.pathname + (qs === '?' ? '' : qs) + location.hash);
        } catch (e) { /* file:// - leave the address alone */ }
    })();

    /* The built-in URL, decoded. Checked against the same shape as ?sheet=
       so a mistyped or truncated value is ignored rather than posted to. */
    function builtIn() {
        if (typeof DC_CONFIG === 'undefined') return '';
        var url = DC_CONFIG.endpoint || '';
        if (!url && DC_CONFIG.endpointEncoded) {
            try {
                url = atob(DC_CONFIG.endpointEncoded).split('').reverse().join('');
            } catch (e) { url = ''; }
        }
        return SHAPE.test(url) ? url : '';
    }

    /* Built-in first. It is the one place the office's URL is kept, so if the
       deployment is ever replaced, editing config.js reaches every PC on its
       next load. The other way round, any PC that had stored a URL - from a
       setup link or the banner - would stay stuck on the dead one. */
    function get() {
        return builtIn() || stored() || '';
    }

    get.set = function (url) {
        try { localStorage.setItem(KEY, url); } catch (e) { /* ignore */ }
    };
    get.clear = function () {
        try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    };
    get.shape = SHAPE;
    get.builtIn = builtIn;

    return get;
})();
