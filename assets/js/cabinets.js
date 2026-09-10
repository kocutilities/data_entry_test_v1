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
    var shownDate = null;
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
            setStatus(Object.keys(rec).length + ' readings recorded for ' + ymd(date));
            render();
        }).catch(function (e) {
            console.error('Cabinet load failed:', e);
            setStatus('Could not read the sheet (' + e.message + ').');
        });
    }

    /* ---------------------------------------------------------
       summary
       --------------------------------------------------------- */

    function counts() {
        var c = { normal: 0, high: 0, critical: 0, overload: 0, missing: 0 };
        results.forEach(function (r) {
            if (r.state === 'unread' || r.state === 'incomplete') c.missing++;
            else c[r.state]++;
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
        var w = r.governing.worst, lostPdu = (r.governingLost === 'A' ? r.cab.A : r.cab.B)[0].pdu;
        return esc(short(r.cab.name)) + ' — ' + fmt(w.I) + ' A on ' + w.ch.way.pdu + ' ' + w.ch.way.q +
               ' (' + w.ch.plate + ' A) if ' + lostPdu + ' fails';
    }

    function renderFindings() {
        var host = $('findings');
        host.innerHTML = '';

        var over = results.filter(function (r) { return r.state === 'overload'; });
        if (over.length) {
            host.appendChild(finding('st-overload',
                '<b>' + over.length + ' cabinet' + (over.length === 1 ? '' : 's') +
                ' would lose power if one PDU failed</b> — the surviving breaker would carry more ' +
                'than its plate rating and trip. ' + over.map(failWords).join('; ') + '.'));
        }

        var crit = results.filter(function (r) { return r.state === 'critical'; });
        if (crit.length) {
            host.appendChild(finding('st-critical',
                '<b>' + crit.length + ' cabinet' + (crit.length === 1 ? '' : 's') +
                ' would run above their continuous rating after a PDU failure</b> — they would hold, ' +
                'but not for long. ' + crit.map(failWords).join('; ') + '.'));
        }

        /* the zones where a whole PDU is close to its partner's limit */
        pairs.forEach(function (p) {
            if (!p.governing || p.state === 'normal') return;
            var g = p.governing;
            host.appendChild(finding('st-' + p.state,
                '<b>Zone ' + p.zone + ': if ' + g.lost + ' fails, ' + g.surv + '’s incomer would carry ' +
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
       map
       --------------------------------------------------------- */

    function govPct(r) { return r.governing && r.governing.worst ? r.governing.worst.pctCont : null; }

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
                    var st = r.state;
                    var t = el('button', 'tile st-' + st);
                    t.type = 'button';
                    t.appendChild(el('span', '', short(r.cab.name)));
                    var g = govPct(r);
                    t.appendChild(el('small', '', g === null ? '—' : pct(g).replace(' ', '')));
                    t.title = r.cab.name + ' — ' + LABEL[st] +
                              (g === null ? '' : ', worst surviving breaker ' + pct(g) + ' of continuous');
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
            if (filter.status === 'missing') return r.state === 'unread' || r.state === 'incomplete';
            if (filter.status && r.state !== filter.status) return false;
            return true;
        });
        var byName = function (a, b) { return built.cabinets.indexOf(a.cab) - built.cabinets.indexOf(b.cab); };
        if (filter.sort === 'risk') {
            list.sort(function (a, b) {
                return (RANK[b.state] - RANK[a.state]) || ((govPct(b) || 0) - (govPct(a) || 0)) || byName(a, b);
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
        var d = el('div', 'fo ' + label.cls);
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
            var st = el('div', 'c-status');
            st.appendChild(el('span', 'spill st-' + r.state, LABEL[r.state]));
            if (r.survives === true) {
                st.appendChild(el('div', 'surv st-' + r.state, '✓ survives a PDU loss'));
            } else if (r.survives === false) {
                st.appendChild(el('div', 'surv st-' + r.state,
                    r.state === 'overload' ? '✗ trips on a PDU loss' : '✗ above rating on a PDU loss'));
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
        renderTally(); renderFindings(); renderPairs(); renderMap(); renderTable(); renderNotes();
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

        var start; try { start = localStorage.getItem(LATEST_KEY); } catch (e) { start = null; }
        load(start || new Date().toISOString().slice(0, 10), true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
