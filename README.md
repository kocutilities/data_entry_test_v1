# KOC Data Center — Web Page

Electrical records for Data Center No. 1. The first page is **Data Center Load
Reading**; power-system assessment and additional-load analysis will be added as
further pages in this same project.

This project is **independent**. It shares no code, stylesheet, configuration or
Google Sheet with the Substation web page. The visual theme deliberately matches
so the two sit together, but nothing is loaded across.

---

## Files

```
KOC Data Center Web page/
├── index.html                  project home — links the pages
├── load-reading.html           the Load Reading page
├── assets/
│   ├── css/theme.css           design tokens, shell, components
│   └── js/
│       ├── config.js           equipment list, PDU circuits, sheet endpoint
│       └── load-reading.js     page logic
├── apps-script/Code.gs         Google Apps Script that writes to the sheet
└── README.md
```

Plain HTML, CSS and JavaScript — no build step, no dependencies. Open
`index.html` in a browser, or serve the folder from any static host.

---

## What the page records

**Main equipment — 26 feeders**, in single line diagram order: Incomer A,
Incomer B, EMSB 1, EMSB 4, EDB 27, Battery Charger & Fuel Pump, EMSB 9, EMSB 3,
MSB 10, MSB 8, MCC 2, MSB 7, DB 2, ATS 002, PDU 1, PDU 3, PDU 5, PDU 7, PDU 6,
PDU 2, PDU 4, PDU 8, EDB 28, Generator Control Panel, EMSB 2, EMCC 1.

**PDU outgoing breakers — 564 ways.** Every way drawn on the PDU single line
diagrams: 78 on each of PDU 1 to 6, 48 on each of PDU 7 and 8. One collapsible
panel per PDU.

Ways carrying no load are labelled `SPARE` and faded, so a reading round skips
them without them being missing from the page.

| Field | Where it comes from |
|---|---|
| Way numbers | the PDU single line diagrams — authoritative for which ways exist |
| Phase and pole count | the phase letters printed on those diagrams |
| Load name | the PDU-1 panel labels for PDU 1; the load schedule for the rest |
| Breaker rating | the load schedule only |

Ways the load schedule never listed have no breaker rating, so they show the
highest phase in amperes instead of a percentage. That is deliberate — a
percentage against an unconfirmed rating would be worse than none.

Only R, Y and B phase currents are entered. Everything else on screen is derived:

| Shown | How it is worked out |
|---|---|
| **% of rating** | highest of the three phases ÷ device rating. Amber above 80 %, red above 100 % |
| **% unbalance** | greatest deviation of a phase from the mean of the three, as a percentage of the mean. Amber above 10 %, red above 20 %. Only shown when all three phases are entered |

Ratings come from `config.js` — the device rating for main equipment, the
breaker frame size for PDU ways. The two incomers are shown against the
transformer full-load current of 2133 A rather than the breaker frame, since
that is the meaningful limit.

### Submitting

Each feeder has its own **Submit** button. The equipment is spread across
different areas and read at different times, so nothing waits for a full round
to be finished.

| On the row | Meaning |
|---|---|
| **Submit** | nothing recorded for the selected date — enter R, Y, B and send it |
| **Recorded ✓** | saved to the sheet during this session |
| **Already Recorded** | a reading for this feeder was already in the sheet for this date. The values shown are the ones from the sheet |
| **Retry** | the submit failed. The values are still on the page |

A recorded row locks its inputs, so the same feeder cannot be entered twice for
the same date by accident.

**Status is always checked against the selected date.** On load, and whenever
the date is changed, the page asks the sheet what is already recorded for that
date and marks those rows. Change the date to yesterday and yesterday's
readings appear, locked; change it back and today's do. The counters at the top
read *recorded for this date*, so what is outstanding is visible at a glance.

**To correct a reading**, press **Update** on the row. It reopens the inputs and
the next submit *overwrites the existing sheet row* rather than appending a
second entry for the same feeder and date — corrections do not accumulate.

There are three ways to send, and all three take the same path — every row is
still recorded, and duplicate-checked, on its own:

| Button | Sends |
|---|---|
| **Submit** on a row | that one feeder |
| **Submit N pending** on a section or PDU panel | everything entered in that section |
| **Submit all N pending** in the bottom bar | everything entered anywhere on the page, including PDU panels that are collapsed |

**Batching is much faster.** A submit is a single request to Google, and that
request takes two to four seconds whether it carries one reading or forty — the
wait is the round trip, not the rows. Recording thirty ways one at a time costs
a minute or two of waiting; the same thirty in one press cost one round trip.
Enter a whole area, then send it in one go.

While a submit is in flight the buttons disable and the Pending counter reads
*saving…*, so a second press cannot start an overlapping request.

Duplicates are refused by the sheet as well as by the page. If two people record
the same feeder at the same time, the second one is told, shown the values
already stored, and nothing is overwritten.

### What each source actually provides

The PDU single line diagrams carry **way numbers and phase only**. They contain
no load names and no per-way breaker ratings — checked across all three
drawings, zero tokens of either kind.

| Column | Source | Status |
|---|---|---|
| Way numbers (564) | PDU single line diagrams | verified, 564 of 564 ways paired |
| Phase and pole count | phase letters on those diagrams | verified against 480 printed labels |
| PDU 7 / 8 incomer, 200 A 4P MCCB, fed from ESMSB-1 / ESMSB-2 | stated on their drawing | verified |
| PDU 1 load names | the PDU-1 panel labels, photographed | current |
| PDU 2-8 load names | 2025 load schedule | **stale, unverified** |
| Breaker sizes, all PDUs | 2025 load schedule | **stale, unverified** |

290 of the 564 ways carry a breaker size and all of them come from that
spreadsheet. The size drives the % loading badge, so those percentages are
indicative rather than fact; the badge tooltip says so. Way numbers, phases and
the readings themselves are unaffected.

To fix it properly, photograph the PDU 2 to 8 panel labels the way PDU 1 was
done, and the names and sizes can be replaced with what is actually installed.

### Known data queries

- **PDU incoming breakers.** 200 A 4P MCCB is stated on the drawing for PDU 7
  and PDU 8 only. PDU 1 to 6 are assumed to match and are not confirmed.
- **Zone 4** never appeared in the load schedule, so any ways serving it carry
  no load name.

### Two pole RCBOs and phase

PDU ways 1 to 6 are four pole RCBOs feeding three phase loads, so all three
inputs are shown. From way 7 they are two pole RCBOs, phase and neutral, so
**only that one phase is shown and recorded** — the other two inputs are
replaced by a dash. Each way carries a small tag saying which it is:
`4 pole · 3 phase`, or `2 pole · R phase`.

Phase rotates by way number: Q7 on R, Q8 on Y, Q9 on B, Q10 on R, and so on,
which is `[R,Y,B][(n-1) mod 3]`.

**Source.** The phase letters are printed on the PDU single line diagrams
(`PDU-01 Single line diagram.pdf`, `PDU-1 to PDU-8 SLD.pdf`). The rule above was
checked against all 480 printed labels across the eight PDU blocks and matched
every one, so `config.js` transcribes it rather than assuming it.

If a way is ever rewired, add it to `phaseOverrides` in `config.js` — keyed
`'PDU 1|Q7'`, value `'3'`, `'R'`, `'Y'` or `'B'` — rather than editing the
circuit list.

Because only the wired phase is shown, a single phase way cannot pick up a
reading on a conductor it does not have, and no unbalance figure is calculated
for it.

### On a phone

The page is built to be used on an iPhone at the panel.

- Fields are 16px so iOS does not zoom the page when one takes focus, and every
  button and input is at least 44px tall.
- Number fields open the decimal keypad rather than the full keyboard.
- A two pole way shows its single phase as one full-width field instead of a
  third of a row beside two dashes.
- The action bar stays one row: **Submit all pending**, then Refresh, Export and
  Clear as icons. It sits above the home indicator on notched phones.
- Layout checked at 14 widths from 1920px down to 360px, including iPhone SE,
  13 mini, 14, 15 Pro, 15 Pro Max and iPad mini.

### In the field

- Entries are saved to the browser on this device as you type. A reload, a flat
  battery or a closed tab does not lose them — the page offers them back.
- Blank rows are not submitted, so a partial round is fine. Come back and finish
  the rest later.
- <kbd>Enter</kbd> moves to the next input.
- **Export CSV** writes whatever is on the page to a file, with a Status column
  saying which rows were recorded. This works with no network at all.
- If the sheet cannot be reached, the page says so and still lets you enter and
  submit — the duplicate check then falls to the sheet alone.

## Connecting the Google Sheet

This project stores its data in a **separate Google account** from the
Substation web page. Nothing is shared between them — not the sheet, not the
Apps Script project, not the deployment URL.

The page has no endpoint configured out of the box, and says so in an amber
banner until one is set.

### 0. Sign in as the right account first

A deployment belongs to whichever account created it, and Apps Script does not
always follow the account you *think* you are using when several are signed in
at once. Getting this wrong is the most common way this setup fails, and it
fails confusingly: the sheet appears in one account and the script runs as
another.

Do one of these before starting:

- open a **separate Chrome profile** for the Data Center account, or
- open an **incognito window** and sign in to that account only, or
- sign out of every Google account and sign in to that one alone.

Do not simply switch accounts in the top-right avatar menu with the Substation
account still signed in.

### 1. Create the sheet

In that account, create a new blank Google Sheet — `Drive → New → Google
Sheets`. Name it something like **KOC Data Center — Load Readings**.

Do not add headers or rename the default tab. The script creates its own tab
named `Load Readings` with the correct columns the first time it runs.

### 2. Add the script

In the new sheet: **Extensions → Apps Script**. Delete whatever is in the
editor, paste the whole of `apps-script/Code.gs` from this folder, and save
(the disk icon, or Ctrl+S).

### 3. Deploy it as a web app

**Deploy → New deployment.** If the dialog opens on the wrong type, click the
gear next to "Select type" and choose **Web app**.

| Field | Set to |
|---|---|
| Description | `Load reading v1` (any text) |
| Execute as | **Me** — your Data Center account |
| Who has access | **Anyone** |

**"Anyone"** — not "Anyone with Google account". The page posts without a
sign-in, so anything stricter rejects every submission.

This does **not** make the sheet public. "Execute as: Me" means the script
writes as the account that owns it; nobody using the page needs access to the
sheet, and nobody can read it through the page. The only thing exposed is the
script's own two operations.

### 4. Authorise it

The first deployment asks for authorisation, and Google shows a warning because
the script is unverified. That is expected for a private script you wrote
yourself:

1. **Review permissions** → choose your Data Center account.
2. On "Google hasn't verified this app": **Advanced** → **Go to *(project name)*
   (unsafe)**.
3. **Allow**.

Check the account shown on that consent screen. If it is not the Data Center
account, stop and go back to step 0.

### 5. Copy the URL into the page

Copy the deployment's **Web app URL** — it ends in `/exec`. Paste it into
`assets/js/config.js`:

```js
endpoint: 'https://script.google.com/macros/s/AKfy…/exec',
```

### 6. Check it works

Open the `/exec` URL in a browser tab. It should answer with something like:

```json
{"result":"success","service":"KOC Data Center load reading","sheet":"Load Readings","rows":0}
```

That call also creates the `Load Readings` tab and its header row — switch back
to the sheet and you should see it.

Then reload the page. The amber banner disappears and the date field reads
`0 already recorded for …`. Enter R, Y and B on one feeder, press **Submit**,
and confirm the row lands in the sheet and the page shows **Recorded ✓**.

### If it does not work

| What you see | Cause |
|---|---|
| `/exec` asks you to sign in | "Who has access" is not set to **Anyone** |
| Page says "Could not check the sheet" | endpoint is missing, mistyped, or the deployment was archived |
| Rows appear in the wrong account's sheet | deployed while signed in as another account — see step 0 |
| A change to `Code.gs` has no effect | not redeployed as a **New version** — see below |

### Redeploying after a change

> **After editing `Code.gs` you must redeploy as a New version.**
> **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy.**
>
> Saving the script alone does not update the published web app. The old code
> keeps running, the page still reports success, and the change simply does not
> take effect — it fails silently.

### Sheet columns

The page talks to the script with two POST requests: `status`, which asks what
is already recorded for a date, and `load-reading`, which saves. Both go to the
same `/exec` URL.

The script writes the header row itself on first use, into a tab named
**Load Readings**. One row per feeder reading:

| # | Column | Notes |
|---|---|---|
| 1 | Timestamp | when the submission was received |
| 2 | Date | reading date, from the page |
| 3 | Time | reading time |
| 4 | Taken by | |
| 5 | Site | `KOC Data Center` |
| 6 | Category | `Main` or `PDU` |
| 7 | Equipment | board name, or the PDU |
| 8 | Circuit | PDU way number, blank for main equipment |
| 9 | Rack | load served, blank for main equipment |
| 10 | Rated A | device rating used for the % figure |
| 11–13 | R, Y, B | the measured currents. A two pole way fills only its own phase and leaves the other two blank |
| 14 | Max A | highest of the three |
| 15 | % loaded | |
| 16 | Unbalance % | blank unless all three phases were entered |
| 17 | Remarks | |

One row per feeder rather than one wide row per round: it pivots cleanly, it
plots as a time series per feeder without rework, equipment can be added to
`config.js` later without disturbing the columns, and it is what lets a single
feeder be recorded, found and corrected on its own.

**Do not sort or reorder the sheet by hand while readings are being taken.** The
duplicate check finds a feeder by date, equipment and circuit, so sorting is
safe for that — but Update rewrites a specific row, and a sort between loading
the page and pressing Update would move it. Sort a copy instead.

---

## Editing the equipment and circuit lists

Everything that changes lives in `assets/js/config.js`. Nothing in the page or
the stylesheet needs touching.

**A board or feeder** — add an entry to `equipment`. Order on screen follows the
array, which is kept in single line diagram order:

```js
{ name: 'MSB 12', source: 'LT board way 7C', rated: 400, note: 'F Building' },
```

**A PDU way** — add to the relevant array in `pduCircuits`:

```js
{ c: 'Q35', rack: 'Rack-M17', breaker: '20A' },
```

`rated` and `breaker` drive the % loading badge. Leave them out and the page
shows the highest phase current in amperes instead, with no percentage — better
than showing a figure against a rating that has not been confirmed.

---

## Data sources

| What | Source |
|---|---|
| Equipment list, feed points, way numbers | Computer Centre single line diagram, issue 06-09-26 |
| PDU way numbers, rack names, breaker sizes | `DATA CENTER #1 UPDATED RUNNING LOAD DETAILS.xlsx`, sheet `NEW` |
| Transformer full-load current (2133 A) | ELIN transformer nameplate, serial 1.538710 |

### Ratings to confirm before the figures are relied on

The percentage badges are only as good as the ratings behind them. These were
taken from the drawings and the load schedule, and are worth a check against the
panels themselves:

- **PDU incoming breakers** are entered as 200 A for all eight. This is
  confirmed for PDU 7 and PDU 8 from their own drawing; PDU 1 to PDU 6 are
  assumed the same and have not been verified.
- **Zone 4** does not appear in the load schedule, so any ways serving it are
  missing from `pduCircuits`.
- **PDU 2 and PDU 3** carry 46 and 44 ways against 34 on the other six. That
  matches the schedule, but is worth confirming at the panel.

Correct any of these in `config.js` and the page follows.
