/* =============================================================
   KOC Data Center - Single Line Diagram
   sld.js

   Draws the diagram from sld-config.js and runs the current flow.

   Every energised conductor flows. The bus coupler does not, because it is
   normally open - a still, red, dashed link is the point being made there.

   Where a reading has been recorded for the chosen date, that feeder's
   flow takes its loading colour and speeds up the closer it runs to its
   rating. Where nothing has been recorded the conductor still flows, in
   its supply colour, because it is still live - the diagram is not a
   report of what was measured, it is the system.
   ============================================================= */

(function () {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';
    var ENDPOINT_KEY = 'koc-dc-endpoint';
    var THEME_KEY = 'koc-dc-theme';

    var $ = function (id) { return document.getElementById(id); };
    var byId = {};
    var readings = {};

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

    function route(a, b, e) {
        var A = box(a), B = box(b);

        /* generators and battery banks sit beside what they serve */
        if (a.kind === 'generator' || b.kind === 'battery') {
            var x1 = a.x < b.x ? A.r : A.l;
            var x2 = a.x < b.x ? B.l : B.r;
            var y = b.kind === 'battery' ? b.y : a.y;
            return 'M' + x1 + ' ' + y + ' H' + x2;
        }

        /* the A and B cords cross on their way to a zone, so curve them -
           straight orthogonal runs here turn into an unreadable lattice */
        if (e && e.curve) {
            var sy = A.b, ey = B.t;
            var cy = sy + (ey - sy) * 0.55;
            return 'M' + a.x + ' ' + sy +
                   ' C' + a.x + ' ' + cy + ' ' + b.x + ' ' + (ey - (ey - sy) * 0.55) +
                   ' ' + b.x + ' ' + ey;
        }

        /* anything meeting a busbar meets it where it stands */
        if (b.kind === 'busbar' || b.kind === 'embar') {
            return 'M' + a.x + ' ' + A.b + ' V' + B.t;
        }
        if (a.kind === 'busbar' || a.kind === 'embar') {
            return 'M' + b.x + ' ' + A.b + ' V' + B.t;
        }

        /* the coupler joins the two sections along the bar */
        if (a.kind === 'coupler' || b.kind === 'coupler') {
            var ax = a.kind === 'coupler' ? (a.x < b.x ? A.r : A.l) : (a.x < b.x ? A.r : A.l);
            var bx = a.kind === 'coupler' ? (a.x < b.x ? B.l : B.r) : (a.x < b.x ? B.l : B.r);
            return 'M' + ax + ' ' + a.y + ' H' + bx;
        }

        var y0 = A.b, y1 = B.t;
        if (Math.abs(a.x - b.x) < 0.6) return 'M' + a.x + ' ' + y0 + ' V' + y1;

        var mid = y0 + (y1 - y0) * 0.5;
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

    function loadOf(n) {
        if (!n || !n.key) return null;
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

        var gEdge = el('g', {}, svg);
        var gNode = el('g', {}, svg);

        SLD.nodes.forEach(function (n) { byId[n.id] = n; });

        SLD.edges.forEach(function (e) {
            var a = byId[e.from], b = byId[e.to];
            if (!a || !b) return;
            var d = route(a, b, e);
            el('path', { d: d, class: 'wire w-' + e.side }, gEdge);
            var f = el('path', { d: d, class: 'flow f-' + e.side }, gEdge);
            f.dataset.from = e.from;
            e._flow = f;
        });

        SLD.nodes.forEach(function (n) {
            var b = box(n);
            var g = el('g', { class: 'node n-' + n.kind + (n.side ? ' s-' + n.side : ''),
                              tabindex: '0', role: 'button', 'aria-label': n.label }, gNode);
            g.dataset.id = n.id;

            var bar = (n.kind === 'busbar' || n.kind === 'embar');
            el('rect', { x: b.l, y: b.t, width: n.w, height: n.h,
                         rx: bar ? 4 : (n.kind === 'zone' ? 8 : 7), class: 'shape' }, g);

            if (bar) {
                el('text', { x: n.x, y: n.y + 4, class: 'lbl bar-lbl',
                             'text-anchor': 'middle' }, g).textContent = n.label;
            } else {
                var lines = [n.sub, n.sub2, n.sub3].filter(Boolean);
                var top = n.y - (lines.length * 7) + 4;
                el('text', { x: n.x, y: top, class: 'lbl' + (n.small ? ' tiny' : ''),
                             'text-anchor': 'middle' }, g).textContent = n.label;
                lines.forEach(function (s, i) {
                    el('text', { x: n.x, y: top + 16 + i * 13, class: 'sub',
                                 'text-anchor': 'middle' }, g).textContent = s;
                });
                if (n.key) {
                    el('text', { x: n.x, y: b.b + 14, class: 'amps',
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
                t.textContent = L.pct === null ? L.max.toFixed(0) + ' A'
                    : L.max.toFixed(0) + ' A · ' + L.pct.toFixed(0) + '%';
            }
            var bd = band(L.pct);
            if (bd) n._g.classList.add(bd);
        });

        SLD.edges.forEach(function (e) {
            var f = e._flow;
            if (!f) return;
            f.classList.remove('live', 'ok', 'warn', 'bad');

            /* a normally open link carries nothing */
            if (e.side === 'open') { f.style.animationDuration = ''; return; }

            f.classList.add('live');

            var L = loadOf(byId[e.from]);
            if (!L || !L.max) {
                f.style.animationDuration = '2.4s';   /* live, load unknown */
                return;
            }
            var bd = band(L.pct);
            if (bd) f.classList.add(bd);
            var frac = L.pct === null ? 0.4 : Math.min(L.pct / 100, 1);
            f.style.animationDuration = (3.2 - 2.4 * frac).toFixed(2) + 's';
        });

        $('statRead').textContent = read + ' / ' + total;
    }

    /* ---------------------------------------------------------
       details
       --------------------------------------------------------- */

    function select(id) {
        var n = byId[id];
        if (!n) return;
        SLD.nodes.forEach(function (m) { if (m._g) m._g.classList.remove('sel'); });
        n._g.classList.add('sel');

        var p = $('detail');
        p.hidden = false;
        p.querySelector('.d-title').textContent = n.label;
        p.querySelector('.d-sub').textContent = [n.sub, n.sub2, n.sub3].filter(Boolean).join(' · ');

        var rows = [];
        var from = SLD.edges.filter(function (e) { return e.to === n.id; })
                            .map(function (e) { return byId[e.from].label; });
        var to = SLD.edges.filter(function (e) { return e.from === n.id; })
                          .map(function (e) { return byId[e.to].label; });
        if (from.length) rows.push(['Fed from', from.join(', ')]);
        if (to.length) rows.push(['Feeds', to.length > 6
            ? to.slice(0, 5).join(', ') + ' and ' + (to.length - 5) + ' more' : to.join(', ')]);

        var rated = ratingFor(n.key);
        if (rated) rows.push(['Rating', rated + ' A']);

        var L = loadOf(n);
        if (L) {
            var r = readings[n.key];
            rows.push(['R / Y / B', [r.r, r.y, r.b].map(function (v) {
                return (v === '' || v === null || v === undefined) ? '—' : v; }).join('  /  ')]);
            rows.push(['Highest phase', L.max.toFixed(1) + ' A']);
            if (L.pct !== null) rows.push(['Loading', L.pct.toFixed(0) + '% of rating']);
        } else if (n.key) {
            rows.push(['Reading', 'not recorded for ' + $('sldDate').value]);
        }

        var tb = p.querySelector('.d-rows');
        tb.innerHTML = '';
        rows.forEach(function (rw) {
            var d = document.createElement('div');
            d.className = 'd-row';
            d.innerHTML = '<span></span><b></b>';
            d.querySelector('span').textContent = rw[0];
            d.querySelector('b').textContent = rw[1];
            tb.appendChild(d);
        });

        p.querySelector('.d-note').textContent = n.note || '';
        p.querySelector('.d-note').hidden = !n.note;
    }

    /* ---------------------------------------------------------
       the day's readings
       --------------------------------------------------------- */

    function setBadge(msg, busy) {
        var b = $('sldStatus');
        b.innerHTML = '';
        if (busy) { var s = document.createElement('span'); s.className = 'spinner'; b.appendChild(s); }
        var t = document.createElement('span');
        t.textContent = msg;
        b.appendChild(t);
    }

    function load() {
        var date = $('sldDate').value;
        readings = {};

        if (!endpointUrl()) {
            setBadge('No sheet connected on this device — the diagram is live, the currents are not');
            annotate();
            return Promise.resolve();
        }
        if (!date) { setBadge('Pick a date'); annotate(); return Promise.resolve(); }

        setBadge('Reading the sheet…', true);
        return fetch(endpointUrl(), {
            method: 'POST', body: JSON.stringify({ type: 'status', date: date })
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

    /* ---------------------------------------------------------
       fitting the drawing to the screen
       --------------------------------------------------------- */

    var zoom = 1;

    /* Give the drawing every pixel the rest of the page is not using, so at
       Fit the whole system is on screen without scrolling. */
    function fit() {
        var wrap = document.querySelector('.sld-wrap');
        if (!wrap) return;
        var top = wrap.getBoundingClientRect().top;
        var below = 0;
        var fold = document.querySelector('.fold');
        if (fold) below += fold.getBoundingClientRect().height + 10;
        var h = Math.max(320, window.innerHeight - top - below - 34);
        document.documentElement.style.setProperty('--sld-h', Math.round(h) + 'px');
    }

    function setZoom(z) {
        zoom = Math.min(4, Math.max(0.4, z));
        document.documentElement.style.setProperty('--zoom', zoom.toFixed(3));
        $('zLevel').textContent = Math.round(zoom * 100) + '%';
    }

    function applyDock(docked) {
        document.querySelector('.app').classList.toggle('nav-docked', docked);
        var b = $('dockBtn');
        if (b) {
            b.title = docked ? 'Expand the navigation' : 'Collapse the navigation';
            b.setAttribute('aria-label', b.title);
        }
        try { localStorage.setItem('koc-dc-nav-docked', docked ? '1' : '0'); } catch (e) { /* ignore */ }
        setTimeout(fit, 220);
    }

    function init() {
        $('sldDate').value = new Date().toISOString().slice(0, 10);

        draw();
        load();

        $('sldDate').addEventListener('change', load);
        $('sldRefresh').addEventListener('click', load);

        var flowing = true;
        $('sldFlow').addEventListener('click', function () {
            flowing = !flowing;
            $('sld').classList.toggle('paused', !flowing);
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

        $('dockBtn').addEventListener('click', function () {
            applyDock(!document.querySelector('.app').classList.contains('nav-docked'));
        });
        var dock;
        try { dock = localStorage.getItem('koc-dc-nav-docked'); } catch (e) { dock = null; }
        applyDock(dock === '1');

        $('zIn').addEventListener('click', function () { setZoom(zoom * 1.25); });
        $('zOut').addEventListener('click', function () { setZoom(zoom / 1.25); });
        $('zFit').addEventListener('click', function () { setZoom(1); fit(); });
        setZoom(1);

        fit();
        window.addEventListener('resize', fit);
        document.querySelector('.fold').addEventListener('toggle', fit);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
