/* =============================================================
   check_deploy.js

   Is the Code.gs on this PC the one Apps Script is running?

       node apps-script/check_deploy.js

   Asks the live web app for its fingerprint (the plain /exec response)
   and compares it with Code.gs on disk. A match means the file here is
   exactly what is deployed - logic and equipment list both.

   Reads the URL from config.js, so it checks the same deployment every PC
   in the office is using. Writes nothing to the sheet.
   ============================================================= */
'use strict';

const fs = require('fs');
const { loadConfig, fingerprint, stampedIn, CODE_GS } = require('./build_allowlist.js');

function liveUrl() {
    const cfg = loadConfig();
    if (cfg.endpoint) return cfg.endpoint;
    if (cfg.endpointEncoded) {
        return Buffer.from(cfg.endpointEncoded, 'base64').toString('utf8').split('').reverse().join('');
    }
    throw new Error('No sheet URL in config.js');
}

async function main() {
    const text   = fs.readFileSync(CODE_GS, 'utf8');
    const local  = fingerprint(text);
    const stamp  = stampedIn(text);

    console.log('Code.gs on this PC   ' + local);
    if (stamp !== local) {
        console.log('\nThe fingerprint written in Code.gs (' + stamp + ') is not the hash of the');
        console.log('file around it - it was edited after the last build. Run');
        console.log('    node apps-script/build_allowlist.js');
        console.log('then paste and deploy again.');
        process.exit(2);
    }

    let live;
    try {
        const r = await fetch(liveUrl(), { redirect: 'follow' });
        live = await r.json();
    } catch (e) {
        console.log('Could not reach the web app: ' + e.message);
        process.exit(3);
    }

    const deployed = live && live.code;
    console.log('Deployed in Apps Script ' + (deployed || '(none - deployed before fingerprints existed)'));
    if (live && live.feeders) console.log('Feeders it knows      ' + live.feeders);

    if (deployed === local) {
        console.log('\nMATCH - the deployed Code.gs is exactly the file on this PC.');
        process.exit(0);
    }
    console.log('\nDIFFERENT - Apps Script is not running this file. Paste Code.gs into the');
    console.log('editor, save, then Deploy > Manage deployments > pencil > New version.');
    process.exit(1);
}

main();
