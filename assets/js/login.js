/* =============================================================
   KOC Data Center - sign in
   login.js

   The background draws the plant as a graph, the way the vault's own
   graph view does: the data centre at the middle, the systems that feed
   it on an inner ring, and what they feed on an outer one. The nodes are
   the equipment this app already models, so the picture is the site
   rather than an abstract flourish.

   Along the bottom sit the twelve monthly totals for last year, the two
   incomers stacked as they are metered - 358,130 kWh on Incomer 1 and
   246,310 on Incomer 2, 604,440 together.

   All of it is decoration and none of it can trap a click: the canvas is
   aria-hidden, sits below the form, and takes no pointer events.
   ============================================================= */

(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------------------------------------------------------
       the graph
       --------------------------------------------------------- */

    /* ring 0 centre, ring 1 sources, ring 2 distribution, ring 3 the load */
    var SPEC = [
        ['KOC DATA CENTER', 0, 0],

        ['TRANSFORMER A', 1, 0], ['TRANSFORMER B', 1, 0],
        ['GEN-1', 1, 0], ['GEN-2', 1, 0],
        ['ATS-001', 1, 0], ['ATS-002', 1, 0],
        ['UPS-1', 1, 0], ['UPS-2', 1, 0],

        ['ESMSB-1', 2, 0], ['ESMSB-2', 2, 0],
        ['EMSB-1', 2, 0], ['EMSB-2', 2, 0], ['EMSB-9', 2, 0],
        ['MSB-7', 2, 0], ['MSB-8', 2, 0], ['MSB-10', 2, 0],
        ['M.C.C-2', 2, 0], ['EDB-24', 2, 0], ['EDB-28', 2, 0],

        ['PDU-1', 3, 0], ['PDU-2', 3, 0], ['PDU-3', 3, 0], ['PDU-4', 3, 0],
        ['PDU-5', 3, 0], ['PDU-6', 3, 0], ['PDU-7', 3, 0], ['PDU-8', 3, 0],
        ['ZONE 1', 3, 0], ['ZONE 2', 3, 0], ['ZONE 3', 3, 0], ['ZONE 4', 3, 0],
        ['RACK-K01', 3, 0], ['BATTERY', 3, 0], ['LOAD BANK', 3, 0]
    ];

    /* last year, per month, per incomer - kWh */
    var INC1 = [20340, 18540, 23210, 26610, 34310, 37210, 44660, 37820, 34870, 31120, 24100, 25340];
    var INC2 = [16680, 15230, 17960, 18820, 22090, 22740, 26700, 22750, 22710, 21870, 18450, 20310];

    var cv = $('graph'), cx = cv.getContext('2d');
    var W = 0, H = 0, dpr = 1;
    var nodes = [], links = [];
    var pointer = { x: 0, y: 0, has: false };

    function build() {
        nodes = [];
        var byRing = [[], [], [], []];
        SPEC.forEach(function (s, i) {
            var n = { label: s[0], ring: s[1], i: i };
            nodes.push(n);
            byRing[n.ring].push(n);
        });

        /* Lay each ring out evenly, then let the drift do the rest. The
           offset per ring stops the spokes lining up into a star. */
        byRing.forEach(function (ring, r) {
            ring.forEach(function (n, k) {
                var a = (k / ring.length) * Math.PI * 2 + r * 0.62;
                n.a = a;
                n.r = r;
                n.spin = (r === 0 ? 0 : (r % 2 ? 1 : -1) * (0.00006 + 0.00002 * r));
                n.bob = Math.random() * Math.PI * 2;
                n.bobRate = 0.0004 + Math.random() * 0.0004;
            });
        });

        /* every node hangs off one in the ring above it */
        links = [];
        nodes.forEach(function (n) {
            if (n.ring === 0) return;
            var up = nodes.filter(function (m) { return m.ring === n.ring - 1; });
            var best = up[0], bd = Infinity;
            up.forEach(function (m) {
                var d = Math.abs(Math.atan2(Math.sin(n.a - m.a), Math.cos(n.a - m.a)));
                if (d < bd) { bd = d; best = m; }
            });
            links.push({ a: best, b: n, phase: Math.random() * Math.PI * 2 });
        });
    }

    function place(t) {
        var cxm = W / 2, cym = H * 0.46;
        var unit = Math.min(W, H) * 0.148;
        var px = pointer.has ? (pointer.x - cxm) / W : 0;
        var py = pointer.has ? (pointer.y - cym) / H : 0;

        nodes.forEach(function (n) {
            var ang = n.a + (reduced ? 0 : n.spin * t);
            var rad = n.r * unit + (reduced ? 0 : Math.sin(n.bob + t * n.bobRate) * unit * 0.055);
            /* the outer rings shift a little more, which reads as depth */
            var par = 1 + n.r * 0.5;
            n.x = cxm + Math.cos(ang) * rad + px * 22 * par;
            n.y = cym + Math.sin(ang) * rad * 0.82 + py * 16 * par;
        });
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = cv.clientWidth; H = cv.clientHeight;
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ---------------------------------------------------------
       the consumption bars
       --------------------------------------------------------- */

    function drawBars() {
        var peak = 0;
        for (var i = 0; i < 12; i++) peak = Math.max(peak, INC1[i], INC2[i]);

        var padX = Math.max(24, W * 0.06);
        var span = W - padX * 2;
        var slot = span / 12;
        var bw = Math.min(slot * 0.3, 30);
        var base = H - Math.max(26, H * 0.055);
        var tall = Math.min(H * 0.30, 210);

        cx.save();
        cx.globalAlpha = 0.27;
        for (var m = 0; m < 12; m++) {
            var x = padX + slot * m + slot / 2;
            [[INC1[m], 'rgba(76,125,255,'], [INC2[m], 'rgba(139,92,246,']].forEach(function (p, k) {
                var h = (p[0] / peak) * tall;
                var bx = x + (k ? 2 : -bw - 2);
                var g = cx.createLinearGradient(0, base - h, 0, base);
                g.addColorStop(0, p[1] + '0.95)');
                g.addColorStop(1, p[1] + '0.05)');
                cx.fillStyle = g;
                cx.beginPath();
                if (cx.roundRect) cx.roundRect(bx, base - h, bw, h, [3, 3, 0, 0]);
                else cx.rect(bx, base - h, bw, h);
                cx.fill();
            });
        }
        /* the baseline the bars stand on */
        cx.globalAlpha = 0.20;
        cx.strokeStyle = '#93a1bf';
        cx.lineWidth = 1;
        cx.beginPath(); cx.moveTo(padX, base + .5); cx.lineTo(W - padX, base + .5); cx.stroke();
        cx.restore();
    }

    /* ---------------------------------------------------------
       paint
       --------------------------------------------------------- */

    var RING_TINT = ['#8b5cf6', '#4c7dff', '#38bdf8', '#5eead4'];

    function draw(t) {
        cx.clearRect(0, 0, W, H);
        drawBars();
        place(t);

        /* links first, so the nodes sit on top of them */
        links.forEach(function (l) {
            var pulse = reduced ? 0.5 : (Math.sin(t * 0.0012 + l.phase) * 0.5 + 0.5);
            cx.strokeStyle = 'rgba(120,150,220,' + (0.05 + pulse * 0.10).toFixed(3) + ')';
            cx.lineWidth = l.b.ring === 1 ? 1.3 : 0.9;
            cx.beginPath();
            cx.moveTo(l.a.x, l.a.y);
            cx.lineTo(l.b.x, l.b.y);
            cx.stroke();

            /* a spark running the length of the link, the current flowing */
            if (!reduced) {
                var f = ((t * 0.00016 + l.phase) % 1);
                var sx = l.a.x + (l.b.x - l.a.x) * f;
                var sy = l.a.y + (l.b.y - l.a.y) * f;
                cx.fillStyle = 'rgba(150,190,255,' + (0.30 * (1 - Math.abs(f - .5) * 2) + 0.05).toFixed(3) + ')';
                cx.beginPath(); cx.arc(sx, sy, 1.5, 0, 7); cx.fill();
            }
        });

        nodes.forEach(function (n) {
            var isHub = n.ring === 0;
            var rad = isHub ? 9 : n.ring === 1 ? 5 : n.ring === 2 ? 3.6 : 2.8;
            var tint = RING_TINT[n.ring];

            cx.save();
            cx.shadowColor = tint;
            cx.shadowBlur = isHub ? 26 : 12;
            cx.fillStyle = tint;
            cx.globalAlpha = isHub ? 0.95 : n.ring === 1 ? 0.8 : 0.6;
            cx.beginPath(); cx.arc(n.x, n.y, rad, 0, 7); cx.fill();
            cx.restore();

            if (isHub) {
                cx.save();
                cx.globalAlpha = 0.28;
                cx.strokeStyle = tint; cx.lineWidth = 1.2;
                var halo = 16 + (reduced ? 0 : Math.sin(t * 0.0011) * 4);
                cx.beginPath(); cx.arc(n.x, n.y, halo, 0, 7); cx.stroke();
                cx.restore();
            }

            /* Labels only where they will not turn into a smear: the hub
               and the inner ring on any screen, the middle ring only when
               there is room for it. */
            var show = isHub || n.ring === 1 || (n.ring === 2 && W > 900);
            if (!show) return;
            cx.save();
            cx.globalAlpha = isHub ? 0.62 : n.ring === 1 ? 0.40 : 0.22;
            cx.fillStyle = '#c7d3f0';
            cx.font = (isHub ? '600 11px ' : '500 9.5px ') +
                      '-apple-system, "Segoe UI", system-ui, sans-serif';
            cx.textAlign = 'center';
            cx.fillText(n.label, n.x, n.y - (isHub ? 18 : 11));
            cx.restore();
        });
    }

    var raf = null;
    function loop(t) {
        draw(t);
        raf = requestAnimationFrame(loop);
    }

    function start() {
        resize();
        build();
        /* Paint once, synchronously. requestAnimationFrame does not run on a
           hidden page, so a tab opened in the background would otherwise show
           a blank canvas until it was looked at. */
        draw(0);
        if (reduced) return;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', function () { resize(); build(); if (reduced) draw(0); });
    window.addEventListener('pointermove', function (e) {
        pointer.x = e.clientX; pointer.y = e.clientY; pointer.has = true;
    }, { passive: true });
    /* a background animation has no business running on a hidden tab */
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = null; } }
        else if (!reduced && !raf) raf = requestAnimationFrame(loop);
    });

    /* ---------------------------------------------------------
       the form
       --------------------------------------------------------- */

    function say(kind, text) {
        var m = $('loginMsg');
        m.className = 'login-msg show ' + kind;
        m.textContent = text;
    }
    function clearSay() { $('loginMsg').className = 'login-msg'; }

    $('peek').addEventListener('click', function () {
        var p = $('pass');
        var show = p.type === 'password';
        p.type = show ? 'text' : 'password';
        this.textContent = show ? 'HIDE' : 'SHOW';
        this.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        p.focus();
    });

    $('loginForm').addEventListener('submit', function (e) {
        e.preventDefault();
        clearSay();

        var u = $('user').value.trim();
        var p = $('pass').value;
        if (!u || !p) {
            say('bad', 'Enter both a username and a password.');
            (!u ? $('user') : $('pass')).focus();
            return;
        }

        var btn = $('signIn');
        btn.setAttribute('aria-busy', 'true');
        btn.lastElementChild.textContent = 'Checking…';

        KOCAuth.signIn(u, p).then(function (r) {
            if (!r.ok) {
                btn.removeAttribute('aria-busy');
                btn.lastElementChild.textContent = 'Sign in';
                say('bad', 'That username and password do not match.');
                $('pass').value = '';
                $('pass').focus();
                return;
            }
            say('ok', 'Signed in. Opening the system…');
            var to = 'index.html';
            try {
                var want = sessionStorage.getItem('koc-dc-after-login');
                if (want) { to = want; sessionStorage.removeItem('koc-dc-after-login'); }
            } catch (err) { /* ignore */ }
            setTimeout(function () { location.replace(to); }, 380);
        }).catch(function (err) {
            btn.removeAttribute('aria-busy');
            btn.lastElementChild.textContent = 'Sign in';
            say('bad', 'Could not sign in (' + err.message + ').');
        });
    });

    /* already signed in - do not make them do it twice */
    if (KOCAuth.current()) {
        var to = 'index.html';
        try {
            var want = sessionStorage.getItem('koc-dc-after-login');
            if (want) { to = want; sessionStorage.removeItem('koc-dc-after-login'); }
        } catch (e) { /* ignore */ }
        location.replace(to);
    } else {
        start();
        $('user').focus();
    }
})();
