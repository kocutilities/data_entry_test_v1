/* =============================================================
   KOC Data Center
   koc-criteria.js  -  the KOC requirements the assessment pages judge against.

   Every entry cites the standard, revision and clause it came from, so a
   verdict can quote its authority instead of asserting a number. Taken from
   the study in the vault:
     Substation_Vault/01-Standards/
       KOC Standards study - Data Center Load Assessment.md

   status:  'M'    mandatory - "shall", in a document titled KOC Standard
            'M-RP' "shall", in a KOC Recommended Practice
            'R'    "should" / "may" / stated as typical or guidance
            'ADV'  NOT a KOC requirement. General practice, shown as advisory.

   Almost every KOC clause ends "unless otherwise specified in the Project
   Documents". These are therefore defaults an approved project document can
   displace - not constants. Anything overridden should record what approved it.
   ============================================================= */

const KOC = {

    /* ---------- the figures that drive most calculations ---------- */

    deratingFactor: {
        value: 0.8, status: 'M-RP',
        std: 'KOC-E-003 Part 1 Rev 4', clause: '11.2.2',
        text: 'Minimum derating factor of 0.8 applied by the Manufacturer to all ' +
              'current carrying equipment other than cables and flexible cords.',
        note: 'Do not apply twice. Cl. 11.2.6 requires the nameplate to already show ' +
              'the derated continuous rating, so check which figure a plate carries.'
    },

    ambientDesign: {
        value: 50, unit: 'degC', status: 'M-RP',
        std: 'KOC-E-003 Part 1 Rev 4', clause: '11.2.1',
        text: 'Ratings shall be continuous ratings after derating for service ' +
              'conditions. Ambient temperature considered shall not be less than 50 C.'
    },

    noHvacCredit: {
        status: 'M-RP', std: 'KOC-E-003 Part 1 Rev 4', clause: '11.2.7',
        text: 'Derating factors shall be retained in air-conditioned areas, to ensure ' +
              'capacity rating in the event of HVAC failure.'
    },

    spareCapacity: {
        value: 0.15, status: 'M-RP',
        std: 'KOC-E-003 Part 1 Rev 4', clause: '9.4.1(a), 12.2, 13.2.3, 13.3.2',
        text: 'Additional spare capacity for future requirements shall be 15 % of the ' +
              'Maximum Demand, unless otherwise specified.'
    },

    diversity: {
        continuous: 1.00, intermittent: 0.30, standby: 0.10,
        status: 'R',
        std: 'KOC-E-003 Part 1 Rev 4', clause: 'Appendix II',
        text: 'Max Demand = E x 100 % + F x 30 % + G x 10 %, where E is continuous ' +
              'running load, F intermittent, G standby. Given as typical, for guidance.',
        note: 'Data centre IT load is continuous, so this gives no relief - MD is ' +
              'effectively the connected load.'
    },

    /* ---------- capacity tests ---------- */

    transformer: {
        doubleRadialFactor: {
            value: 1.15, status: 'M-RP',
            std: 'KOC-E-003 Part 1 Rev 4', clause: '12.4',
            text: 'For double radial systems, each transformer shall be sized to carry ' +
                  '115 % of the Maximum Demand.',
            note: 'The contingency test, and usually the binding one: ONE transformer ' +
                  'alone must carry 1.15 x the whole demand.'
        },
        ratingIsContinuous: {
            status: 'M', std: 'KOC-E-005 Rev 1', clause: '7.2',
            text: 'The rating of the transformer shall be continuous, after suitably ' +
                  'derated for the specified service conditions.'
        },
        temperatureRise: {
            oil: 40, winding: 50, unit: 'K', status: 'M',
            std: 'KOC-E-005 Rev 1', clause: '7.9',
            text: 'Continuous operation at full rating without exceeding a temperature ' +
                  'rise of the oil of 40 C (thermometer) and windings of 50 C (resistance).'
        },
        permissibleOverload: {
            value: null, status: 'M',
            std: 'KOC-E-005 Rev 1', clause: '7.2, 7.9',
            text: 'NONE. KOC states the transformer rating as continuous and sets no ' +
                  'permissible overload. IEC 60076-7 cyclic overload is not adopted.',
            note: 'Do not offer a short-term overload allowance without project approval.'
        },
        maxRatingLV: { value: 3, unit: 'MVA', status: 'M-RP',
            std: 'KOC-E-003 Part 1 Rev 4', clause: '12.6',
            text: 'Transformers with a 440 V / 415 V rating shall be limited to 3 MVA.' },
        noLoadVoltage: { nominal: 415, noLoad: 433, unit: 'V', status: 'M-RP',
            std: 'KOC-E-003 Part 1 Rev 4', clause: '12.7(c)' }
    },

    generator: {
        continuousRating: {
            factor: 1.15, status: 'M-RP',
            std: 'KOC-E-003 Part 1 Rev 4', clause: '13.2.3 (standby), 13.3.2 (emergency)',
            text: 'The generator set shall be continuously rated for the Maximum Demand ' +
                  'calculated plus 15 % for future addition.'
        },
        permissibleOverload: {
            value: 0.10, forMinutes: 60, inHours: 12, status: 'M',
            std: 'KOC-E-007 Rev 1', clause: '11.1.6',
            text: 'Capable of carrying an overload of 10 % of rated current for one hour ' +
                  'in any 12-hour period, within IEC 60034 temperature limits.',
            note: 'A contingency allowance, not a planning basis. Never size a new load ' +
                  'against it.'
        },
        negativeSequence: {
            value: 0.08, status: 'M',
            std: 'KOC-E-007 Rev 1', clause: '11.1.8',
            text: 'Capable of operating continuously at rated voltage and frequency on ' +
                  'an unbalanced load, at rated current containing 8 % negative sequence.',
            note: 'The ONLY continuous unbalance limit anywhere in the KOC electrical ' +
                  'standards.'
        },
        loadAcceptance: {
            firstStep: 0.60, secondStep: 0.40, secondStepDelay: 2, unit: 's',
            status: 'M', std: 'KOC-E-007 Rev 1', clause: '11.1.4'
        },
        harmonics: { thd: 0.05, individual: 0.03, status: 'M',
            std: 'KOC-E-007 Rev 1', clause: '11.1.9' }
    },

    switchgear: {
        continuousRatingDerated: {
            status: 'M', std: 'KOC-E-009 Rev 3', clause: '6.3',
            text: 'ACBs, MCCBs, contactors, CTs, busbars and other current-carrying ' +
                  'parts shall have their continuous rating as installed, after being ' +
                  'suitably derated for the specified service conditions.'
        },
        spareCompartments: {
            value: 0.15, status: 'M', std: 'KOC-E-009 Rev 3', clause: '26.1',
            text: 'LV switchgear shall be provided with 15 % fully equipped spare ' +
                  'compartments for outgoing feeders, minimum one ACB / starter of each ' +
                  'rating and one fuse-switch / MCCB of each current rating.'
        },
        incomerCarriesSpares: {
            status: 'M', std: 'KOC-E-009 Rev 3', clause: '26.2',
            text: 'The incomers, bus tie, busbars and all other components shall be ' +
                  'suitably rated to take the load including the spare compartments.',
            note: 'This is why free ways on a board are not by themselves capacity.'
        },
        ctMargin: { value: 0.20, status: 'M',
            std: 'KOC-E-002 Part 1 Rev 4', clause: '14.3',
            text: 'CT primary current rating shall be minimum 20 % more than the ' +
                  'applicable equipment rating.' }
    },

    cable: {
        ambient: { air: 50, buried: 40, unit: 'degC', status: 'M-RP',
            std: 'KOC-E-008 Rev 6', clause: '8.3.2(a)' },
        soilResistivity: { min: 2, unit: 'K.m/W', status: 'M-RP',
            std: 'KOC-E-008 Rev 6', clause: '8.3.2(b)' },
        voltageDrop: {
            lvPowerLighting: 0.025, farthestFitting: 0.05,
            lvMotorFullLoad: 0.05, lvMotorStarting: 0.15,
            hvMotorFullLoad: 0.03, status: 'M-RP',
            std: 'KOC-E-008 Rev 6', clause: '8.3.4(a)',
            note: 'The 2.5 % LV power limit is the one most often missed, and on a long ' +
                  'LV run it usually binds before current capacity does.'
        },
        deratingSource: {
            status: 'M-RP', std: 'KOC-E-003 Part 1 Rev 4', clause: '11.2.4',
            text: 'Derating factors for cables and flexible cords shall be taken from ' +
                  'BS 7671 / Manufacturers catalogues.',
            note: 'Cables are explicitly excluded from the 0.8 factor.'
        }
    },

    protection: {
        selectivityInterval: { value: 0.3, unit: 's', status: 'M-RP',
            std: 'KOC-E-006 Rev 5', clause: '8.6.6',
            text: 'Successful discrimination shall be achieved by proper settings in ' +
                  'time and current pick-up. Selectivity interval shall be 0.3 s minimum.' },
        studiesRequired: { status: 'M-RP', std: 'KOC-E-006 Rev 5', clause: '8.1.1',
            text: 'Power system studies shall be carried out at FEED and detailed ' +
                  'engineering stage and approved by KOC.' }
    },

    powerQuality: {
        powerFactor: { min: 0.95, sense: 'lagging', status: 'M-RP',
            std: 'KOC-E-003 Part 1 Rev 4 cl. 9.5.3; KOC-E-006 Rev 5 cl. 9.4.2',
            clause: '9.5.3 / 9.4.2',
            text: 'Minimum power factor shall be 0.95 lagging per MEW Regulation ' +
                  '(MEWRE Rule No. 5), monitored at the Bulk Intake Substation.' },
        supplyVariation: { voltage: 0.06, frequency: 0.025, status: 'M-RP',
            std: 'KOC-E-003 Part 1 Rev 4', clause: '9.5.2',
            text: 'Mains voltage is subject to a variation of +/- 6 % and the frequency ' +
                  'to +/- 2.5 %.' },
        busbarVoltageOnMotorStart: { min: 0.90, status: 'M-RP',
            std: 'KOC-E-006 Rev 5', clause: '9.1.4' },
        harmonics: { limit: null, status: 'M', std: 'KOC-E-016 Rev 0', clause: '8.4.1',
            text: 'THD and TDD shall comply with IEEE 519. KOC states no number of its ' +
                  'own for the distribution system - require a harmonic study.' }
    },

    upstream: {
        mewFeederLimit: { value: 5, unit: 'MW', status: 'M-RP',
            std: 'KOC-E-003 Part 1 Rev 4', clause: '9.2.2(a)',
            text: 'The maximum power that can be drawn per MEW 11 kV feeder is limited ' +
                  'to 5 MW.',
            note: 'Applies to this Data Center, which is fed from MEW Ahmadi-M.' }
    },

    ups: {
        overload: { at125pc: 10, at150pc: 1, unit: 'min', status: 'M',
            std: 'KOC-E-011 Rev 2', clause: '8.7' },
        batterySpare: { value: 0.15, status: 'M',
            std: 'KOC-E-011 Rev 2', clause: '19.1.1' },
        spareFeeders: { value: 0.15, status: 'M',
            std: 'KOC-E-011 Rev 2', clause: '20.4' }
    },

    /* ---------- NOT KOC requirements ----------
       Shown on screen only if labelled advisory. Listed here so the app has
       one place that knows the difference. */

    advisory: {
        phaseUnbalance: {
            amber: 0.10, red: 0.20, status: 'ADV',
            text: 'General engineering practice. No KOC standard sets a phase current ' +
                  'unbalance limit for transformers, switchboards, feeders or cables.',
            realKocLimit: 'Generators only: 8 % negative sequence, KOC-E-007 cl. 11.1.8.'
        },
        loadingAmber: {
            value: 0.80, status: 'ADV',
            text: 'Common practice threshold. The KOC-meaningful figure is 87 % ' +
                  '(= 1 / 1.15): above it, no further load can be added while still ' +
                  'meeting the 15 % spare capacity rule.'
        },
        balanceSinglePhaseLoads: {
            status: 'ADV',
            text: 'Good practice. No KOC clause requires single-phase loads to be ' +
                  'balanced across phases.'
        }
    }
};
