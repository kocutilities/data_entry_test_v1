/* =============================================================
   KOC Data Center - cabinet load page
   cabinets.js

   Draws what cabinet-model.js works out. All the engineering - the
   ratings, the failover, the status - is in the model and tested there;
   this file only fetches one date's readings and lays the answer out.
   ============================================================= */

(function () {
    'use strict';

    var M = DC_CABINETS;
    var LATEST_KEY = 'koc-dc-latest-date';
    var THEME_KEY  = 'koc-dc-theme';

    var LABEL = { normal: 'Normal', high: 'High Load', critical: 'Critical', overload: 'Overload',
                  unread: 'Not read', incomplete: 'Incomplete' };
    /* worst first: an unassessable cabinet sits above Normal - it is an
       unknown, not a pass */
    var RANK = { overload: 6, critical: 5, high: 4, incomplete: 3, unread: 2, normal: 1 };

    var built   = M.build();
    var results = [];
    var pairs   = [];
    var emsb    = {};
    var shownDate = null;

    /* Which failure the summary, map and table are showing: 'pdu' is the
       worst of either PDU failing; 'A' / 'B' is that whole feed lost, as
       it would be if EMSB-1 / EMSB-2 failed. */
    var scenario = 'pdu';
    var emsbView = 'EMSB 1';
    var CASE = {
        pdu: { hint: 'status is the worst surviving breaker if either PDU fails',
               when: 'if one PDU failed', short: 'a PDU loss' },
        A:   { hint: 'status if EMSB-1 fails — Feed A lost, every cabinet on its Feed B breaker',
               when: 'if EMSB-1 failed', short: 'losing EMSB-1' },
        B:   { hint: 'status if EMSB-2 fails — Feed B lost, every cabinet on its Feed A breaker',
               when: 'if EMSB-2 failed', short: 'losing EMSB-2' }
    };
    var CASE_EMSB = { A: 'EMSB 1', B: 'EMSB 2' };
    var filter = { q: '', status: '', zone: '', sort: 'risk' };

    function $(id) { return document.getElementById(id); }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined && text !== null) n.textContent = text;
        return n;
    }

    function fmt(n, dp) {
        if (n === null || n === undefined || !isFinite(n)) return '—';
        return n.toFixed(dp === undefined ? 1 : dp);
    }

    /* A status-deciding percentage. The status lines are at 87, 100 and 125 %,
       and rounding to a whole number near them misleads: 99.6 % and 100.4 %
       would both read "100 %" but fall either side of the continuous rating.
       So one decimal inside that band, whole numbers outside it. */
    function pct(p) {
        if (p === null || p === undefined || !isFinite(p)) return '—';
        return fmt(p, p >= 80 && p < 130 ? 1 : 0) + ' %';
    }

    function ymd(s) {
        var p = String(s || '').split('-');
        return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : s;
    }

    function short(name) { return String(name).replace(/^cabin\s*/i, ''); }

    function endpointUrl() {
        return (typeof DC_ENDPOINT === 'function') ? DC_ENDPOINT() : '';
    }

    function setStatus(msg, busy) {
        var s = $('status');
        s.innerHTML = '';
        s.className = 'field-note';
        if (busy) s.appendChild(el('span', 'spinner'));
        s.appendChild(el('span', '', msg));
    }

    /* ---------------------------------------------------------
       data
       --------------------------------------------------------- */

    function ask(date) {
        return fetch(endpointUrl(), { method: 'POST', body: JSON.stringify({ type: 'status', date: date }) })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                if (!d || d.result !== 'success') throw new Error((d && d.message) || 'Unexpected reply');
                return d;
            });
    }

    function fillDates(dates, chosen) {
        var sel = $('date');
        var list = (dates || []).slice().sort().reverse();
        if (list.indexOf(chosen) === -1) list.unshift(chosen);
        sel.innerHTML = '';
        list.forEach(function (d) {
            var o = el('option', '', ymd(d));
            o.value = d;
            sel.appendChild(o);
        });
        sel.value = chosen;
    }

    /* auto = opened fresh, so follow the sheet to its latest date */
    function load(date, auto) {
        if (!endpointUrl()) { setStatus('No sheet connected on this device.'); return; }
        setStatus('Reading ' + ymd(date) + ' from the sheet…', true);

        ask(date).then(function (d) {
            if (auto && d.latest && d.latest !== date) {
                try { localStorage.setItem(LATEST_KEY, d.latest); } catch (e) { /* ignore */ }
                return load(d.latest, false);
            }
            shownDate = date;
            fillDates(d.dates, date);
            var rec = d.recorded || {};
            results = built.cabinets.map(function (c) { return M.analyse(c, rec); });
            pairs = M.pduPairs(rec);
            emsb = { 'EMSB 1': M.emsbLoss(rec, results, 'EMSB 1'),
                     'EMSB 2': M.emsbLoss(rec, results, 'EMSB 2') };
            setStatus(Object.keys(rec).length + ' readings recorded for ' + ymd(date));
            render();
        }).catch(function (e) {
            console.error('Cabinet load failed:', e);
            setStatus('Could not read the sheet (' + e.message + ').');
        });
    }

    /* ---------------------------------------------------------
       the failure case in view
       --------------------------------------------------------- */

    function stateOf(r) { return scenario === 'pdu' ? r.state : M.stateOnFeedLoss(r, scenario); }

    /* the failover that decides the status in this case */
    function govOf(r) {
        if (scenario === 'pdu') return r.governing;
        return scenario === 'A' ? r.loseA : r.loseB;
    }
    function lostSideOf(r) { return scenario === 'pdu' ? r.governingLost : scenario; }

    function setCase(c) {
        scenario = c;
        if (CASE_EMSB[c]) emsbView = CASE_EMSB[c];
        filter.status = '';
        $('fStatus').value = '';
        renderCase(); renderTally(); renderFindings(); renderScen(); renderEmsb(); renderMap(); renderTable();
    }

    function renderCase() {
        $('caseHint').textContent = CASE[scenario].hint;
        Array.prototype.forEach.call(document.querySelectorAll('.casebar button'), function (b) {
            var on = b.getAttribute('data-case') === scenario;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    /* ---------------------------------------------------------
       summary
       --------------------------------------------------------- */

    function counts() {
        var c = { normal: 0, high: 0, critical: 0, overload: 0, missing: 0 };
        results.forEach(function (r) {
            var st = stateOf(r);
            if (st === 'unread' || st === 'incomplete') c.missing++;
            else c[st]++;
        });
        return c;
    }

    function renderTally() {
        var c = counts(), host = $('tally');
        host.innerHTML = '';
        var assessed = results.length - c.missing;
        var tiles = [
            { key: '',         k: 'Assessed',  v: assessed, s: 'of ' + results.length + ' cabinets', cls: '' },
            { key: 'normal',   k: 'Normal',    v: c.normal,   s: 'margin intact',          cls: 'st-normal' },
            { key: 'high',     k: 'High Load', v: c.high,     s: 'within rating',          cls: 'st-high' },
            { key: 'critical', k: 'Critical',  v: c.critical, s: 'above rating',           cls: 'st-critical' },
            { key: 'overload', k: 'Overload',  v: c.overload, s: 'would trip',             cls: 'st-overload' },
            { key: 'missing',  k: 'Not read',  v: c.missing,  s: 'no status given',        cls: 'st-unread' }
        ];
        tiles.forEach(function (t) {
            var d = el('div', 't ' + t.cls + (filter.status === t.key && t.key ? ' on' : ''));
            d.appendChild(el('div', 'k', t.k));
            d.appendChild(el('div', 'v', String(t.v)));
            d.appendChild(el('div', 's', t.s));
            d.title = t.key ? 'Show only ' + t.k : 'Show all';
            d.addEventListener('click', function () {
                filter.status = filter.status === t.key ? '' : t.key;
                $('fStatus').value = filter.status;
                renderTally(); renderTable();
                $('table').scrollIntoView({ block: 'start' });
            });
            host.appendChild(d);
        });

        var bar = $('distbar');
        bar.innerHTML = '';
        ['normal', 'high', 'critical', 'overload', 'missing'].forEach(function (k) {
            if (!c[k]) return;
            var s = el('span', k === 'missing' ? 'st-unread' : 'st-' + k);
            s.style.width = (c[k] / results.length * 100) + '%';
            s.title = (k === 'missing' ? 'Not read' : LABEL[k]) + ': ' + c[k];
            bar.appendChild(s);
        });
    }

    function icon(path) {
        var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'fi');
        s.setAttribute('fill', 'none'); s.setAttribute('stroke-width', '2');
        s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', path); s.appendChild(p);
        return s;
    }
    var WARN = 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z';
    var INFO = 'M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z';

    function finding(cls, html, path) {
        var f = el('div', 'finding ' + cls);
        f.appendChild(icon(path || WARN));
        var t = el('div'); t.innerHTML = html; f.appendChild(t);
        return f;
    }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* The governing breaker in one failure case, in words. */
    function failWords(r) {
        var f = govOf(r), w = f.worst, side = lostSideOf(r);
        var lost = scenario === 'pdu' ? (side === 'A' ? r.cab.A : r.cab.B)[0].pdu
                                      : 'EMSB-' + (side === 'A' ? 1 : 2);
        return esc(short(r.cab.name)) + ' — ' + fmt(w.I) + ' A on ' + w.ch.way.pdu + ' ' + w.ch.way.q +
               ' (' + w.ch.plate + ' A) if ' + lost + ' fails';
    }

    function renderFindings() {
        var host = $('findings');
        host.innerHTML = '';

        var when = CASE[scenario].when;
        var over = results.filter(function (r) { return stateOf(r) === 'overload'; });
        if (over.length) {
            host.appendChild(finding('st-overload',
                '<b>' + over.length + ' cabinet' + (over.length === 1 ? '' : 's') +
                ' would lose power ' + when + '</b> — the surviving breaker would carry more ' +
                'than its plate rating and trip. ' + over.map(failWords).join('; ') + '.'));
        }

        var crit = results.filter(function (r) { return stateOf(r) === 'critical'; });
        if (crit.length) {
            host.appendChild(finding('st-critical',
                '<b>' + crit.length + ' cabinet' + (crit.length === 1 ? '' : 's') +
                ' would run above their continuous rating ' + when + '</b> — they would hold, ' +
                'but not for long. ' + crit.map(failWords).join('; ') + '.'));
        }

        /* the zones where a whole PDU is close to its partner's limit */
        pairs.forEach(function (p) {
            /* with a whole feed as the case, the direction is fixed by it */
            var g = scenario === 'A' ? p.loseA : scenario === 'B' ? p.loseB : p.governing;
            if (!g || g.state === 'unread' || g.state === 'normal') return;
            var cause = scenario === 'pdu' ? 'if ' + g.lost + ' fails'
                                           : 'if EMSB-' + (scenario === 'A' ? 1 : 2) + ' fails';
            host.appendChild(finding('st-' + g.state,
                '<b>Zone ' + p.zone + ': ' + cause + ', ' + g.surv + '’s incomer would carry ' +
                fmt(g.peak) + ' A</b> on ' + g.peakPh + ' phase — ' + pct(g.pctCont) + ' of its ' +
                fmt(g.cont, 0) + ' A continuous rating, ' + fmt(g.headroom) + ' A to spare. The PDU ' +
                'incomer, not any cabinet breaker, is the limit here.'));
        });

        /* breakers of different sizes on the two feeds */
        var mism = built.cabinets.reduce(function (s, c) { return s + c.mismatch.length; }, 0);
        if (mism) {
            var byZone = {};
            built.cabinets.forEach(function (c) {
                c.mismatch.forEach(function (m) {
                    var k = 'Zone ' + c.zone;
                    byZone[k] = (byZone[k] || 0) + 1;
                });
            });
            host.appendChild(finding('st-high',
                '<b>' + mism + ' paired ways have a smaller breaker on one feed than the other</b> (' +
                Object.keys(byZone).map(function (k) { return k + ': ' + byZone[k]; }).join(', ') +
                '). After a failure the smaller one carries the whole cabinet, so it — not the larger ' +
                '— sets how much the cabinet can safely draw. Flagged on each row below.', INFO));
        }

        var miss = results.filter(function (r) { return r.state === 'unread' || r.state === 'incomplete'; });
        if (miss.length) {
            host.appendChild(finding('st-unread',
                '<b>' + miss.length + ' cabinet' + (miss.length === 1 ? '' : 's') + ' cannot be assessed ' +
                'for ' + ymd(shownDate) + '</b> — ' + miss.map(function (r) {
                    return esc(short(r.cab.name)) + ' (' + r.unread.map(function (w) { return w.pdu + ' ' + w.q; }).join(', ') +
                           ' not read)';
                }).join('; ') + '. An unread breaker is not counted as 0 A.', INFO));
        }
    }

    /* ---------------------------------------------------------
       whole-PDU failover
       --------------------------------------------------------- */

    function meter(amps, plate, cls) {
        var m = el('div', 'meter ' + (cls || ''));
        var i = el('i'); i.style.width = Math.min(100, amps / plate * 100) + '%';
        var t = el('span', 'tick'); t.style.left = (M.CONT * 100) + '%';
        t.title = 'Continuous rating, ' + (M.CONT * 100) + ' % of the plate';
        m.appendChild(i); m.appendChild(t);
        return m;
    }

    function renderPairs() {
        var host = $('pairs');
        host.innerHTML = '';
        pairs.forEach(function (p) {
            var card = el('div', 'pair st-' + p.state);
            var h = el('h3', '', 'Zone ' + p.zone);
            h.appendChild(el('span', 'spill st-' + p.state, LABEL[p.state]));
            card.appendChild(h);
            card.appendChild(el('div', 'who', p.a + ' (Feed A)  ↔  ' + p.b + ' (Feed B)'));

            /* Whichever PDU survives carries the sum of both, phase by phase, so
               with equal incomer ratings the two directions give the same answer.
               Say it once rather than print an identical line twice. */
            var x = p.loseA, y = p.loseB;
            var same = x.state !== 'unread' && y.state !== 'unread' &&
                       Math.abs(x.peak - y.peak) < 1e-9 && x.plate === y.plate;
            var cases = same ? [{ d: x, label: 'Lose either → the other' }]
                             : [{ d: x, label: 'Lose ' + x.lost + ' → ' + x.surv },
                                { d: y, label: 'Lose ' + y.lost + ' → ' + y.surv }];
            cases.forEach(function (k) {
                var d = k.d;
                if (d.state === 'unread') {
                    card.appendChild(el('div', 'line dim', 'Lose ' + d.lost + ': incomer not read'));
                    return;
                }
                var line = el('div', 'line');
                line.appendChild(el('span', 'l', k.label));
                line.appendChild(el('span', '', fmt(d.peak) + ' A · ' + pct(d.pctCont)));
                card.appendChild(line);
                card.appendChild(meter(d.peak, d.plate, 'st-' + d.state));
            });
            if (p.governing) {
                card.appendChild(el('div', 'line dim',
                    fmt(p.governing.headroom) + ' A spare on the worst phase'));
            }
            host.appendChild(card);
        });
    }

    /* ---------------------------------------------------------
       a whole EMSB lost
       --------------------------------------------------------- */

    var STEP = { tr: 'Transformer', ats: 'Transfer switch', emsb: 'UPS input board', ups: 'UPS',
                 esmsb: 'UPS output board', gen: 'Generator' };
    var SCALE = 125;          /* bars run 0-125 % of continuous: a breaker's plate */

    function feedName(f) { return 'Feed ' + f; }

    /* hundreds of amps read better whole; a PDU's tens keep their decimal */
    function amps(n) { return fmt(n, n >= 200 ? 0 : 1); }

    /* now (pale) and what it takes on from the lost feed (solid) */
    function loadBar(nowPct, afterPct) {
        var b = el('div', 'lbar');
        var n = Math.min(100, Math.max(0, nowPct / SCALE * 100));
        var a = Math.min(100, Math.max(0, afterPct / SCALE * 100));
        var now = el('i', 'now'); now.style.width = n + '%';
        var add = el('i', 'add'); add.style.left = n + '%'; add.style.width = Math.max(0, a - n) + '%';
        b.appendChild(now); b.appendChild(add);
        [[M.MARGIN, 'tk', 'The 15 % margin: 87 % of continuous'],
         [100, 'tk c100', 'Continuous rating']].forEach(function (t) {
            var k = el('span', t[1]); k.style.left = (t[0] / SCALE * 100) + '%'; k.title = t[2];
            b.appendChild(k);
        });
        return b;
    }

    /* The whole case in a sentence or two, worst thing first. */
    function emsbWords(e) {
        var surv = feedName(e.survFeed), c = e.cabinets;
        var path = e.chain.filter(function (d) { return d.state !== 'unread'; });
        var top = path.reduce(function (m, d) { return !m || d.pct > m.pct ? d : m; }, null);
        var pduTop = e.pdus.filter(function (d) { return d.state !== 'unread'; })
            .reduce(function (m, d) { return !m || d.pct > m.pct ? d : m; }, null);

        var bad = [];
        e.chain.concat(e.pdus).forEach(function (d) {
            if (d.state === 'overload' || d.state === 'critical') bad.push(d);
        });
        var cabName = function (x) { return esc(short(x.res.cab.name)); };
        var over = c.worst.filter(function (x) { return x.state === 'overload'; });
        var crit = c.worst.filter(function (x) { return x.state === 'critical'; });

        var head;
        if (e.state === 'overload') {
            head = '<b>' + surv + ' cannot carry every cabinet if ' + e.board + ' fails.</b> ' +
                   (over.length ? over.map(function (x) {
                       return cabName(x) + ' would trip — ' + fmt(x.worst.I) + ' A on ' + x.worst.ch.way.pdu + ' ' +
                              x.worst.ch.way.q + ', a ' + x.worst.ch.plate + ' A breaker';
                   }).join('; ') + '. ' : '') +
                   bad.filter(function (d) { return d.state === 'overload'; }).map(function (d) {
                       return esc(d.name) + ' would be over its limit (' + pct(d.pct) + ').';
                   }).join(' ') +
                   (crit.length ? ' ' + crit.length + ' more would run above continuous rating: ' +
                                  crit.map(cabName).join(', ') + '.' : '');
        } else if (e.state === 'critical') {
            var names = crit.map(cabName).concat(bad.map(function (d) { return esc(d.name); }));
            head = '<b>' + surv + ' would hold the room if ' + e.board + ' fails, but not for long.</b> ' +
                   names.join(', ') + (names.length === 1 ? ' would' : ' would all') +
                   ' run above continuous rating.';
        } else if (e.state === 'high') {
            head = '<b>' + surv + ' can carry the whole room if ' + e.board + ' fails</b>, within every rating — ' +
                   'but the 15 % margin is used' +
                   (pduTop && pduTop.state === 'high' ? ' at the ' + esc(pduTop.name) + ' (' + pct(pduTop.pct) + ')' : '') + '.';
        } else {
            head = '<b>' + surv + ' can carry the whole room if ' + e.board + ' fails</b>, with the 15 % margin intact everywhere.';
        }

        var tail = top ? ' Upstream, the supply path is not the limit: its busiest device, ' + esc(top.name) +
                         ', would reach ' + pct(top.pct) + ' of its continuous rating.' : '';
        if (top && (top.state === 'critical' || top.state === 'overload' || top.state === 'high')) {
            tail = ' On the supply path, ' + esc(top.name) + ' would reach ' + pct(top.pct) + '.';
        }
        var miss = e.unread.length || c.missing
            ? ' Not assessed: ' + e.unread.map(function (d) { return esc(d.name); }).concat(
                  c.missing ? [c.missing + ' cabinet' + (c.missing === 1 ? '' : 's') + ' with an unread breaker'] : []).join(', ') + '.'
            : '';
        return head + tail + miss;
    }

    function renderScen() {
        var host = $('scen');
        host.innerHTML = '';
        ['EMSB 1', 'EMSB 2'].forEach(function (w) {
            var e = emsb[w];
            if (!e) return;
            var b = el('button', 'scard st-' + e.state + (emsbView === w ? ' on' : ''));
            b.type = 'button';
            b.setAttribute('aria-pressed', emsbView === w ? 'true' : 'false');
            var top = el('div', 'sc-top');
            top.appendChild(el('span', 'sc-name', e.board + ' fails'));
            top.appendChild(el('span', 'spill st-' + e.state, LABEL[e.state]));
            b.appendChild(top);
            b.appendChild(el('div', 'sc-sub', feedName(e.lostFeed) + ' lost · ' + e.survUps + ' and ' +
                                              e.survPdus.join(', ') + ' carry every cabinet'));

            var c = e.cabinets, key = el('div', 'sc-key');
            var ups = e.chain.filter(function (d) { return d.id === 'ups'; })[0];
            var bits = [];
            if (c.overload) bits.push('<b>' + c.overload + ' cabinet' + (c.overload === 1 ? '' : 's') + ' would trip</b>');
            if (c.critical) bits.push('<b>' + c.critical + ' above rating</b>');
            if (c.high) bits.push(c.high + ' at high load');
            var pduTop = e.pdus.filter(function (d) { return d.state !== 'unread'; })
                .reduce(function (m, d) { return !m || d.pct > m.pct ? d : m; }, null);
            if (pduTop) bits.push(esc(pduTop.name) + ' ' + pct(pduTop.pct));
            if (ups && ups.state !== 'unread') bits.push(esc(ups.name) + ' ' + fmt(ups.kva, 0) + ' kVA (' + pct(ups.pct) + ')');
            key.innerHTML = bits.join(' · ');
            b.appendChild(key);

            b.addEventListener('click', function () { emsbView = w; renderScen(); renderEmsb(); });
            host.appendChild(b);
        });
    }

    function devNode(d, step, extraCls) {
        var n = el('div', 'node st-' + d.state + (extraCls ? ' ' + extraCls : ''));
        var head = el('div', 'nd-head');
        var t = el('div');
        t.appendChild(el('div', 'nd-step', step));
        t.appendChild(el('div', 'nd-name', d.name));
        t.appendChild(el('div', 'nd-sub', d.sub + (d.plateText ? ' · ' + d.plateText : '')));
        head.appendChild(t);

        var fig = el('div', 'nd-fig');
        if (d.state === 'unread') {
            fig.appendChild(el('span', 'spill st-unread', 'Not read'));
            head.appendChild(fig); n.appendChild(head);
            n.appendChild(el('div', 'nd-how', 'Cannot assess — ' + d.missing + '.'));
            return n;
        }
        fig.appendChild(el('div', 'nd-amps', amps(d.peak) + ' A'));
        fig.appendChild(el('div', 'nd-pct', pct(d.pct) + ' of ' + fmt(d.cont, 0) + ' A continuous'));
        fig.appendChild(el('span', 'spill st-' + d.state, LABEL[d.state]));
        head.appendChild(fig);
        n.appendChild(head);

        n.appendChild(loadBar(d.nowPct, d.pct));
        n.appendChild(el('div', 'nd-foot',
            'now ' + amps(d.nowPeak) + ' A → ' + amps(d.peak) + ' A on ' + d.peakPh + ' phase · ' +
            (d.headroom >= 0 ? amps(d.headroom) + ' A to continuous' : amps(-d.headroom) + ' A over continuous') +
            (d.kva ? ' · ' + fmt(d.kva, 0) + ' of ' + d.kvaPlate + ' kVA' : '')));
        if (d.how) n.appendChild(el('div', 'nd-how', d.how));
        if (d.ifFull) {
            n.appendChild(el('div', 'nd-how note',
                d.unmetered.name + ' (' + d.unmetered.way + ') is on this board and not metered. Even at its full ' +
                d.unmetered.plate + ' A this would be ' + amps(d.ifFull.peak) + ' A, ' + pct(d.ifFull.pct) +
                ' — ' + LABEL[d.ifFull.state] + '.'));
        }
        return n;
    }

    function worstOf(list) {
        var r = list.filter(function (d) { return d.state !== 'unread'; });
        return r.reduce(function (m, d) {
            return !m || M.STATUS.indexOf(d.state) > M.STATUS.indexOf(m.state) ||
                   (d.state === m.state && d.pct > m.pct) ? d : m;
        }, null);
    }

    function pduNode(e) {
        var w = worstOf(e.pdus);
        var anyUnread = e.pdus.some(function (d) { return d.state === 'unread'; });
        var st = w ? (anyUnread && w.state === 'normal' ? 'unread' : w.state) : 'unread';
        var n = el('div', 'node st-' + st);
        var head = el('div', 'nd-head');
        var t = el('div');
        t.appendChild(el('div', 'nd-step', 'PDU incomers'));
        t.appendChild(el('div', 'nd-name', e.survPdus.join(' · ')));
        t.appendChild(el('div', 'nd-sub', 'each carries its partner as well · 160 A MCCB at the ESMSB end'));
        head.appendChild(t);
        var fig = el('div', 'nd-fig');
        if (w) {
            fig.appendChild(el('div', 'nd-amps', pct(w.pct)));
            fig.appendChild(el('div', 'nd-pct', 'worst: ' + w.name.replace(' incomer', '')));
        }
        fig.appendChild(el('span', 'spill st-' + st, LABEL[st]));
        head.appendChild(fig);
        n.appendChild(head);

        var minis = el('div', 'minis');
        e.pdus.forEach(function (d) {
            var m = el('div', 'mini st-' + d.state);
            var l = el('div', 'ml');
            l.appendChild(el('b', '', d.name.replace(' incomer', '')));
            l.appendChild(el('span', '', ' + ' + d.lostPdu + ' · zone ' + d.zone));
            m.appendChild(l);
            if (d.state === 'unread') {
                m.appendChild(el('div', 'missing', 'not read'));
                m.appendChild(el('div', 'mv', '—'));
            } else {
                m.appendChild(loadBar(d.nowPct, d.pct));
                var v = el('div', 'mv', fmt(d.peak) + ' A · ' + pct(d.pct));
                v.title = 'now ' + fmt(d.nowPeak) + ' A; ' + (d.headroom >= 0 ? fmt(d.headroom) + ' A to continuous'
                                                                              : fmt(-d.headroom) + ' A over continuous');
                m.appendChild(v);
            }
            minis.appendChild(m);
        });
        n.appendChild(minis);
        return n;
    }

    function cabNode(e) {
        var c = e.cabinets, total = c.normal + c.high + c.critical + c.overload + c.missing;
        var n = el('div', 'node st-' + c.state);
        var head = el('div', 'nd-head');
        var t = el('div');
        t.appendChild(el('div', 'nd-step', 'Cabinet breakers'));
        t.appendChild(el('div', 'nd-name', 'Every cabinet on its ' + feedName(e.survFeed) + ' breaker'));
        t.appendChild(el('div', 'nd-sub', 'each carries its own current plus its partner’s · 0.8 × plate continuous'));
        head.appendChild(t);
        var fig = el('div', 'nd-fig');
        fig.appendChild(el('span', 'spill st-' + c.state, LABEL[c.state]));
        head.appendChild(fig);
        n.appendChild(head);

        var parts = [['normal', c.normal], ['high', c.high], ['critical', c.critical], ['overload', c.overload],
                     ['unread', c.missing]];
        var bar = el('div', 'cabdist');
        parts.forEach(function (x) {
            if (!x[1]) return;
            var s = el('span', 'st-' + x[0]); s.style.width = (x[1] / total * 100) + '%';
            s.title = LABEL[x[0]] + ': ' + x[1];
            bar.appendChild(s);
        });
        n.appendChild(bar);

        var cc = el('div', 'cabcounts');
        parts.forEach(function (x) {
            var s = el('span', 'st-' + x[0]); s.appendChild(el('b', '', String(x[1])));
            s.appendChild(document.createTextNode(' ' + (x[0] === 'unread' ? 'not read' : LABEL[x[0]])));
            cc.appendChild(s);
        });
        n.appendChild(cc);

        if (c.worst.length) {
            var chips = el('div', 'chips');
            c.worst.slice(0, 12).forEach(function (x) {
                var ch = el('button', 'chip st-' + x.state, short(x.res.cab.name) + ' · ' + pct(x.worst.pctCont));
                ch.type = 'button';
                ch.title = fmt(x.worst.I) + ' A on ' + x.worst.ch.way.pdu + ' ' + x.worst.ch.way.q + ' (' +
                           x.worst.ch.plate + ' A) — ' + LABEL[x.state] + '. Click to find it in the table.';
                ch.addEventListener('click', function () {
                    if (scenario !== e.lostFeed) setCase(e.lostFeed);
                    reveal(x.res.cab.name);
                });
                chips.appendChild(ch);
            });
            if (c.worst.length > 12) chips.appendChild(el('span', 'dim', '+' + (c.worst.length - 12) + ' more'));
            n.appendChild(chips);
        }
        return n;
    }

    function lostCol(e) {
        var col = el('div', 'lostcol');
        col.appendChild(el('div', 'col-h', feedName(e.lostFeed) + ' — lost'));
        e.gone.forEach(function (g) {
            var it = el('div', 'gone' + (g.dark ? ' dark' : ''));
            it.appendChild(el('span', 'gx', '✕'));
            var t = el('div');
            t.appendChild(el('div', 'g-name', g.name));
            t.appendChild(el('span', 'g-what', g.what));
            t.appendChild(el('div', 'g-det', g.detail));
            it.appendChild(t);
            col.appendChild(it);
        });
        if (e.relief) {
            var it = el('div', 'gone ok');
            it.appendChild(el('span', 'gx', '↓'));
            var t = el('div');
            t.appendChild(el('div', 'g-name', e.relief.name));
            t.appendChild(el('span', 'g-what', 'relieved'));
            t.appendChild(el('div', 'g-det', e.relief.incomer + ' falls from ' + fmt(e.relief.now, 0) + ' A to about ' +
                                             fmt(e.relief.after, 0) + ' A on its busiest phase, as ' + e.board +
                                             '’s load moves to the other transformer.'));
            it.appendChild(t);
            col.appendChild(it);
        }
        var tr = el('div', 'transfer');
        tr.appendChild(icon('M5 12h14M13 6l6 6-6 6'));
        tr.appendChild(el('span', '', 'Every dual-corded server moves its whole load to its ' + feedName(e.survFeed) +
                                       ' supply, on ' + e.survPdus.join(', ') + '.'));
        col.appendChild(tr);
        return col;
    }

    function renderEmsb() {
        var host = $('emsb');
        host.innerHTML = '';
        var e = emsb[emsbView];
        if (!e) return;

        var v = el('div', 'emsb-verdict');
        v.appendChild(finding('st-' + e.state, emsbWords(e), e.state === 'normal' ? INFO : WARN));
        host.appendChild(v);

        var grid = el('div', 'emsb-grid');
        grid.appendChild(lostCol(e));

        var right = el('div');
        right.appendChild(el('div', 'col-h', feedName(e.survFeed) + ' — carries every cabinet, source to rack'));
        var sn = el('div', 'scale-note');
        var s1 = el('span'), i1 = el('i');
        i1.style.background = 'color-mix(in srgb, var(--text-dim) 42%, transparent)';
        s1.appendChild(i1); s1.appendChild(document.createTextNode('carries now')); sn.appendChild(s1);
        var s2 = el('span'), i2 = el('i');
        i2.style.background = 'var(--text-dim)';
        s2.appendChild(i2); s2.appendChild(document.createTextNode('taken on from ' + feedName(e.lostFeed))); sn.appendChild(s2);
        sn.appendChild(el('span', '', 'ticks: 87 % margin · 100 % continuous · the bar ends at 125 %'));
        right.appendChild(sn);

        var chain = el('div', 'chain');
        e.chain.forEach(function (d) { chain.appendChild(devNode(d, STEP[d.id])); });
        chain.appendChild(pduNode(e));
        chain.appendChild(cabNode(e));
        if (e.gen) {
            chain.appendChild(el('div', 'gen-sep', 'If the utility supply is lost as well'));
            chain.appendChild(devNode(e.gen, STEP.gen, 'second'));
        }
        right.appendChild(chain);
        grid.appendChild(right);
        host.appendChild(grid);

        var act = el('div', 'emsb-act');
        var on = scenario === e.lostFeed;
        var btn = el('button', 'btn-sm', on ? 'Shown on the map and table below' : 'Show this case on the map and table');
        btn.type = 'button';
        btn.disabled = on;
        btn.addEventListener('click', function () {
            setCase(e.lostFeed);
            $('map').scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
        act.appendChild(btn);
        act.appendChild(el('span', 'dim', 'Readings of ' + ymd(shownDate) + '. Battery autonomy is not on file, so ' +
                                           'this is the state once ' + e.lostUps + ' has stopped.'));
        host.appendChild(act);
    }

    /* ---------------------------------------------------------
       map
       --------------------------------------------------------- */

    function govPct(r) { var f = govOf(r); return f && f.worst ? f.worst.pctCont : null; }

    function renderMap() {
        var host = $('map');
        host.innerHTML = '';
        var ZNAME = { 1: 'Zone 1 · PDU 1 / 6', 2: 'Zone 2 · PDU 3 / 2', 3: 'Zone 3 · PDU 5 / 4', 4: 'Zone 4 · PDU 7 / 8' };
        [1, 2, 3, 4].forEach(function (z) {
            var inZone = results.filter(function (r) { return r.cab.zone === z; });
            if (!inZone.length) return;
            var blk = el('div', 'zone-block');
            blk.appendChild(el('h4', '', ZNAME[z] + ' — ' + inZone.length + ' cabinets'));
            var rows = {};
            inZone.forEach(function (r) { (rows[r.cab.row] = rows[r.cab.row] || []).push(r); });
            Object.keys(rows).sort().forEach(function (row) {
                var line = el('div', 'rowline');
                line.appendChild(el('span', 'rl', row));
                rows[row].forEach(function (r) {
                    var st = stateOf(r);
                    var t = el('button', 'tile st-' + st);
                    t.type = 'button';
                    t.appendChild(el('span', '', short(r.cab.name)));
                    var g = govPct(r);
                    t.appendChild(el('small', '', g === null ? '—' : pct(g).replace(' ', '')));
                    t.title = r.cab.name + ' — ' + LABEL[st] +
                              (g === null ? '' : ', worst surviving breaker ' + pct(g) + ' of continuous' +
                               (scenario === 'pdu' ? '' : ' ' + CASE[scenario].when));
                    t.addEventListener('click', function () { reveal(r.cab.name); });
                    line.appendChild(t);
                });
                blk.appendChild(line);
            });
            host.appendChild(blk);
        });

        var lg = $('legend');
        lg.innerHTML = '';
        [['normal', '≤ 87 % of continuous'], ['high', '87–100 %'], ['critical', 'above continuous, under the plate'],
         ['overload', 'over the plate — trips'], ['unread', 'not read']].forEach(function (x) {
            var s = el('span'); s.appendChild(el('span', 'spill st-' + x[0], LABEL[x[0]]));
            s.appendChild(document.createTextNode(' ' + x[1])); lg.appendChild(s);
        });
    }

    function reveal(name) {
        filter.q = ''; filter.status = ''; filter.zone = '';
        $('q').value = ''; $('fStatus').value = ''; $('fZone').value = '';
        renderTally(); renderTable();
        var row = document.querySelector('[data-cab="' + name.replace(/"/g, '\\"') + '"]');
        if (row) {
            row.scrollIntoView({ block: 'center' });
            row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
        }
    }

    /* ---------------------------------------------------------
       table
       --------------------------------------------------------- */

    function norm(s) { return String(s).toLowerCase().replace(/^cabin/, '').replace(/[^a-z0-9]/g, ''); }

    function visible() {
        var q = norm(filter.q);
        var list = results.filter(function (r) {
            if (q && norm(r.cab.name).indexOf(q) === -1) return false;
            if (filter.zone && String(r.cab.zone) !== filter.zone) return false;
            var st = stateOf(r);
            if (filter.status === 'missing') return st === 'unread' || st === 'incomplete';
            if (filter.status && st !== filter.status) return false;
            return true;
        });
        var byName = function (a, b) { return built.cabinets.indexOf(a.cab) - built.cabinets.indexOf(b.cab); };
        if (filter.sort === 'risk') {
            list.sort(function (a, b) {
                return (RANK[stateOf(b)] - RANK[stateOf(a)]) || ((govPct(b) || 0) - (govPct(a) || 0)) || byName(a, b);
            });
        } else if (filter.sort === 'load') {
            list.sort(function (a, b) { return ((b.kVA === undefined ? -1 : b.kVA) - (a.kVA === undefined ? -1 : a.kVA)) || byName(a, b); });
        } else {
            list.sort(byName);
        }
        return list;
    }

    function breakerCell(label, bks) {
        var d = el('div', label.cls);
        d.setAttribute('data-lab', label.text);
        bks.forEach(function (b) {
            var box = el('div', 'brk');
            var top = el('div', 'top');
            var name = el('span'); name.appendChild(el('b', '', b.pdu + ' ' + b.q));
            name.appendChild(document.createTextNode(' · ' + (b.ph === '3' ? '3-ph' : b.ph)));
            top.appendChild(name);
            top.appendChild(el('span', '', b.plate + ' A'));
            box.appendChild(top);

            if (!b.read) {
                box.appendChild(el('div', 'missing', 'not read'));
            } else {
                var lvl = M.levelOf(b.peak, b.plate) || 'normal';
                var bar = el('div', 'bar st-' + lvl);
                var i = el('i'); i.style.width = Math.min(100, b.pctPlate) + '%';
                bar.appendChild(i);
                var c = el('span', 'cont'); c.title = 'Continuous rating ' + fmt(b.cont) + ' A (0.8 × plate)';
                bar.appendChild(c);
                box.appendChild(bar);
                var phs = b.ph === '3'
                    ? ' (' + b.phases.map(function (p) { return p.p + ' ' + fmt(p.I); }).join(' / ') + ')' : '';
                box.appendChild(el('div', 'bot',
                    fmt(b.peak) + ' A' + phs + ' · ' + fmt(b.pctPlate, 0) + ' % · ' +
                    (b.available >= 0 ? fmt(b.available) + ' A free' : fmt(-b.available) + ' A over')));
            }
            d.appendChild(box);
        });
        return d;
    }

    function failCell(r, side, label) {
        /* with one whole feed as the case, the other direction is beside the point */
        var d = el('div', 'fo ' + label.cls + (scenario !== 'pdu' && scenario !== side ? ' muted' : ''));
        d.setAttribute('data-lab', label.text);
        var lostPdu = (side === 'A' ? r.cab.A : r.cab.B)[0].pdu;
        var survPdu = (side === 'A' ? r.cab.B : r.cab.A)[0].pdu;
        d.appendChild(el('div', 'fl', 'If ' + lostPdu + ' fails'));

        var f = side === 'A' ? r.loseA : r.loseB;
        if (!f || !f.worst) {
            d.appendChild(el('div', 'missing', 'cannot assess'));
            return d;
        }
        var st = M.statusOf(f);
        d.className += ' st-' + st;
        var w = f.worst;
        d.appendChild(el('div', 'fv', survPdu + ' carries ' + fmt(w.I) + ' A · ' + pct(w.pctCont)));
        d.appendChild(el('div', 'fw', 'on ' + w.ch.way.q + ' (' + w.ch.plate + ' A, ' + fmt(w.ch.cont) + ' A cont.)' +
                                     (f.after.length > 1 ? ' — worst of ' + f.after.length : '')));
        return d;
    }

    function renderTable() {
        var host = $('table');
        host.innerHTML = '';
        var head = el('div', 'crow head');
        ['Cabinet', 'Load', 'Feed A breaker', 'Feed B breaker', 'A / B split', 'If Feed A PDU fails',
         'If Feed B PDU fails', 'Status'].forEach(function (h) { head.appendChild(el('div', '', h)); });
        host.appendChild(head);

        var list = visible();
        $('count').textContent = list.length + ' of ' + results.length + ' cabinets';

        if (!list.length) {
            var none = el('div', 'crow'); none.appendChild(el('div', 'missing', 'No cabinet matches.'));
            host.appendChild(none);
            return;
        }

        list.forEach(function (r) {
            var row = el('div', 'crow');
            row.setAttribute('data-cab', r.cab.name);

            /* name */
            var nm = el('div', 'c-name');
            nm.appendChild(el('div', 'cname', short(r.cab.name)));
            nm.appendChild(el('div', 'cmeta', 'Zone ' + r.cab.zone + ' · Row ' + r.cab.row));
            if (r.cab.mismatch.length) {
                var mm = el('span', 'flag warn', 'A/B breakers differ');
                mm.title = r.cab.mismatch.map(function (m) {
                    return m.q + ': ' + m.plateA + ' A on Feed A, ' + m.plateB + ' A on Feed B';
                }).join('; ') + ' — the smaller one limits redundancy';
                nm.appendChild(mm);
            }
            if (r.approximate) {
                var ap = el('span', 'flag', 'approximate');
                ap.title = 'The two feeds have different ways on different phases, so the failover is ' +
                           'estimated: matching ways paired exactly, the rest spread over the survivors.';
                nm.appendChild(ap);
            }
            if (r.shareA !== null && r.shareA !== undefined && r.total >= 2 &&
                Math.min(r.shareA, 1 - r.shareA) < 0.2) {
                var un = el('span', 'flag', 'uneven sharing');
                un.title = 'One feed carries over 80 % of the cabinet. Dual-corded supplies normally share ' +
                           'about evenly - worth checking for a failed supply, a single-corded device or a ' +
                           'supply in standby. Advisory, not a KOC criterion.';
                nm.appendChild(un);
            }
            row.appendChild(nm);

            /* load */
            var ld = el('div', 'c-load'); ld.setAttribute('data-lab', 'Load');
            if (r.kVA !== undefined) {
                ld.appendChild(el('div', 'big num', fmt(r.kVA, 2) + ' kVA'));
                ld.appendChild(el('div', 'dim num', fmt(r.IA) + ' + ' + fmt(r.IB) + ' A'));
            } else {
                ld.appendChild(el('div', 'missing', '—'));
            }
            row.appendChild(ld);

            row.appendChild(breakerCell({ cls: 'c-fa', text: 'Feed A breaker' }, r.breakersA));
            row.appendChild(breakerCell({ cls: 'c-fb', text: 'Feed B breaker' }, r.breakersB));

            /* split */
            var sp = el('div', 'c-split'); sp.setAttribute('data-lab', 'A / B split');
            if (r.shareA !== null && r.shareA !== undefined) {
                var bar = el('div', 'split');
                var a = el('div', 'a', Math.round(r.shareA * 100) >= 15 ? Math.round(r.shareA * 100) + '' : '');
                var b = el('div', 'b', Math.round((1 - r.shareA) * 100) >= 15 ? Math.round((1 - r.shareA) * 100) + '' : '');
                a.style.width = (r.shareA * 100) + '%'; b.style.width = ((1 - r.shareA) * 100) + '%';
                bar.appendChild(a); bar.appendChild(b); sp.appendChild(bar);
                sp.appendChild(el('div', 'split-cap', 'A ' + Math.round(r.shareA * 100) + ' % · B ' +
                                                     Math.round((1 - r.shareA) * 100) + ' %'));
            } else if (r.total === 0) {
                sp.appendChild(el('div', 'missing', 'no current'));
            } else {
                sp.appendChild(el('div', 'missing', '—'));
            }
            row.appendChild(sp);

            row.appendChild(failCell(r, 'A', { cls: 'c-la', text: 'If Feed A PDU fails' }));
            row.appendChild(failCell(r, 'B', { cls: 'c-lb', text: 'If Feed B PDU fails' }));

            /* status */
            var st = el('div', 'c-status'), rs = stateOf(r), what = CASE[scenario].short;
            st.appendChild(el('span', 'spill st-' + rs, LABEL[rs]));
            if (rs === 'normal' || rs === 'high') {
                st.appendChild(el('div', 'surv st-' + rs, '✓ survives ' + what));
            } else if (rs === 'critical' || rs === 'overload') {
                st.appendChild(el('div', 'surv st-' + rs,
                    rs === 'overload' ? '✗ trips on ' + what : '✗ above rating on ' + what));
            }
            row.appendChild(st);

            host.appendChild(row);
        });
    }

    /* ---------------------------------------------------------
       notes
       --------------------------------------------------------- */

    function renderNotes() {
        var n = $('notes');
        var single = built.singleFed.map(function (c) { return esc(c.name) + ' (' + c.A.concat(c.B)[0].pdu + ')'; });
        n.innerHTML =
            '<h3>Breaker limits — the same basis as the Power System Assessment</h3>' +
            '<ul><li><b>Continuous rating = 0.8 × the breaker plate</b>, KOC-E-003 Pt 1 cl. 11.2.2. On the bars, ' +
            'the tick marks it.</li>' +
            '<li><b>87 % of continuous</b> is the 15 % spare margin, as the assessment uses for feeders.</li>' +
            '<li><b>The plate</b> is where the breaker trips.</li></ul>' +

            '<h3>Status — the worst surviving breaker, whichever PDU fails</h3>' +
            '<ul><li><b>Normal</b> ≤ 87 % of continuous · <b>High Load</b> ≤ 100 % · <b>Critical</b> above ' +
            'continuous but under the plate · <b>Overload</b> over the plate, so it trips and the cabinet goes dark.</li>' +
            '<li>The surviving breaker always carries at least what it carries now, so this also covers normal ' +
            'running: a breaker already over its rating shows up here too.</li></ul>' +

            '<h3>What happens when a PDU fails</h3>' +
            '<ul><li>Each server has one supply on each feed. When one feed goes, every server draws its whole ' +
            'load through the other.</li>' +
            '<li>A way with the same number on both PDUs serves the same rack position and is on the same phase, ' +
            'so the surviving way carries <b>its own current plus its partner’s</b>. ' +
            built.cabinets.filter(function (c) { return c.matched; }).length + ' of ' + built.cabinets.length +
            ' cabinets pair like this exactly.</li>' +
            '<li>The rest — ' + built.cabinets.filter(function (c) { return !c.matched; }).map(function (c) { return esc(short(c.name)); }).join(', ') +
            ' — have different ways on each side. Matching ways are paired; the current on a way with no partner ' +
            'is spread over the survivors in proportion to what they already carry. Marked <b>approximate</b>.</li>' +
            '<li><b>A whole PDU</b>: its partner’s incomer carries both, phase by phase. All of the lost ' +
            'PDU’s current is moved, which slightly overstates it — loads on a single feed go dark rather ' +
            'than transfer — so it errs safe.</li></ul>' +

            '<h3>What happens when an EMSB fails</h3>' +
            '<ul><li>Per the single line diagram (EI-CC-S/S-001, issue 06-09-26), each EMSB is only its UPS’s input ' +
            'board: a 1000 A incomer ACB splitting into an 800 A <b>main</b> and an 800 A <b>bypass</b> ACB. Losing ' +
            'EMSB-1 takes away both UPS-1’s input and its bypass.</li>' +
            '<li>The UPS rides through on its battery, then stops, and its ESMSB and four PDUs go with it. Battery ' +
            'autonomy is not on file, so the page works out the <b>end state</b>: that whole feed lost, every ' +
            'dual-corded server on the other.</li>' +
            '<li><b>Transformer and ATS</b>: what the failed EMSB drew moves to the other supply path — EMSB-1 hangs off ' +
            'Transformer B through ATS-001, EMSB-2 off Transformer A through ATS-002. ATS-001 is not metered, so it is the ' +
            'sum of its six feeders.</li>' +
            '<li><b>The surviving EMSB</b> takes on what both drew: its own reading plus the failed one’s. The 800 A main ' +
            'ACB governs.</li>' +
            '<li><b>UPS and ESMSB incomer</b>: not metered, so their load is the eight PDU incomers summed, phase by phase. ' +
            'ULDB-1, on ESMSB-2 way 5 (63 A), has no reading — the page shows what it would take for it to matter.</li>' +
            '<li><b>PDU incomers and cabinets</b>: as above, all at once — each surviving PDU carries its partner, and ' +
            'every cabinet runs on its surviving breaker.</li>' +
            '<li><b>The generator row</b> is a second failure on top — the utility supply lost as well — and is shown, ' +
            'not counted in the verdict.</li></ul>' +

            '<h3>Rating basis for the supply path</h3>' +
            '<ul><li><b>Breakers, ACBs, MCCBs</b>: 0.8 × plate continuous, trip at the plate — KOC-E-003 cl. 11.2.2, ' +
            'KOC-E-009 cl. 6.3.</li>' +
            '<li><b>UPS</b>: the 500 kVA plate is the continuous rating (695.6 A a phase), as the Additional Load Study ' +
            'takes it. Above it is Critical; above 125 %, the overload it can carry for 10 minutes (KOC-E-011 cl. 8.7), ' +
            'Overload.</li>' +
            '<li><b>Transformer</b>: the 2133 A plate is already the derated rating; KOC allows no overload ' +
            '(KOC-E-005 cl. 7.2), so anything above it is Overload.</li>' +
            '<li><b>Generator</b>: plate current continuous; up to 110 % is Critical — the 1-hour-in-12 overload of ' +
            'KOC-E-007 cl. 11.1.6 — and above it Overload.</li>' +
            '<li>Every device is Normal up to 87 % of its continuous rating, the 15 % margin.</li></ul>' +

            '<h3>What is not counted</h3>' +
            '<ul><li><b>A breaker that was not read is never treated as 0 A.</b> A cabinet with any unread way ' +
            'gets no status.</li>' +
            '<li><b>' + single.length + ' loads on a single feed</b> are not cabinets and are left out — ' +
            single.join(', ') + '. With no second feed there is nothing to fail over to.</li>' +
            '<li><b>RACK-K01 / K02 / L36</b> are fed from EDB-24, not from a PDU, and are not metered per rack, ' +
            'so they do not appear here.</li>' +
            '<li><b>Uneven sharing</b> is advisory, not a KOC criterion: one feed carrying over 80 % of a cabinet ' +
            'is unusual for dual-corded supplies and worth a look.</li></ul>' +

            '<p class="dim">Breaker sizes and pairing from the PDU single line diagrams, revision 10-09-2026. ' +
            'Load in kVA is the sum of the phase currents at 239.6 V a phase (415 V line).</p>';
    }

    function render() {
        renderCase(); renderTally(); renderFindings(); renderPairs(); renderScen(); renderEmsb();
        renderMap(); renderTable(); renderNotes();
    }

    /* ---------------------------------------------------------
       start
       --------------------------------------------------------- */

    function applyTheme(t) {
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
    }

    function init() {
        var saved; try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
        applyTheme(saved || 'dark');
        $('themeBtn').addEventListener('click', function () {
            applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
        });

        $('date').addEventListener('change', function () { load($('date').value, false); });
        $('refresh').addEventListener('click', function () { load($('date').value || shownDate, false); });
        $('q').addEventListener('input', function () { filter.q = $('q').value; renderTable(); });
        $('fStatus').addEventListener('change', function () { filter.status = $('fStatus').value; renderTally(); renderTable(); });
        $('fZone').addEventListener('change', function () { filter.zone = $('fZone').value; renderTable(); });
        $('fSort').addEventListener('change', function () { filter.sort = $('fSort').value; renderTable(); });
        Array.prototype.forEach.call(document.querySelectorAll('.casebar button'), function (b) {
            b.addEventListener('click', function () { setCase(b.getAttribute('data-case')); });
        });

        var start; try { start = localStorage.getItem(LATEST_KEY); } catch (e) { start = null; }
        load(start || new Date().toISOString().slice(0, 10), true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
