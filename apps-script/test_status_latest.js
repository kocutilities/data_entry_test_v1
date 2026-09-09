/* The status reply must now carry the latest date the sheet holds, and the
   date memo must not change any answer. */
const fs = require('fs');
const path = 'D:/KOC Utility area/08-WebApp/KOC Data Center Web page/apps-script/Code.gs';
const HEADER = ['Timestamp','Date','Time','Taken by','Site','Category','Equipment','Circuit',
                'Rack','Rated A','R','Y','B','Max A','% loaded','Unbalance %','Remarks'];
let SHEET, tzCalls = 0, fmtCalls = 0;
function makeSheet(rows){ const g = rows.map(r=>r.slice());
  return { getLastRow:()=>g.length, setFrozenRows(){},
    getRange(r,c,nr,nc){ return { getValues(){ const o=[]; for(let i=0;i<nr;i++){const s=g[r-1+i]||[];o.push(s.slice(c-1,c-1+nc));} return o; },
      setValues(v){ v.forEach((row,i)=>{ const y=r-1+i; while(g.length<=y) g.push([]); row.forEach((x,j)=>{ g[y][c-1+j]=x; }); }); },
      setFontWeight(){ return this; } }; } }; }
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => SHEET, insertSheet: () => SHEET,
  getSpreadsheetTimeZone: () => { tzCalls++; return 'Asia/Kuwait'; } }) };
global.LockService = { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) };
global.ContentService = { MimeType:{JSON:'json'}, createTextOutput: s => ({ _s:s, setMimeType(){ return this; } }) };
global.Utilities = { formatDate: d => { fmtCalls++; const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); } };
eval(fs.readFileSync(path,'utf8'));
const call = b => JSON.parse(doPost({ postData:{ contents: JSON.stringify(b) } })._s);

/* real Date objects, so the memo is exercised - 300 rows over 3 dates */
function row(d, eq, c){ const a=new Array(17).fill(''); a[0]=d; a[1]=d; a[5]='PDU'; a[6]=eq; a[7]=c;
  a[10]=10; a[11]=11; a[12]=12; return a; }
const rows=[HEADER];
['2026-09-05','2026-09-06','2026-09-07'].forEach(ds=>{
  const d=new Date(ds+'T00:00:00');
  for(let i=1;i<=100;i++) rows.push(row(d,'PDU 1','Q'+i));
});
SHEET = makeSheet(rows);

let pass=0, fail=0;
const check=(n,g,w)=>{ const ok=JSON.stringify(g)===JSON.stringify(w);
  console.log('  %s  %s%s', ok?'PASS':'FAIL', n, ok?'':`   got ${JSON.stringify(g)} want ${JSON.stringify(w)}`);
  ok?pass++:fail++; };

tzCalls = 0; fmtCalls = 0;
const st = call({ type:'status', date:'2026-09-06' });
check('1a status succeeds', st.result, 'success');
check('1b right day counted', Object.keys(st.recorded).length, 100);
check('1c reports the latest date', st.latest, '2026-09-07');
console.log('  300 rows + latest scan: %d timezone calls, %d formatDate calls', tzCalls, fmtCalls);
check('1d timezone fetched once', tzCalls, 1);
check('1e formatDate memoised to distinct dates', fmtCalls, 3);

/* a text date, not a Date object, must still work */
SHEET = makeSheet([HEADER, row('2026-09-07','PDU 2','Q1')]);
const st2 = call({ type:'status', date:'2026-09-07' });
check('2a text dates still match', Object.keys(st2.recorded).length, 1);
check('2b latest from text date', st2.latest, '2026-09-07');

/* empty sheet */
SHEET = makeSheet([HEADER]);
const st3 = call({ type:'status', date:'2026-09-07' });
check('3a empty sheet succeeds', st3.result, 'success');
check('3b latest is null', st3.latest, null);

console.log('\n%d passed, %d failed\n', pass, fail);
process.exit(fail?1:0);

