/* The history op against the REAL incomer maxima now in the sheet,
   plus the case that separates per-phase summing from sum-of-maxima. */
const fs = require('fs');
const path = 'D:/KOC Utility area/08-WebApp/KOC Data Center Web page/apps-script/Code.gs';

const HEADER = ['Timestamp','Date','Time','Taken by','Site','Category','Equipment','Circuit',
                'Rack','Rated A','R','Y','B','Max A','% loaded','Unbalance %','Remarks'];
let SHEET;
function makeSheet(rows) {
  const grid = rows.map(r => r.slice());
  return { _grid: grid, getLastRow: () => grid.length, setFrozenRows(){},
    getRange(r,c,nr,nc){ return {
      getValues(){ const o=[]; for(let i=0;i<nr;i++){ const s=grid[r-1+i]||[]; o.push(s.slice(c-1,c-1+nc)); } return o; },
      setValues(v){ v.forEach((row,i)=>{ const y=r-1+i; while(grid.length<=y) grid.push([]);
                     row.forEach((x,j)=>{ grid[y][c-1+j]=x; }); }); },
      setFontWeight(){ return this; } }; } };
}
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({
  getSheetByName: () => SHEET, insertSheet: () => SHEET,
  getSpreadsheetTimeZone: () => 'Asia/Kuwait' }) };
global.LockService = { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) };
global.ContentService = { MimeType:{JSON:'json'},
  createTextOutput: s => ({ _s:s, setMimeType(){ return this; } }) };
global.Utilities = { formatDate: d => { const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); } };

eval(fs.readFileSync(path,'utf8'));
const call = b => JSON.parse(doPost({ postData:{ contents: JSON.stringify(b) } })._s);

function row(date, eq, r, y, b) {
  const a = new Array(17).fill('');
  a[0]=date; a[1]=date; a[5]='Main'; a[6]=eq; a[7]='';
  a[10]=r; a[11]=y; a[12]=b;
  return a;
}

/* exactly the six rows entered in the sheet */
const real = [HEADER,
  row('2024-07-10','Incomer A',1240,1210,1270), row('2024-07-10','Incomer B', 648, 660, 684),
  row('2025-07-15','Incomer A',1142,1120,1172), row('2025-07-15','Incomer B', 648, 630, 656),
  row('2023-07-19','Incomer A',1311,1267,1321), row('2023-07-19','Incomer B', 678, 672, 690)];

let pass=0, fail=0;
const check=(n,g,w)=>{ const ok=JSON.stringify(g)===JSON.stringify(w);
  console.log('  %s  %s%s', ok?'PASS':'FAIL', n, ok?'':`   got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);
  ok?pass++:fail++; };

SHEET = makeSheet(real);

console.log('\nReal sheet data, 5 year window');
let h = call({ type:'history', from:'2021-09-07', to:'2026-09-07' });
check('r1 three dates', h.cover.dates, 3);
check('r2 worst coincident demand', h.demand.max, 2011);      // 1321+690 on B phase
check('r3 worst was on', h.demand.maxDate, '2023-07-19');
check('r4 worst phase', h.demand.maxPhase, 'B');
check('r5 Incomer A peak', h.stats['Main|Incomer A|'].max, 1321);
check('r6 Incomer B peak', h.stats['Main|Incomer B|'].max, 690);
check('r7 lowest site demand', h.demand.min, 1828);           // 1172+656
check('r8 A at the worst moment', h.demand.aAtMax, 1321);
check('r9 B at the worst moment', h.demand.bAtMax, 690);

console.log('\n  worst recorded site demand %d A against the 1855 A ceiling (2133 / 1.15)', h.demand.max);
check('r10 already over the contingency ceiling', h.demand.max > 2133/1.15, true);

console.log('\nThree year window excludes July 2023');
h = call({ type:'history', from:'2023-09-07', to:'2026-09-07' });
check('r11 two dates', h.cover.dates, 2);
check('r12 worst demand', h.demand.max, 1954);                // 1270+684
check('r13 Incomer A peak', h.stats['Main|Incomer A|'].max, 1270);

console.log('\nPer-phase summing versus sum of maxima');
SHEET = makeSheet([HEADER,
  row('2025-07-01','Incomer A',1000,500,500),                 // max on R
  row('2025-07-01','Incomer B', 200,900,200)]);               // max on Y
h = call({ type:'history', from:'2025-01-01', to:'2025-12-31' });
check('p1 per-phase peak', h.demand.max, 1400);               // Y: 500+900
check('p2 on the Y phase', h.demand.maxPhase, 'Y');
const naive = h.stats['Main|Incomer A|'].max + h.stats['Main|Incomer B|'].max;
console.log('  sum of maxima would say %d A, no conductor carries that', naive);
check('p3 sum of maxima overstates by 500 A', naive - h.demand.max, 500);

console.log('\n%d passed, %d failed\n', pass, fail);
process.exit(fail ? 1 : 0);
