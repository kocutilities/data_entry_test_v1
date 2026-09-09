/* =============================================================
   KOC Data Center - sign in
   auth.js

   WHAT THIS IS, AND WHAT IT IS NOT
   -------------------------------
   This is a front door, not a lock. Every page of this app is a static
   file served straight to the browser, so the check below runs on the
   visitor's own machine with their own copy of this script. Anyone who
   opens the developer tools can read it, skip it, or type the app's URL
   directly. The password hash here is no more secret than the page it
   sits in.

   What it is good for: keeping the app off a shared or unattended screen,
   making people identify themselves before they enter readings, and
   giving a place to sign out. That is worth having, and it is honestly
   all this can do.

   Real protection needs the check to happen somewhere the visitor cannot
   reach - the Apps Script deployment already runs server side, so the
   natural step is to have IT issue each person a token, have Code.gs
   refuse a request without a valid one, and have this page obtain it.
   Until then, treat every reading as attributable only by the "Taken by"
   field, not by this login.

   CHANGING THE CREDENTIALS
   ------------------------
   USERS below holds a SHA-256 hash of the password, never the password.
   To set a new one, open the app, and in the browser console run:

       await KOCAuth.hash('the new password')

   then paste the 64-character result into the user's `hash` field. The
   supplied setup password is "test", which must not survive contact with
   anyone outside this project.
   ============================================================= */

const KOCAuth = (function () {
    'use strict';

    var KEY = 'koc-dc-session';
    var HOURS = 12;                 /* a shift, not a fortnight */

    /* username -> { hash, name }. Hash is SHA-256 of the password, hex. */
    var USERS = {
        admin: {
            /* "test" */
            hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
            name: 'Administrator'
        }
    };

    function bytesToHex(buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ('00' + b.toString(16)).slice(-2);
        }).join('');
    }

    /* Also the helper to call from the console when setting a new password. */
    function hash(text) {
        if (!(window.crypto && window.crypto.subtle)) {
            return Promise.reject(new Error('This browser has no Web Crypto'));
        }
        return window.crypto.subtle
            .digest('SHA-256', new TextEncoder().encode(String(text)))
            .then(bytesToHex);
    }

    function readSession() {
        var raw;
        try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
        if (!raw) return null;
        var s;
        try { s = JSON.parse(raw); } catch (e) { return null; }
        if (!s || !s.user || !s.until || Date.now() > s.until) {
            signOut();
            return null;
        }
        return s;
    }

    function signIn(username, password) {
        var u = String(username || '').trim().toLowerCase();
        var rec = USERS[u];

        return hash(password || '').then(function (h) {
            /* Compare in constant time out of habit. It buys nothing here -
               the hash is in the file the attacker already has - but the
               shape of the code should not teach the wrong lesson if it is
               ever lifted somewhere it does matter. */
            var expected = rec ? rec.hash : '0'.repeat(64);
            var ok = !!rec && equalish(h, expected);
            if (!ok) return { ok: false };

            var s = { user: u, name: rec.name, at: Date.now(),
                      until: Date.now() + HOURS * 3600 * 1000 };
            try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
            return { ok: true, session: s };
        });
    }

    function equalish(a, b) {
        if (a.length !== b.length) return false;
        var diff = 0;
        for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return diff === 0;
    }

    function signOut() {
        try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    }

    function current() { return readSession(); }

    /* Called at the top of every protected page. Sends the visitor to the
       login and remembers where they were headed, so signing in lands them
       where they meant to go rather than on the home page. */
    function require() {
        if (readSession()) return true;
        var here = location.pathname.split('/').pop() + location.search + location.hash;
        try { sessionStorage.setItem('koc-dc-after-login', here); } catch (e) { /* ignore */ }
        location.replace('login.html');
        return false;
    }

    return { signIn: signIn, signOut: signOut, current: current,
             require: require, hash: hash, HOURS: HOURS };
})();
