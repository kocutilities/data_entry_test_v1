/* =============================================================
   KOC Data Center - Single Line Diagram
   sld.js

   Draws the SLD from sld-config.js and animates the current flow.

   The animation is not decoration: where a reading has been recorded for
   the selected date, that feeder's flow carries its measured current, and
   the dashes move faster the closer it runs to its rating. A feeder with
   no reading is drawn dimmed and still, so it is obvious at a glance which
   parts of the system have been read and which have not.
   ============================================================= */

(function () {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';
    var ENDPOINT_KEY = 'koc-dc-endpoint';
    var THEME_KEY = 'koc-dc-theme';

    var $ = function (id) { return document.getElementById(id); };
    var byId = {};
    var readings = {};
    var flowing = true;

    function el(tag, attrs, parent) {
        var n = document.createElementNS(NS, tag);
        for (var k in attrs) n.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(n);
        return n;
    }

    function endpointUrl() {
        try { return localStorage.getItem(ENDPOINT_KEY) || ''; } catch (e) { return ''; }
    }

    /* ---------------------------------------------------------
       geometry
       --------------------------------------------------------- */

    function box(n) {
        return { l: n.x - n.w / 2, r: n.x + n.w / 2,
                 t: n.y - n.h / 2, b: n.y + n.h / 2 };
    }

    /* An orthogonal route from the bottom of one node to the top of the
       next, dropping to a midpoint before stepping across. Straight where
       the two line up, which is most of the diagram. */
    function route(a, b, e) {
        var A = box(a), B = box(b);

        /* generators come in from the side, along the ATS row */
        if (a.kind === 'generator') {
            var x1 = a.x < b.x ? A.r : A.l;
            var x2 = a.x < b.x ? B.l : B.r;
            return 'M' + x1 + ' ' + a.y + ' H' + x2;
        }

        /* Anything meeting a busbar meets it where it stands. Routing to the
           bar's centre would drag the conductor sideways across whatever sits
           between, which is how ACB-3 ended up drawn through ATS-001. */
        if (b.kind === 'busbar') return 'M' + a.x + ' ' + A.b + ' V' + B.t;
        if (a.kind === 'busbar') return 'M' + b.x + ' ' + A.b + ' V' + B.t;

        /* a spine: drop past the stack, then step in from the side. Without
           it, feeding a column of boards draws each conductor through the
           boards above its own. */
        if (e && e.spine !== undefined) {
            var sx = e.spine;
            var into = sx < b.x ? B.l : B.r;
            return 'M' + a.x + ' ' + A.b + ' V' + b.y + ' H' + into;
        }

        var y0 = A.b, y1 = B.t;
        if (Math.abs(a.x - b.x) < 0.6) return 'M' + a.x + ' ' + y0 + ' V' + y1;

        var mid = y0 + (y1 - y0) * 0.45;
        return 'M' + a.x + ' ' + y0 + ' V' + mid + ' H' + b.x + ' V' + y1;
    }

    /* ---------------------------------------------------------
       readings
       --------------------------------------------------------- */

    function ratingFor(key) {
        if (!key) return null;
        var name = key.split('|')[1];
        var hit = DC_CONFIG.equipment.filter(function (e) { return e.name === name; })[0];
        return hit ? hit.rated : null;
    }

    /* How hard this node is working, 0..1+, or null if not read. */
    function loadOf(n) {
        if (!n.key) return null;
        var r = readings[n.key];
        if (!r) return null;
        var max = Math.max(Number(r.r) || 0, Number(r.y) || 0, Number(r.b) || 0);
        var rated = ratingFor(n.key);
        return { max: max, rated: rated, pct: rated ? (max / rated) * 100 : null };
    }

    function band(pct) {
        if (pct === null || pct === undefined) return '';
        return pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'ok';
    }

    /* ---------------------------------------------------------
       drawing
       --------------------------------------------------------- */

    function draw() {
        var svg = $('sld');
        svg.setAttribute('viewBox', '0 0 ' + SLD.canvas.w + ' ' + SLD.canvas.h);
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        var gEdge = el('g', { class: 'edges' }, svg);
        var gNode = el('g', { class: 'nodes' }, svg);

        SLD.nodes.forEach(function (n) { byId[n.id] = n; });

        /* edges first, so nodes sit on top of them */
        SLD.edges.forEach(function (e, i) {
            var a = byId[e.from], b = byId[e.to];
            if (!a || !b) return;
            var d = route(a, b, e);
            el('path', { d: d, class: 'wire wire-' + e.side }, gEdge);
            var f = el('path', { d: d, class: 'flow flow-' + e.side }, gEdge);
            f.dataset.from = e.from;
            e._flow = f;
        });

        SLD.nodes.forEach(function (n) {
            var b = box(n);
            var g = el('g', { class: 'node n-' + n.kind, tabindex: '0',
                              role: 'button', 'aria-label': n.label }, gNode);
            g.dataset.id = n.id;

            if (n.kind === 'busbar') {
                el('rect', { x: b.l, y: b.t, width: n.w, height: n.h,
                             rx: 6, class: 'shape' }, g);
                el('text', { x: b.l + 14, y: n.y + 5, class: 'lbl bus-lbl' }, g)
                    .textContent = n.label;
                el('text', { x: b.r - 14, y: n.y + 5, class: 'sub bus-sub',
                             'text-anchor': 'end' }, g).textContent = n.sub;
            } else if (n.kind === 'coupler') {
                el('rect', { x: b.l, y: b.t, width: n.w, height: n.h,
                             rx: 5, class: 'shape' }, g);
                el('text', { x: n.x, y: n.y + 4, class: 'lbl tiny',
                             'text-anchor': 'middle' }, g).textContent = n.label;
            } else {
                el('rect', { x: b.l, y: b.t, width: n.w, height: n.h,
                             rx: 9, class: 'shape' }, g);
                var ty = n.sub ? n.y - 3 : n.y + 5;
                el('text', { x: n.x, y: ty, class: 'lbl' + (n.small ? ' tiny' : ''),
                             'text-anchor': 'middle' }, g).textContent = n.label;
                if (n.sub) {
                    el('text', { x: n.x, y: n.y + 13, class: 'sub',
                                 'text-anchor': 'middle' }, g).textContent = n.sub;
                }
                /* a slot the measured current is written into */
                if (n.key) {
                    el('text', { x: n.x, y: b.b + 15, class: 'amps',
                                 'text-anchor': 'middle' }, g);
                }
            }

            g.addEventListener('click', function () { select(n.id); });
            g.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(n.id); }
            });
            n._g = g;
        });

        annotate();
    }

    /* Put the measured currents on, and set each flow's speed from them. */
    function annotate() {
        var read = 0, total = 0;

        SLD.nodes.forEach(function (n) {
            if (!n.key || !n._g) return;
            total++;
            var t = n._g.querySelector('.amps');
            var L = loadOf(n);
            n._g.classList.remove('ok', 'warn', 'bad', 'unread');

            if (!L) {
                if (t) t.textContent = '';
                n._g.classList.add('unread');
                return;
            }
            read++;
            if (t) {
                t.textContent = L.pct === null
                    ? L.max.toFixed(0) + ' A'
                    : L.max.toFixed(0) + ' A · ' + L.pct.toFixed(0) + '%';
            }
            var b = band(L.pct);
            if (b) n._g.classList.add(b);
        });

        /* a flow moves at a speed set by the load at the node it leaves */
        SLD.edges.forEach(function (e) {
            if (!e._flow) return;
            var L = loadOf(byId[e.from]);
            var f = e._flow;
            f.classList.remove('live', 'ok', 'warn', 'bad');
            if (!L || !L.max) {
                f.style.animationDuration = '';
                return;
            }
            f.classList.add('live');
            var b = band(L.pct);
            if (b) f.classList.add(b);
            /* 3.2s when idle down to 0.7s at rating */
            var frac = L.pct === null ? 0.4 : Math.min(L.pct / 100, 1.2);
            f.style.animationDuration = (3.2 - 2.5 * Math.min(frac, 1)).toFixed(2) + 's';
        });

        $('statRead').textContent = read + ' / ' + total;
    }

    /* ---------------------------------------------------------
       details panel
       --------------------------------------------------------- */

    function select(id) {
        var n = byId[id];
        if (!n) return;
        SLD.nodes.forEach(function (m) { if (m._g) m._g.classList.remove('sel'); });
        n._g.classList.add('sel');

        var p = $('detail');
        p.hidden = false;
        p.querySelector('.d-title').textContent = n.label;
        p.querySelector('.d-sub').textContent = n.sub || '';

        var L = loadOf(n);
        var rows = [];

        /* what feeds this, and what it feeds - the point of a topology
           drawing is the connections, so say them in words too */
        var from = SLD.edges.filter(function (e) { return e.to === n.id; })
                            .map(function (e) { return byId[e.from].label; });
        var to = SLD.edges.filter(function (e) { return e.from === n.id; })
                          .map(function (e) { return byId[e.to].label; });
        if (from.length) rows.push(['Fed from', from.join(', ')]);
        if (to.length) rows.push(['Feeds', to.length > 6
            ? to.slice(0, 5).join(', ') + ' and ' + (to.length - 5) + ' more'
            : to.join(', ')]);

        var rated = ratingFor(n.key);
        if (rated) rows.push(['Rating', rated + ' A']);
        if (L) {
            var r = readings[n.key];
            rows.push(['R / Y / B', [r.r, r.y, r.b].map(function (v) {
                return (v === '' || v === null || v === undefined) ? '—' : v;
            }).join('  /  ')]);
            rows.push(['Highest phase', L.max.toFixed(1) + ' A']);
            if (L.pct !== null) rows.push(['Loading', L.pct.toFixed(0) + '% of rating']);
        } else if (n.key) {
            rows.push(['Reading', 'not recorded for ' + $('sldDate').value]);
        }

        var tb = p.querySelector('.d-rows');
        tb.innerHTML = '';
        rows.forEach(function (r) {
            var d = document.createElement('div');
            d.className = 'd-row';
            d.innerHTML = '<span>' + r[0] + '</span><b></b>';
            d.querySelector('b').textContent = r[1];
            tb.appendChild(d);
        });

        p.querySelector('.d-note').textContent = n.note || '';
        p.querySelector('.d-note').hidden = !n.note;
    }

    /* ---------------------------------------------------------
       loading the day's readings
       --------------------------------------------------------- */

    function setBadge(msg, busy) {
        var b = $('sldStatus');
        b.innerHTML = '';
        if (busy) {
            var s = document.createElement('span');
            s.className = 'spinner';
            b.appendChild(s);
        }
        var t = document.createElement('span');
        t.textContent = msg;
        b.appendChild(t);
    }

    function load() {
        var date = $('sldDate').value;
        readings = {};

        if (!endpointUrl()) {
            setBadge('No sheet connected on this device — open the Load Reading page to connect');
            annotate();
            return Promise.resolve();
        }
        if (!date) { setBadge('Pick a date'); annotate(); return Promise.resolve(); }

        setBadge('Reading the sheet…', true);
        return fetch(endpointUrl(), {
            method: 'POST',
            body: JSON.stringify({ type: 'status', date: date })
        })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                if (!d || d.result !== 'success') throw new Error((d && d.message) || 'Unexpected response');
                readings = d.recorded || {};
                annotate();
                var n = Object.keys(readings).length;
                setBadge(n + ' reading' + (n === 1 ? '' : 's') + ' recorded for ' + date);
            })
            .catch(function (e) {
                console.error('SLD load failed:', e);
                annotate();
                setBadge('Could not read the sheet (' + e.message + ')');
            });
    }

    /* ---------------------------------------------------------
       start
       --------------------------------------------------------- */

    function applyTheme(t) {
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
    }

    function init() {
        $('sldDate').value = new Date().toISOString().slice(0, 10);

        draw();
        load();

        $('sldDate').addEventListener('change', load);
        $('sldRefresh').addEventListener('click', load);

        $('sldFlow').addEventListener('click', function () {
            flowing = !flowing;
            document.getElementById('sld').classList.toggle('paused', !flowing);
            $('sldFlow').lastElementChild.textContent = flowing ? 'Pause flow' : 'Resume flow';
        });

        $('detailClose').addEventListener('click', function () {
            $('detail').hidden = true;
            SLD.nodes.forEach(function (m) { if (m._g) m._g.classList.remove('sel'); });
        });

        $('themeBtn').addEventListener('click', function () {
            applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
        });

        var saved;
        try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
        applyTheme(saved || 'dark');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
