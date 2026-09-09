/* =============================================================
   KOC Data Center - the signed-in bits of the chrome
   auth-ui.js

   Names who is signed in and offers the way out. Runs on every gated
   page; auth.js has already redirected anyone who should not be here by
   the time this loads.
   ============================================================= */

(function () {
    'use strict';

    var s = (typeof KOCAuth !== 'undefined') ? KOCAuth.current() : null;
    if (!s) return;

    var who = document.getElementById('whoAmI');
    if (who) who.textContent = '· ' + (s.name || s.user);

    var btn = document.getElementById('signOut');
    if (!btn) return;

    btn.title = 'Signed in as ' + (s.name || s.user) +
                '. The session ends on its own after ' + KOCAuth.HOURS + ' hours.';

    btn.addEventListener('click', function () {
        /* Unsent readings live in a draft in this browser and are not the
           session's to throw away, so they are left alone - signing back in
           finds them still there. */
        KOCAuth.signOut();
        location.replace('login.html');
    });
})();
