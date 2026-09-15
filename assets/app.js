/* Rugby Archive — the Super Filter.
   Everything runs in the browser off one preloaded array. No server, no fetch.

   Speed strategy: matches stay as the raw arrays the pipeline emitted (no
   objects per row), filtering is one pass over an index array, and only the
   ~40 visible rows are ever in the DOM. 9,892 matches filter in well under a
   millisecond, which is why it feels instant.                                */

(function () {
"use strict";

// ------------------------------------------------------------------ boot --
var D = window.RUGBY_DATA;
if (!D || window.__dataFailed) {
  document.getElementById("loading").hidden = true;
  document.getElementById("dataerror").hidden = false;
  return;
}

var F = {};
D.fields.forEach(function (name, i) { F[name] = i; });
var ROWS = D.rows;
var LK = D.lookups;
var TEAMS = LK.teams;
var N = ROWS.length;

/* TEAMS holds the identity a match is RANKED under - one entry per lineage, so
   filtering for Russia finds the Soviet Union's matches too. ERA holds the name
   the side actually went by on the day, which is what gets printed. Older data
   files have no team_era lookup, so fall back to the ranked name. */
var ERA = LK.team_era || null;
function homeName(r) {
  return ERA && r[F.home_as] != null ? ERA[r[F.home_as]] : TEAMS[r[F.home]];
}
function awayName(r) {
  return ERA && r[F.away_as] != null ? ERA[r[F.away_as]] : TEAMS[r[F.away]];
}

var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
            "Saturday"];
var DAYS3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep",
              "Oct", "Nov", "Dec"];

// --------------------------------------------------- derived, computed once
// Per row: year, month, day-of-week. Kept in flat typed arrays so the filter
// loop touches numbers only.
var YEAR = new Int16Array(N), DOW = new Uint8Array(N), ORD = new Int32Array(N);
var VENUE = new Array(N);   // "stadium city country", lower-cased, for search
(function () {
  for (var i = 0; i < N; i++) {
    var s = ROWS[i][F.date];
    var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    YEAR[i] = y;
    // Day of week straight from the calendar (Sakamoto), so no Date object and
    // no timezone can move a match onto the wrong day.
    var t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    var yy = m < 3 ? y - 1 : y;
    DOW[i] = (yy + ((yy / 4) | 0) - ((yy / 100) | 0) + ((yy / 400) | 0) +
              t[m - 1] + d) % 7;
    ORD[i] = y * 10000 + m * 100 + d;

    var r = ROWS[i], v = "";
    if (r[F.stadium] !== null) v += LK.stadium[r[F.stadium]] + " ";
    if (r[F.city] !== null) v += LK.city[r[F.city]] + " ";
    if (r[F.country] !== null) v += LK.country[r[F.country]];
    VENUE[i] = v.toLowerCase();
  }
})();

// ----------------------------------------------------------------- filters
var S = {
  team: "", opp: "", side: "any",
  yearFrom: null, yearTo: null, dateFrom:"", dateTo:"", dows: [],
  country: "", city: "", venue: "",
  comp: "", wc: "any", elig: "any", mclass: "any", full: "any",
  result: "any", marginMin: null, marginMax: null,
  oppRankMin: null, oppRankMax: null, rankSource: "archive", neutralFilter: "any", breakdownFilter: "any",
  sort: "date", dir: -1
};

/* match_class, written by the pipeline from data\team_classification.csv.
   0 both sides national - a full international
   1 exactly one side national - a Lions Test, a match against an A or XV side
   2 neither side national - a touring party against a county or province
   3 both sides national but the owner has ruled it not a Test by hand
   4 a side the classification file has never seen; NEVER reported as a full
     international, because the honest answer there is "I do not know" */
var MCLASS = {0: "both sides are countries", 1: "one side is not a country",
              2: "neither side is a country", 4: "a side not classified yet"};
var MCLASS_LONG = {0: "both sides are countries", 1: "one side is not a country",
                   2: "neither side is a country",
                   4: "one side is not classified yet"};

var teamIdx = {};
TEAMS.forEach(function (t, i) { teamIdx[t] = i; });

/* A team index from a name that may be EITHER the ranked identity ("Russia")
   or a name that side used earlier ("Soviet Union"). Deep links from the
   Rankings Time Machine carry the ERA name, and a plain lookup returns
   undefined for those - which every caller here reads as "no filter", so the
   page showed the whole archive while its heading claimed one team. */
function teamIndexOf(name) {
  var i = teamIdx[name];
  if (i !== undefined) return i;
  if (!ERA) return -1;
  var e = ERA.indexOf(name);
  if (e < 0) return -1;
  for (var k = 0; k < ROWS.length; k++) {
    if (ROWS[k][F.home_as] === e) return ROWS[k][F.home];
    if (ROWS[k][F.away_as] === e) return ROWS[k][F.away];
  }
  return -1;
}


var idx = new Int32Array(N);      // filtered row indices, reused every pass
var idxLen = 0;

function passes(i) {
  var r = ROWS[i], t = S.teamI, o = S.oppI;
  var h = r[F.home], a = r[F.away];

  if (t >= 0) {
    /* HOME, AWAY AND NEUTRAL ARE MUTUALLY EXCLUSIVE. Either one side is at
       home and the other is away, or neither is, and then the match is
       neutral - there is no such thing as being "at home at a neutral venue".
       Note the `&& !r[F.neutral]` on the first two: without it, Home would
       have swept up the 11 Wales matches that are really neutral (the 2023
       World Cup pool games in France, and the 1997-99 "home" fixtures played
       at Wembley while the Millennium Stadium was built). In those the home
       designation is only which column the name sits in.
       The three now partition a team's matches exactly:
       Wales 409 home + 353 away + 45 neutral = 807. */
    if (h !== t && a !== t) return false;
    if (S.side === "home") { if (h !== t || r[F.neutral]) return false; }
    else if (S.side === "away") { if (a !== t || r[F.neutral]) return false; }
    else if (S.side === "neutral") { if (!r[F.neutral]) return false; }
  }
  if (o >= 0 && h !== o && a !== o) return false;
  if (t >= 0 && o >= 0 && h !== o && a !== o) return false;

  var y = YEAR[i];
  if (S.dateFrom && r[F.date] < S.dateFrom) return false;
  if (S.dateTo && r[F.date] > S.dateTo) return false;
  if (S.yearFrom !== null && y < S.yearFrom) return false;
  if (S.yearTo !== null && y > S.yearTo) return false;
  if (S.dows.length && S.dows.indexOf(DOW[i]) === -1) return false;

  if (S.countryI >= 0 && r[F.country] !== S.countryI) return false;
  if (S.cityI >= 0 && r[F.city] !== S.cityI) return false;
  if (S.venueI >= 0 && r[F.stadium] !== S.venueI) return false;
  if (S.compI >= 0 && r[F.competition] !== S.compI) return false;

  if (S.wc !== "any" && r[F.world_cup] !== +S.wc) return false;
  if (S.elig !== "any" && r[F.eligible] !== +S.elig) return false;
  if (S.mclass !== "any" && r[F.match_class] !== +S.mclass) return false;
  if (S.full !== "any" && r[F.full_intl] !== +S.full) return false;

  var m = r[F.margin];
  if (S.marginMin !== null && m < S.marginMin) return false;
  if (S.marginMax !== null && m > S.marginMax) return false;

  if (S.result !== "any" && outcome(r) !== S.result) return false;

  if (S.neutralFilter !== "any" && r[F.neutral] !== +S.neutralFilter) return false;
  if (S.breakdownFilter !== "any" && !!(D.breakdowns || {})[String(i)] !== (S.breakdownFilter === "1")) return false;
  if (S.oppRankMin !== null || S.oppRankMax !== null) {
    var ranks, hf = S.rankSource === 'world' ? F.home_wr_rank : F.home_rank_before;
    var af = S.rankSource === 'world' ? F.away_wr_rank : F.away_rank_before;
    if (S.rankSource === 'world' && !r[F.wr_available]) return false;
    if (t >= 0) ranks = [h === t ? r[af] : r[hf]];
    else ranks = [r[hf], r[af]];
    var ok = false;
    for (var k = 0; k < ranks.length; k++) {
      var rk = ranks[k];
      if (!Number.isFinite(rk) || rk <= 0) continue;
      if (S.oppRankMin !== null && rk < S.oppRankMin) continue;
      if (S.oppRankMax !== null && rk > S.oppRankMax) continue;
      ok = true; break;
    }
    if (!ok) return false;
  }
  return true;
}

/* Result letter from the point of view we are analysing:
   the selected team if there is one, otherwise the home team. */
function outcome(r) {
  var t = S.teamI;
  var mine, theirs;
  if (t >= 0 && r[F.away] === t) { mine = r[F.away_score]; theirs = r[F.home_score]; }
  else { mine = r[F.home_score]; theirs = r[F.away_score]; }
  return mine > theirs ? "W" : (mine < theirs ? "L" : "D");
}

function myScores(r) {
  var t = S.teamI;
  if (t >= 0 && r[F.away] === t) return [r[F.away_score], r[F.home_score], true];
  return [r[F.home_score], r[F.away_score], false];
}

function applyFilters() {
  S.teamI = S.team ? teamIndexOf(S.team) : -1;
  S.oppI = S.opp ? teamIndexOf(S.opp) : -1;
  // a deep link may name a side by an earlier name; show the name the filter
  // actually resolved to, so the heading and the rows agree
  if (S.teamI >= 0) S.team = TEAMS[S.teamI];
  if (S.oppI >= 0) S.opp = TEAMS[S.oppI];
  S.countryI = S.country ? LK.country.indexOf(S.country) : -1;
  S.cityI = S.city ? LK.city.indexOf(S.city) : -1;
  S.venueI = S.venue ? LK.stadium.indexOf(S.venue) : -1;
  S.compI = S.comp ? LK.competition.indexOf(S.comp) : -1;
  if (S.teamI === undefined) S.teamI = -1;
  if (S.oppI === undefined) S.oppI = -1;

  var n = 0;
  for (var i = 0; i < N; i++) if (passes(i)) idx[n++] = i;
  idxLen = n;
}

// ------------------------------------------------------------------- sort
var SORTERS = {
  date: function (i) { return ORD[i]; },
  dow: function (i) { return DOW[i]; },
  margin: function (i) { return ROWS[i][F.margin]; },
  total: function (i) { return ROWS[i][F.home_score] + ROWS[i][F.away_score]; },
  row: function (i) { return ROWS[i][F.excel_row]; }
};
var TEXT_SORT = { home: F.home, away: F.away, comp: F.competition,
                  venue: "venue" };

/* The side that is NOT the selected team. Used by team view and by the sort
   that backs its Opponent column. */
function opponentName(r) {
  return r[F.home] === S.teamI ? awayName(r) : homeName(r);
}

function sortView() {
  var view = Array.prototype.slice.call(idx.subarray(0, idxLen));
  var dir = S.dir, key = S.sort;
  if (key === "result") {
    var order = { W: 0, D: 1, L: 2 };
    view.sort(function (x, y) {
      var d = order[outcome(ROWS[x])] - order[outcome(ROWS[y])];
      return (d || ORD[y] - ORD[x]) * (key === "result" ? dir : 1);
    });
  } else if (TEXT_SORT[key] !== undefined) {
    var fi = TEXT_SORT[key];
    // Team columns sort on the DISPLAYED name, not the ranked identity -
    // otherwise a row reading "Soviet Union" files itself under R for Russia
    // and the A-Z is one the reader cannot see.
    /* IN TEAM VIEW THE "AWAY" COLUMN IS HEADED "Opponent", and the opponent
       is whichever side is not the selected team - so half the rows would
       sort on the wrong name if this kept reading the away slot. The heading
       and the sort must mean the same thing or the A-Z is a lie. */
    var nameOf = fi === F.home ? homeName
      : (fi === F.away ? (teamView() ? opponentName : awayName)
      /* THE VENUE COLUMN IS NOT THE STADIUM COLUMN. It renders stadium, or
         city if there is no stadium, or country if there is neither. Sorting
         on the stadium field alone put the 724 rows that have a city but no
         stadium at the very end under \uffff, so the tail of an A-Z read
         "Johannesburg, Pietermaritzburg, Grahamstown, Cape Town" with nothing
         to explain why. The sort now reads exactly what the cell prints. */
      : (fi === "venue" ? function (r) { return context(r).venue || ""; }
      : null));
    var lut = fi === F.competition ? LK.competition : LK.stadium;
    view.sort(function (x, y) {
      var sx, sy;
      if (nameOf) {
        sx = nameOf(ROWS[x]); sy = nameOf(ROWS[y]);
      } else {
        var ax = ROWS[x][fi], ay = ROWS[y][fi];
        var HI = String.fromCharCode(0xffff);
        sx = ax === null ? HI : lut[ax];
        sy = ay === null ? HI : lut[ay];
      }
      return sx < sy ? -dir : (sx > sy ? dir : ORD[y] - ORD[x]);
    });
  } else {
    var get = SORTERS[key] || SORTERS.date;
    view.sort(function (x, y) { return (get(x) - get(y)) * dir || ORD[y] - ORD[x]; });
  }
  return view;
}

// -------------------------------------------------------------- analysis
function analyse(view) {
  var played = view.length, won = 0, drawn = 0, lost = 0, pf = 0, pa = 0;
  var bigWin = null, bigLoss = null, highest = null;
  for (var k = 0; k < view.length; k++) {
    var r = ROWS[view[k]];
    var sc = myScores(r), mine = sc[0], theirs = sc[1];
    pf += mine; pa += theirs;
    var diff = mine - theirs;
    if (diff > 0) { won++; if (!bigWin || diff > bigWin.d) bigWin = { d: diff, r: r }; }
    else if (diff < 0) { lost++; if (!bigLoss || -diff > bigLoss.d) bigLoss = { d: -diff, r: r }; }
    else drawn++;
    var tot = r[F.home_score] + r[F.away_score];
    if (!highest || tot > highest.d) highest = { d: tot, r: r };
  }

  // Streaks run in date order within whatever is currently filtered.
  var chrono = view.slice().sort(function (x, y) { return ORD[x] - ORD[y]; });
  var wS = 0, wBest = 0, uS = 0, uBest = 0, lS = 0, lBest = 0;
  var wSpan = null, uSpan = null, lSpan = null;
  var wStart = null, uStart = null, lStart = null;
  for (var j = 0; j < chrono.length; j++) {
    var rr = ROWS[chrono[j]], res = outcome(rr);
    if (res === "W") { if (!wS) wStart = rr; wS++; } else { wS = 0; }
    if (res !== "L") { if (!uS) uStart = rr; uS++; } else { uS = 0; }
    if (res === "L") { if (!lS) lStart = rr; lS++; } else { lS = 0; }
    if (wS > wBest) { wBest = wS; wSpan = [wStart, rr]; }
    if (uS > uBest) { uBest = uS; uSpan = [uStart, rr]; }
    if (lS > lBest) { lBest = lS; lSpan = [lStart, rr]; }
  }

  var form = chrono.slice(-30).map(function (i) { return outcome(ROWS[i]); });

  return {
    played: played, won: won, drawn: drawn, lost: lost, pf: pf, pa: pa,
    bigWin: bigWin, bigLoss: bigLoss, highest: highest,
    first: chrono.length ? ROWS[chrono[0]] : null,
    last: chrono.length ? ROWS[chrono[chrono.length - 1]] : null,
    wBest: wBest, wSpan: wSpan, uBest: uBest, uSpan: uSpan,
    lBest: lBest, lSpan: lSpan, form: form
  };
}

// ------------------------------------------------------------ formatting
/* ONE FORMAT. This printed "8 Aug 2026" while the table printed "08 Aug 2026"
   two inches away on the same screen. */
function fmtDate(s) {
  return s.slice(8, 10) + " " + MONTHS[+s.slice(5, 7) - 1] + " " + s.slice(0, 4);
}
function fmtNum(n) { return n.toLocaleString("en-GB"); }
function pct(a, b) { return b ? (100 * a / b).toFixed(1) + "%" : "–"; }
function scoreline(r, mineFirst) {
  var h = homeName(r), a = awayName(r);
  return h + " " + r[F.home_score] + "–" + r[F.away_score] + " " + a;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

// ----------------------------------------------------------------- render
/* THE ROW IS ALWAYS TWO LINES.
   Line 1 is the fixture, mirrored around the dash. Line 2 carries when, where,
   what competition and how many watched, in three slots that line up down the
   whole page so each can be scanned as a column.
   It is always two lines even when line 2 is empty, because a row that
   sometimes has one line and sometimes two gives the table two different row
   heights - and the virtual table below computes scroll position from ONE
   fixed height. That is the same trap the drawer has to avoid, which is why
   the drawer is a fixed height too. */
/* ==========================================================================
   THE ROW
   Rebuilt 7 Sep 2026. What it replaces, and why, because the old shape was
   defensible and this is a real change of mind:

   The old row was TWO LINES - fixture on top, and day / venue / competition /
   crowd underneath in three slots that lined up down the page. It was dense
   and it scanned well vertically. Its failure was horizontal. The date sat at
   the far left, the fixture floated in the middle of a wide screen and the
   expander was pinned to the far right, so reading one match meant crossing
   the whole window three times. Everything on line two was secondary, and it
   was being paid for in the one dimension the reader cannot avoid.

   Now: ONE line, six things, packed left, and everything secondary moved into
   the expander or behind an optional column the reader turns on deliberately.

       Date | Home-listed | Score | Away-listed | Status | +

   The four questions a collapsed row must answer without help - when, who,
   what score, what kind of match - are the four things left.
   ========================================================================== */

/* Optional columns. OFF by default and remembered per device: the reader asked
   for them, so they are never a surprise, and the default row stays the one
   that answers the four questions and nothing else. */
var OPT = { rank: false, comp: false, venue: false, crowd: false };
var DENSITY = "comfortable";
var VIEWMODE = "fixture";        // or "team", when a team is selected
var PREF_KEY = "rugby-table-prefs";

function loadPrefs() {
  try {
    var raw = localStorage.getItem(PREF_KEY);
    if (!raw) return;
    var o = JSON.parse(raw);
    if (o && o.opt) {
      Object.keys(OPT).forEach(function (k) {
        if (typeof o.opt[k] === "boolean") OPT[k] = o.opt[k];
      });
    }
    if (o && (o.density === "compact" || o.density === "comfortable")) {
      DENSITY = o.density;
    }
    if (o && (o.view === "fixture" || o.view === "team")) VIEWMODE = o.view;
  } catch (e) { /* private mode, or a policy that refuses storage */ }
}
function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(
      { opt: OPT, density: DENSITY, view: VIEWMODE }));
  } catch (e) { /* never worth throwing over a display preference */ }
}
loadPrefs();

/* TEAM VIEW. Only reachable with a team selected, and only ever offered then,
   because "Result" and "keep their score first" have no meaning without a
   point of view. The heading says whose point of view it is - an unlabelled
   perspective is worse than none. */
function teamView() { return VIEWMODE === "team" && S.teamI >= 0; }

/* Column widths are declared here and turned into a grid-template in one
   place, so the head and every row cannot drift apart. The trailing `filler`
   is what stops the fixture floating: with no flexible column switched on,
   the empty space collects at the RIGHT of the row instead of being shared
   out between date, fixture and expander. */
function activeCols() {
  var cols = [];
  cols.push({ key: "date", label: "Date", cls: "c-date", w: "104px",
              tip: "Sort by date" });
  if (teamView()) {
    cols.push({ key: "away", label: "Opponent", cls: "c-opp",
                w: "minmax(130px,250px)", tip: "Sort by opponent" });
    cols.push({ key: "", label: "Result", cls: "c-res", w: "58px",
                nosort: true });
    cols.push({ key: "margin", label: "Score", cls: "c-sc", w: "86px",
                tip: "Sort by winning margin" });
    cols.push({ key: "", label: "Location", cls: "c-loc", w: "minmax(90px,140px)",
                nosort: true });
  } else {
    cols.push({ key: "home", label: "Home", cls: "c-home",
                w: "minmax(130px,250px)", tip: "Sort by the home-listed team" });
    cols.push({ key: "margin", label: "Score", cls: "c-sc", w: "86px",
                tip: "Sort by winning margin" });
    cols.push({ key: "away", label: "Away", cls: "c-away",
                w: "minmax(130px,250px)", tip: "Sort by the away-listed team" });
  }
  /* WIDE ENOUGH FOR THREE CHIPS, MEASURED RATHER THAN GUESSED. Twice now this
     column has been set to a width that "looked like enough" and twice the
     third chip was silently eaten by overflow:hidden - a row that WAS played
     at a neutral ground simply did not say so, which is the exact ambiguity
     this column exists to remove. The worst case that occurs in the data is
     "Not a Test" + "No rating change" + "Neutral", which measures 255px with
     its gaps and cell padding. The cell also carries a title with all three
     statuses spelled out, so even an unforeseen combination degrades to
     hover-and-read rather than to silence. */
  cols.push({ key: "", label: "Match status", cls: "c-status",
              w: "minmax(258px,268px)", nosort: true });
  cols.push({ key: "", label: "", cls: "c-exp", w: "44px", nosort: true,
              head: '<span class="vh">Show match details</span>' });
  if (OPT.rank) {
    cols.push({ key: "", label: "Rank before match", cls: "c-rank", w: "150px",
                nosort: true });
  }
  if (OPT.comp) {
    cols.push({ key: "comp", label: "Competition", cls: "c-comp",
                w: "minmax(140px,1fr)" });
  }
  if (OPT.venue) {
    cols.push({ key: "venue", label: "Venue", cls: "c-venue",
                w: "minmax(150px,1fr)" });
  }
  if (OPT.crowd) {
    cols.push({ key: "", label: "Attendance", cls: "c-crowd", w: "96px",
                nosort: true });
  }
  cols.push({ key: "", label: "", cls: "c-filler", w: "1fr", nosort: true });
  return cols;
}
var COLS = activeCols();

var head = document.getElementById("tablehead");
var wrap = document.getElementById("tablewrap");
var spacer = document.getElementById("tablespacer");
var bodyEl = document.getElementById("tablebody");
var emptyEl = document.getElementById("empty");
/* Row geometry lives in the STYLESHEET, not here. The virtual table computes
   scroll offsets arithmetically, so if CSS and JS ever disagree about how
   tall a row is, rows silently overlap or leave gaps - and nothing throws. */
var ROW_H = 34;
function readMetrics() {
  var cs = getComputedStyle(document.documentElement);
  var r = parseFloat(cs.getPropertyValue("--row-h"));
  var changed = false;
  if (r > 0 && r !== ROW_H) { ROW_H = r; changed = true; }
  return changed;
}
var view = [];
var open = {};                 // data-row index -> true. Survives re-filtering.

function flag(name) {
  return window.RUGBY_FLAGS ? window.RUGBY_FLAGS.svg(name) : "";
}

function applyGrid() {
  var t = COLS.map(function (c) { return c.w; }).join(" ");
  document.documentElement.style.setProperty("--table-cols", t);
  /* ON <html>, NOT ON <body>. readMetrics() reads --row-h off the document
     element, so a density class on body would change nothing it can see and
     the rows would keep their old height while the CSS drew a new one - which
     is precisely how a virtual list tears. */
  document.documentElement.classList.toggle("dense", DENSITY === "compact");
  readMetrics();
}

/* The sort indicator is a WORD as well as an arrow, and the heading is a real
   button: sorting was previously reachable only with a mouse. */
function drawHead() {
  head.className = "tablehead fx";
  var refocus = grabFocus();
  head.innerHTML = COLS.map(function (c) {
    var on = !c.nosort && c.key && S.sort === c.key;
    var label = c.head || esc(c.label);
    if (c.nosort || !c.key) {
      return '<div class="' + c.cls + '" role="columnheader">' + label + "</div>";
    }
    /* aria-sort IS ONLY HONOURED ON role="columnheader". It used to sit on the
       <button> inside the cell, where no screen reader reads it, so the sort
       state was announced to nobody. Every sortable column now declares its
       state, "none" included - a reader needs to know which columns COULD be
       sorted, not only which one is. */
    return '<div class="' + c.cls + (on ? " sorted" : "") + '"' +
      ' role="columnheader" aria-sort="' +
      (on ? (S.dir < 0 ? "descending" : "ascending") : "none") + '">' +
      '<button type="button" class="sortbtn" data-key="' + c.key + '"' +
      ' title="' + esc(c.tip || ("Sort by " + c.label)) + '"' +
      ' aria-label="' + esc(c.tip || ("Sort by " + c.label)) + '"' +
      ">" + label +
      (on ? ' <span class="arrow" aria-hidden="true">' +
            (S.dir < 0 ? "▼" : "▲") + "</span>" : "") +
      "</button></div>";
  }).join("");
  restoreFocus(refocus);
  syncHeadScroll();
}

/* Everything a match knows about itself, as one object, so the row builder and
   the expander cannot disagree about what exists. */
function context(r) {
  var stad = r[F.stadium] !== null ? LK.stadium[r[F.stadium]] : null;
  var city = r[F.city] !== null ? LK.city[r[F.city]] : null;
  var venue = stad && city ? stad + ", " + city : (stad || city ||
              (r[F.country] !== null ? LK.country[r[F.country]] : null));
  return {
    venue: venue,
    stadium: stad, city: city,
    country: r[F.country] !== null ? LK.country[r[F.country]] : null,
    comp: r[F.competition] !== null ? LK.competition[r[F.competition]] : null,
    trophy: r[F.trophy] !== null ? LK.trophy[r[F.trophy]] : null,
    type: r[F.match_type] !== null ? LK.match_type[r[F.match_type]] : null,
    crowd: r[F.attendance]
  };
}
/* EVERY row can be expanded now. It used to depend on there being a venue, a
   competition, a crowd or a breakdown - so the rows with least recorded, which
   are exactly the rows a reader most wants explained, were the ones with no
   way to ask. The expander now always opens, and says plainly what is not
   recorded. */

/* --------------------------------------------------------- match status
   THREE INDEPENDENT FACTS, NEVER MERGED INTO ONE.
     Test status        the workbook's own Is Full International
     Ranking            whether the match moved a rating
     Neutral venue      whether the ground was neutral
   A single "classification" would have to invent a rule for combining them,
   and the whole reason this archive keeps them apart is that they genuinely
   disagree - a Lions Test is a Test that moves no rating. Words, not colour:
   every chip is readable with the colour removed. */
/* The same three facts as plain prose, for the cell's title and for anywhere
   the chips cannot be shown - the phone row, most obviously. */
function statusText(r) {
  var fi = r[F.full_intl];
  return (fi === null ? "Test status not established"
                      : (fi ? "A full international (Test)"
                            : "Not a full international")) +
    " · " + (r[F.eligible] ? "this result moved both world ratings"
                           : "no rating moved") +
    (r[F.neutral] ? " · played at a neutral ground, so Home and Away are the "
                    + "fixture as listed" : "");
}

function statusChips(r) {
  var out = "";
  var fi = r[F.full_intl];
  if (fi === null) {
    out += '<span class="st st-unk" title="The workbook records no answer for ' +
           'this row">Test status not established</span>';
  } else if (fi) {
    out += '<span class="st st-test" title="A full international - the ' +
           'workbook\'s own Is Full International column says so">Test</span>';
  } else {
    out += '<span class="st st-nontest" title="Not a full international - a ' +
           'tour or representative fixture">Not a Test</span>';
  }
  out += r[F.eligible]
    ? '<span class="st st-rank" title="This result moved both sides\' world ' +
      'ratings">Rating counts</span>'
    : '<span class="st st-norank" title="' +
      (r[F.match_class] === 0
        ? "No rating moved. Both sides are countries, but this match is "
          + "excluded by name in the master workbook."
        : "No rating moved: the rankings only change when both sides are "
          + "countries.") + '">No rating change</span>';
  if (r[F.neutral]) {
    out += '<span class="st st-neutral" title="Played at a neutral ground, so ' +
           'the Home and Away columns are fixture ordering only">Neutral</span>';
  }
  return out;
}

/* "08 Aug 2026". Sorting is untouched - it runs on ORD, an integer built from
   the ISO string, so what the reader sees and what the sort uses are
   deliberately different things. */
function rowDate(iso) {
  return iso.slice(8, 10) + " " + MONTHS[+iso.slice(5, 7) - 1] + " " +
         iso.slice(0, 4);
}

function sideCell(cls, name, won, alignEnd) {
  var fg = '<span class="fg">' + flag(name) + "</span>";
  var nm = '<span class="nm' + (won ? " wnr" : "") + '" title="' + esc(name) +
           '">' + esc(name) +
           (won ? '<span class="vh"> (winner)</span>' : "") + "</span>";
  /* NO INLINE RANK BADGE. The brief asked for "a ranking column labelled Rank
     before match, rather than unexplained numbers beside names", and a bare
     "#7" against a team name is exactly the unexplained number it named. It
     was also backwards: the badge showed by DEFAULT and switching the column
     ON removed it. Ranks now live in one place, under a heading that says
     what they are. */
  return '<div role="cell" class="' + cls + '">' +
         (alignEnd ? nm + fg : fg + nm) + "</div>";
}

function rowHTML(i, k) {
  var r = ROWS[i];
  var hs = r[F.home_score], as = r[F.away_score];
  var hn = homeName(r), an = awayName(r);
  var hw = hs > as, aw = as > hs;
  var isOpen = !!open[i];
  var c = context(r);
  var cells = '<div role="cell" class="c-date"><time datetime="' + r[F.date] + '">' +
              rowDate(r[F.date]) + "</time></div>";

  if (teamView()) {
    var mine = r[F.home] === S.teamI;
    var myScore = mine ? hs : as, theirScore = mine ? as : hs;
    var oppName = opponentName(r);
    var res = myScore > theirScore ? "Won" : (myScore < theirScore ? "Lost" : "Drew");
    var loc = r[F.neutral] ? "Neutral" : (mine ? "Home" : "Away");
    cells += '<div role="cell" class="c-opp"><span class="fg">' + flag(oppName) +
             '</span><span class="nm" title="' + esc(oppName) + '">' +
             esc(oppName) + "</span></div>" +
      '<div role="cell" class="c-res r-' + res.toLowerCase() + '">' + res + "</div>" +
      /* The selected team's score comes FIRST - that is the perspective the
         header names - but the bold still marks the WINNER, the same as the
         fixture view. Bolding "my score" would mean two different things in
         two views, and the reader would have to know which they were in. */
      '<div role="cell" class="c-sc"><span class="' + (myScore > theirScore ? "wnr" : "") +
        '">' + myScore + '</span><span class="dash"> – </span><span class="' +
        (theirScore > myScore ? "wnr" : "") + '">' + theirScore +
        "</span></div>" +
      '<div role="cell" class="c-loc">' + loc + "</div>";
  } else {
    cells += sideCell("c-home", hn, hw, true) +
      '<div role="cell" class="c-sc">' +
        '<span class="' + (hw ? "wnr" : "") + '">' + hs + "</span>" +
        '<span class="dash"> – </span>' +
        '<span class="' + (aw ? "wnr" : "") + '">' + as + "</span></div>" +
      sideCell("c-away", an, aw, false);
  }

  cells += '<div role="cell" class="c-status" title="' + esc(statusText(r)) + '">' +
    statusChips(r) + "</div>" +
    '<div role="cell" class="c-exp">' +
      '<button type="button" class="expbtn" data-exp="' + i + '"' +
      ' id="exp-' + r[F.excel_row] + '"' +
      ' aria-expanded="' + isOpen + '" aria-controls="det-' + i + '"' +
      ' aria-label="Show match details for ' + esc(hn) + " versus " +
      esc(an) + " on " + rowDate(r[F.date]) + '">' +
      '<span aria-hidden="true">' + (isOpen ? "−" : "+") + "</span></button></div>";

  if (OPT.rank) {
    /* In team view the two ranks are shown in the SAME ORDER as the score -
       the selected team first. Leaving them as home-v-away would have the two
       columns disagree about which number belongs to whom. */
    var hr = r[F.home_rank_before], ar = r[F.away_rank_before];
    if (teamView() && r[F.home] !== S.teamI) { var t2 = hr; hr = ar; ar = t2; }
    cells += '<div role="cell" class="c-rank">' +
      (hr === null && ar === null
        ? '<span class="na" title="Neither side had a rating yet">no rating ' +
          "yet</span>"
        : (hr === null ? '<span class="na" title="No rating yet">n/a</span>' : hr) +
          " v " +
          (ar === null ? '<span class="na" title="No rating yet">n/a</span>' : ar)) +
      "</div>";
  }
  if (OPT.comp) {
    cells += '<div role="cell" class="c-comp" title="' + esc(c.comp || "") + '">' +
      (c.comp ? esc(c.comp) : '<span class="nr">not recorded</span>') + "</div>";
  }
  if (OPT.venue) {
    cells += '<div role="cell" class="c-venue" title="' + esc(c.venue || "") + '">' +
      (c.venue ? esc(c.venue) : '<span class="nr">not recorded</span>') + "</div>";
  }
  if (OPT.crowd) {
    /* The same two kinds of absence the expander is built around. An awarded
       or walked-over match HAS no crowd; every other blank is simply not
       established. One dash for both threw that distinction away in the one
       place a reader scans it in bulk. */
    var awarded = /awarded|walkover|abandon/i.test(c.type || "");
    cells += '<div role="cell" class="c-crowd" title="' +
      (c.crowd ? fmtNum(c.crowd) + " recorded"
        : (awarded ? "Not applicable - this match was awarded or never played"
                   : "Attendance has never been established for this match")) +
      '">' + (c.crowd ? fmtNum(c.crowd)
        : (awarded ? '<span class="na">n/a</span>'
                   : '<span class="nr">–</span>')) + "</div>";
  }
  cells += '<div role="cell" class="c-filler"></div>';

  return '<div class="trow fx' + (isOpen ? " open" : "") + '" data-i="' + i +
    '" role="row">' + cells + "</div>" + (isOpen ? drawerHTML(i) : "");
}

/* ------------------------------------------------------------- the drawer */
var SC = D.scoring || null;
var BREAK = D.breakdowns || {};
var BO = (SC && SC.breakdown_order) || [];
var HALF = BO.length ? BO.length / 2 : 6;
var BD_HEAD = ["Tries", "Conv", "Pen", "Drop", "Mark", "Pen try"];

/* NULL BEFORE THE FIRST TABLE. This used to fall back to SC.rows[0], whose
   from_year is 1885 - so a match in 1871 was scored under an 1885 table, its
   own recorded score was declared not to add up, and a sentence underneath
   asserted "the points values in force in 1871". Three inventions in one
   block. 39 matches carry a breakdown before 1885. */
function valuesFor(year) {
  if (!SC.rows.length || year < SC.rows[0][0]) return null;
  var v = SC.rows[0].slice(1), i;
  for (i = 0; i < SC.rows.length; i++) if (year >= SC.rows[i][0]) v = SC.rows[i].slice(1);
  return v;
}
function pointsFrom(counts, v) {
  var t = 0, n = Math.min(counts.length, v.length), i;
  for (i = 0; i < n; i++) t += counts[i] * v[i];
  return t;
}

/* ------------------------------------------------------------ the expander
   FOUR LABELLED GROUPS, in the order a reader asks for them:
     Match context     where, when, in what
     Rankings at kickoff   what the archive reconstructs, said to be a
                           reconstruction
     Scoring breakdown     what was actually recorded
     Record notes          the honesty group - what is estimated, what is
                           missing, why a classification came out as it did

   TWO KINDS OF ABSENCE, AND THEY ARE NOT THE SAME.
     "not recorded"    the archive has never established this. It may exist.
     "not applicable"  there is nothing to record. An awarded match has no
                       crowd; a match with no breakdown cannot be restated.
   Printing one blank for both was the ambiguity the reader named, and a blank
   that means two different things is worse than either. Nothing is invented:
   where the archive is silent, this says so in words. */
function NR() { return '<span class="nr">not recorded</span>'; }
function NA(why) {
  return '<span class="na" title="' + esc(why || "") + '">not applicable</span>';
}

function scoringBlock(r, i) {
  var b = BREAK[i];
  if (!b || !SC) {
    return '<section class="dgroup"><h4>Scoring breakdown</h4>' +
      '<p class="none">No try-and-kick breakdown is recorded for this match, ' +
      'so its score cannot be restated in another era\'s points. ' +
      fmtNum(Object.keys(BREAK).length) + ' of the ' + fmtNum(D.rows.length) +
      ' matches carry one.</p></section>';
  }
  var y = +r[F.date].slice(0, 4);
  var era = valuesFor(y), latest = SC.rows[SC.rows.length - 1];
  var checkable = era !== null;
  var sides = [
    { name: homeName(r), counts: b.slice(0, HALF), got: r[F.home_score] },
    { name: awayName(r), counts: b.slice(HALF), got: r[F.away_score] }
  ];
  var head = "<tr><th>Side</th>" + BD_HEAD.slice(0, HALF).map(function (h) {
    return "<th>" + h + "</th>";
  }).join("") + "<th>Total</th>" +
    (checkable ? "<th>Adds up?</th>" : "") + "</tr>";
  /* A GOAL FROM A MARK IS THE ONE FIGURE THAT MAY BE ABSENT rather than nil on
     an otherwise complete breakdown, and printing "·" for it said "none were
     scored" on 1,483 matches where the truth is that nobody wrote it down -
     547 of them before 1978, while a mark was still a legal way to score. The
     pipeline now ships which sides actually have one, and this prints an
     em dash where it does not. The total is unaffected: an unrecorded mark
     cannot be added to anything either way. */
  var MARKS = (SC && SC.marks_recorded) || {};
  var markSeen = MARKS[String(i)] || [0, 0];
  var markCol = BO.indexOf("home_marks");
  var body = sides.map(function (s2, si) {
    var cells = "<tr><td>" + esc(s2.name) + "</td>" +
      s2.counts.map(function (n, ci) {
        if (ci === markCol && !markSeen[si]) {
          return '<td><span class="na" title="No goal-from-a-mark figure is ' +
            'recorded for this side. It is not counted in the total.">' +
            "&mdash;</span></td>";
        }
        return "<td>" + (n || "·") + "</td>";
      }).join("") +
      '<td class="tot">' + s2.got + "</td>";
    if (checkable) {
      var calc = pointsFrom(s2.counts, era);
      var ok = calc === s2.got;
      cells += '<td class="' + (ok ? "ok" : "bad") + '">' +
        (ok ? "✓" : "≠ " + calc) + "</td>";
    }
    return cells + "</tr>";
  }).join("");
  var rest = checkable
    ? '<tr class="restate"><td>restated under ' + latest[0] + " rules</td>" +
      '<td colspan="' + HALF + '"></td><td class="tot">' +
      pointsFrom(sides[0].counts, latest.slice(1)) + " – " +
      pointsFrom(sides[1].counts, latest.slice(1)) + "</td><td></td></tr>"
    : "";
  var note = checkable
    ? 'Counted under the points values in force in ' + y +
      '. A "·" is a zero, not a gap.'
    : "This archive holds no points table earlier than " + SC.rows[0][0] +
      ", so the " + y + " score is neither checked against the breakdown nor " +
      'restated. A "·" is a zero, not a gap.';
  return '<section class="dgroup wide"><h4>Scoring breakdown</h4>' +
    '<div class="dscroll"><table>' + head + body + rest + "</table></div>" +
    '<p class="dnote">' + note + "</p></section>";
}

function drawerHTML(i) {
  var r = ROWS[i], c = context(r);
  var hn = homeName(r), an = awayName(r);
  var hr = r[F.home_rank_before], ar = r[F.away_rank_before];
  var hR = r[F.home_rating_before], aR = r[F.away_rating_before];
  var awarded = /awarded|walkover|abandon/i.test(c.type || "");

  function dd(label, val) {
    return "<dt>" + label + "</dt><dd>" + (val === null || val === undefined ||
      val === "" ? NR() : val) + "</dd>";
  }

  /* ---- 1. match context ---- */
  var ctx = "<dl>" +
    dd("Competition or tour", c.comp ? esc(c.comp) : null) +
    (c.trophy ? "<dt>Trophy</dt><dd>" + esc(c.trophy) + "</dd>" : "") +
    dd("Stadium", c.stadium ? esc(c.stadium) : null) +
    dd("City", c.city ? esc(c.city) : null) +
    dd("Country", c.country ? esc(c.country) : null) +
    /* 167 dates are typed as text in the workbook and could mean two days.
       Naming a weekday on those asserts something the data cannot support. */
    dd("Weekday", r[F.date_guessed]
        ? '<span class="na">the date is ambiguous, so no weekday is claimed</span>'
        : DAYS[DOW[i]]) +
    dd("Attendance", c.crowd ? fmtNum(c.crowd)
        : (awarded ? NA("An awarded or walkover match was never played")
                   : null)) +
    dd("Match type", c.type ? esc(c.type) : null) +
    "</dl>";

  /* ---- 2. rankings at kickoff ---- */
  var rank;
  if (hr === null && ar === null) {
    rank = '<p class="none">Neither side had a rating yet when this match ' +
           "kicked off.</p>";
  } else {
    rank = "<dl>" +
      "<dt>" + esc(hn) + "</dt><dd>" +
        (hr === null ? '<span class="na">no rating yet</span>'
          : "#" + hr + (hR === null ? "" :
            ' <span class="rt">' + hR.toFixed(2) + "</span>")) + "</dd>" +
      "<dt>" + esc(an) + "</dt><dd>" +
        (ar === null ? '<span class="na">no rating yet</span>'
          : "#" + ar + (aR === null ? "" :
            ' <span class="rt">' + aR.toFixed(2) + "</span>")) + "</dd>" +
      "</dl>";
  }
  rank += '<p class="dnote">Reconstructed by this archive by replaying every ' +
    "match from 1871 under World Rugby's points exchange. These are not " +
    "World Rugby's published tables, which begin in 2003.</p>";

  /* ---- 2b. World Rugby's own published ranking ----
     A SECOND SOURCE, SHOWN ALONGSIDE. Not a check on the block above and not
     a correction of it. The two count different populations - this archive
     ranks 177 sides, World Rugby ranks 114 - and World Rugby seeded its
     ratings in October 2003 while these are replayed from 1871. Same scale,
     different origin. Sampled over 28 dates they agree on which side was
     higher 93% of the time and on the actual rank number 26% of the time;
     both numbers are expected, and neither says one table is wrong.
     THREE KINDS OF ABSENCE HERE, AND THEY ARE DIFFERENT:
       before 6 Oct 2003   no published table existed at all
       side not ranked     World Rugby's table does not include that side
       one side only       show the one it has, name the one it does not */
  var WR_FIRST = "2003-10-06";
  var whr = r[F.home_wr_rank], wha = r[F.away_wr_rank];
  var whR = r[F.home_wr_rating], waR = r[F.away_wr_rating];
  var wr;
  if (r[F.date] < WR_FIRST) {
    wr = '<p class="none">World Rugby published no ranking before ' +
      "6 October 2003, so there is nothing to show for this match. The " +
      "reconstructed figures are this archive's own calculations.</p>";
  } else if (!r[F.wr_available]) {
    wr = '<p class="none">Official rankings unavailable for this date.</p>';
  } else if (whr === null && wha === null) {
    wr = '<p class="none">World Rugby ranked neither side on this date.</p>';
  } else {
    function wrLine(name, pos, pts) {
      return "<dt>" + esc(name) + "</dt><dd>" +
        (pos === null
          ? '<span class="na" title="World Rugby\'s table does not include ' +
            'this side">not ranked by World Rugby</span>'
          : "#" + pos + (pts === null ? "" :
            ' <span class="rt">' + pts.toFixed(2) + "</span>")) + "</dd>";
    }
    wr = "<dl>" + wrLine(hn, whr, whR) + wrLine(an, wha, waR) + "</dl>";
  }
  /* The explanatory note belongs under numbers. On a pre-2003 match there are
     none, and "the table as it stood on the day" would then be describing a
     table that did not exist. */
  if (r[F.date] >= WR_FIRST && r[F.wr_available]) {
    wr += '<p class="dnote">World Rugby\'s published table as it stood on the ' +
      "day of the match. A separate measurement from the archive reconstruction, not " +
      "a correction of it: World Rugby ranks fewer sides and started its " +
      "ratings in 2003, so the two use different numbers for the same team.</p>";
  }

  /* ---- 4. record notes ---- */
  var notes = [];
  if (r[F.date_guessed]) {
    notes.push("The date is stored as text in the workbook and could mean two " +
      "different days. It is read here as written, and no weekday is stated.");
  }
  notes.push("Test status: " + (r[F.full_intl] === null
    ? "not established in the workbook."
    : (r[F.full_intl] ? "a full international. The workbook's own column " +
       "decides this, not the team roles."
       : "not a full international.")));
  notes.push("Sides: " + MCLASS_LONG[r[F.match_class]] + ".");
  /* TWO ROWS ARE EXCLUDED FOR A REASON THIS SENTENCE DID NOT COVER, and it
     printed "the rankings only change when both sides are countries" directly
     under "Sides: both sides are countries" - a flat self-contradiction on
     France v South Africa 1907 and Ireland v Scotland 1885, which the master
     workbook excludes by name in its own ranking column. */
  notes.push("Rankings: " + (r[F.eligible]
    ? "this result moved both ratings."
    : (r[F.match_class] === 0
        ? "no rating moved, even though both sides are countries - this match "
          + "is excluded by name in the master workbook itself."
        : "no rating moved. A match changes the rankings only when both sides "
          + "are countries.")));
  if (r[F.neutral]) {
    notes.push("Played at a neutral ground, so Home and Away here are the " +
      "fixture as listed and carry no home advantage.");
  }
  notes.push("Spreadsheet row " + r[F.excel_row] + " of the master workbook.");
  var noteHTML = "<ul class=\"dnotes\">" + notes.map(function (t) {
    return "<li>" + t + "</li>";
  }).join("") + "</ul>";

  var link = location.pathname + location.search + linkHashFor(i);
  return '<div class="drawer" id="det-' + i + '" role="region"' +
    ' aria-label="Match details">' +
    '<section class="dgroup"><h4>Match context</h4>' + ctx + "</section>" +
    '<section class="dgroup"><h4>This archive&rsquo;s ranking at kickoff</h4>' +
      rank + "</section>" +
    '<section class="dgroup"><h4>World Rugby&rsquo;s published ranking</h4>' +
      wr + "</section>" +
    scoringBlock(r, i) +
    '<section class="dgroup wide"><h4>Record notes</h4>' + noteHTML +
      '<p class="dnote"><button type="button" class="linkbtn copylink"' +
      ' data-link="' + esc(link) + '">Copy a link to this match</button></p>' +
      '<p class="dnote"><a class="report-link" href="report.html?match=' +
      encodeURIComponent(r[F.match_id] || '') + '">Report an error in this match</a></p>' +
    "</section></div>";
}

/* ------------------------------------------- virtual list, variable height
   The expander used to be a FIXED 132px, which is why its contents had to be
   trimmed to fit rather than the other way round. Four labelled groups cannot
   live inside a fixed box, so heights are now MEASURED.

   How it stays honest: every open row has an assumed height (ESTIMATE until
   it has been seen). After each paint the real heights are read back, and if
   any differ the spacer and offsets are recomputed and the row is repainted.
   Crucially, when a correction lands ABOVE the current scroll position the
   scrollTop is adjusted by the same delta - otherwise measuring would yank
   the page under the reader's eyes, which is exactly the thing the brief
   asked to preserve. Convergence is guaranteed: a height is written once per
   open row and never oscillates, and the loop is capped anyway. */
/* THE ESTIMATE LEARNS. A fixed 260px guess against real drawers of 430-490px
   meant that with many rows open the arithmetic put the painted block off
   screen entirely - "Expand all" produced a blank table at most scroll
   positions. Every measurement now feeds a running mean that becomes the
   estimate for every drawer not yet seen, so after the first painted row the
   model is within a few percent instead of out by 45%. */
var DRAWER_EST = 300;
var estSum = 0, estN = 0;
var drawerH = {};              // data-row index -> measured px
function noteHeight(h) {
  estSum += h; estN++;
  DRAWER_EST = Math.round(estSum / estN);
}
function hOf(i) { return open[i] ? (drawerH[i] || DRAWER_EST) : 0; }

var openAt = [];               // sorted view positions that are open
function reindexOpen() {
  openAt = [];
  for (var k = 0; k < view.length; k++) if (open[view[k]]) openAt.push(k);
}
function openBefore(k) {
  var n = 0;
  for (var j = 0; j < openAt.length && openAt[j] < k; j++) n += hOf(view[openAt[j]]);
  return n;
}
function yOf(k) { return k * ROW_H + openBefore(k); }
function totalH() {
  var extra = 0;
  for (var j = 0; j < openAt.length; j++) extra += hOf(view[openAt[j]]);
  return view.length * ROW_H + extra;
}
function firstAt(y) {
  var lo = 0, hi = view.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (yOf(mid) < y) lo = mid + 1; else hi = mid;
  }
  return Math.max(0, lo - 1);
}

var measuring = false;
/* One measuring pass. Returns true if anything moved, so the caller can settle
   in a bounded loop rather than converging one step per repaint - which is
   what left the paint window stale when many rows were open at once. */
function measurePass() {
  var nodes = bodyEl.querySelectorAll(".drawer");
  var changed = 0, above = 0, top = wrap.scrollTop;
  var wrapTop = wrap.getBoundingClientRect().top;
  for (var n = 0; n < nodes.length; n++) {
    var el = nodes[n];
    var i = +el.id.slice(4);
    var h = el.offsetHeight;
    if (!h) continue;
    if (drawerH[i] !== h) {
      var delta = h - (drawerH[i] || DRAWER_EST);
      drawerH[i] = h;
      noteHeight(h);
      changed++;
      /* A correction ABOVE the viewport would slide everything the reader is
         looking at; move the scroll by the same amount so nothing appears to
         jump. Corrections below the viewport are invisible and need nothing. */
      if (el.getBoundingClientRect().bottom < wrapTop) above += delta;
    }
  }
  if (!changed) return false;
  spacer.style.height = totalH() + "px";
  if (above) wrap.scrollTop = top + above;
  return true;
}

function measureOpen() {
  if (measuring) return false;
  measuring = true;
  var moved = false;
  /* Bounded: each pass writes a height that is never written again, so this
     terminates on its own; the cap is only a guard against a pathological
     layout that reports a different height every read. */
  for (var pass = 0; pass < 4; pass++) {
    if (!measurePass()) break;
    moved = true;
    paintOnce();
  }
  measuring = false;
  return moved;
}

function paintOnce() {
  var top = wrap.scrollTop;
  /* BOTH BOUNDS ARE IN PIXELS, AND BOTH ARE MEASURED FROM THE SCROLL
     POSITION. They used to be mixed: the start over-scanned FOUR ROWS
     backwards while the stop budget was counted forward from wherever those
     four rows began. Once two of them were open, `yTop` sat a thousand pixels
     above the viewport, `limit` fell BELOW `top`, and the loop finished before
     it reached a single row that was actually on screen - two clicks and a
     scroll and all 11,243 matches vanished into blank space, with no error.
     Backing off by four ROW HEIGHTS instead of four rows keeps the over-scan
     bounded no matter how tall the open rows above happen to be. */
  var first = firstAt(Math.max(0, top - ROW_H * 4));
  var yTop = yOf(first);
  var html = "", k = first, y = yTop;
  var limit = top + wrap.clientHeight + ROW_H * 10;
  while (k < view.length && y < limit) {
    html += rowHTML(view[k], k);
    y += ROW_H + hOf(view[k]);
    k++;
  }
  bodyEl.style.transform = "translateY(" + yTop + "px)";
  var refocus = grabFocus();
  bodyEl.innerHTML = html;
  restoreFocus(refocus);
  syncHeadScroll();
}

function paint() {
  /* A measuring pass can move scrollTop, which fires the scroll listener,
     which calls this again. Re-entering would restart the settling loop from
     the middle of itself, so a nested call just repaints and returns. */
  if (measuring) { paintOnce(); return; }
  paintOnce();
  if (!openAt.length) return;
  /* Settle the height model, then paint ONE more time. Without this last
     pass the rendered block is the one computed BEFORE the final correction,
     which with many drawers open could sit entirely outside the viewport -
     the table looked empty at some scroll positions even though every row
     was accounted for in the spacer. */
  if (measureOpen()) paintOnce();
  ensureVisible();
}

/* THE INVARIANT: while there are rows, the viewport is never empty.
   Heights are estimated until each drawer has been seen once, so with many
   drawers open the error accumulates down the list and a long jump can land
   between the painted block and the truth. Rather than chase ever-better
   estimates, this asserts the thing that actually matters and repairs it: if
   nothing intersects the viewport, snap the scroll onto the row the model
   says belongs there and paint again. Costs one measurement per paint and
   makes a blank table impossible by construction. */
function ensureVisible() {
  if (!view.length || measuring) return;
  var wt = wrap.getBoundingClientRect();
  var rows = bodyEl.children, n = rows.length, i;
  for (i = 0; i < n; i++) {
    var b = rows[i].getBoundingClientRect();
    if (b.bottom > wt.top && b.top < wt.bottom) return;   // something is there
  }
  var k = Math.min(view.length - 1, firstAt(wrap.scrollTop));
  measuring = true;
  wrap.scrollTop = yOf(k);
  paintOnce();
  measuring = false;
}

/* THE HEADING AND THE ROWS ARE SIBLINGS, not one nested inside the other, so
   the horizontal scrollbar belongs to the rows alone and the heading cannot
   follow it. With the optional columns on, or below about 950px with none of
   them, the body scrolled sideways while the heading stayed put - and every
   label then sat over the wrong column, which is worse than no heading at all.
   The stylesheet already says this out loud for the other three pages; this
   one had never applied it. Translating the heading is the cheapest fix that
   keeps a single grid definition for both. */
function syncHeadScroll() {
  head.style.transform = "translateX(" + (-wrap.scrollLeft) + "px)";
}

/* KEEPING FOCUS ALIVE ACROSS A REPAINT.
   Every activation replaced innerHTML, which destroys the element that was
   just pressed - so an expander worked exactly once, Tab restarted at the top
   of the document afterwards, and Space on a sort heading scrolled the page
   instead of sorting it. These two remember what was focused by its stable
   attribute and put focus back on the replacement. */
function grabFocus() {
  var a = document.activeElement;
  if (!a) return null;
  if (a.hasAttribute && a.hasAttribute("data-exp")) {
    return '[data-exp="' + a.getAttribute("data-exp") + '"]';
  }
  if (a.hasAttribute && a.hasAttribute("data-key")) {
    return '[data-key="' + a.getAttribute("data-key") + '"]';
  }
  return null;
}
function restoreFocus(sel) {
  if (!sel) return;
  var el = document.querySelector(sel);
  if (el) el.focus({ preventScroll: true });
}

function renderTable() {
  COLS = activeCols();
  applyGrid();
  drawHead();
  syncDisplayControls();
  /* The note explains Home and Away. In team view there is no Home or Away
     column, so it described a table that was not on screen. It lived in
     renderAnalysis, which the perspective switch never calls. */
  var tn = document.getElementById("tablenote");
  if (tn) tn.hidden = teamView();
  var live = document.getElementById("livecount");
  if (live) {
    live.textContent = view.length === 0
      ? "No matches fit the current filters."
      : fmtNum(view.length) + (view.length === 1 ? " match" : " matches") +
        " shown.";
  }
  reindexOpen();
  spacer.style.height = totalH() + "px";
  emptyEl.hidden = view.length > 0;
  if (wrap.scrollTop > totalH()) wrap.scrollTop = 0;
  paint();
  syncExpandAll();
}

function toggleRow(i, force) {
  var want = force === undefined ? !open[i] : !!force;
  if (want) open[i] = true; else delete open[i];
  renderTable();
}

/* EXPAND ALL / COLLAPSE ALL.
   "Expand all" marks every row in the current view as open - a flag per row,
   which is cheap even at 11,243 - and the virtual list still paints only what
   fits on screen, so nothing renders thousands of expanders. The one real
   cost is the height model: an unmeasured drawer uses the estimate, and the
   scrollbar settles as the reader travels. That is honest and cheap; the
   alternative is measuring 11,243 drawers up front, which is not. */
var EXPAND_LIMIT = 500;
function expandAll() {
  if (view.length > EXPAND_LIMIT) {
    if (!window.confirm("Expand all " + fmtNum(view.length) +
        " matches?\n\nThe scrollbar will settle as you travel, because each " +
        "expander is measured as it is drawn. Filtering down to " +
        fmtNum(EXPAND_LIMIT) + " or fewer first is smoother.")) return;
  }
  for (var k = 0; k < view.length; k++) open[view[k]] = true;
  renderTable();
}
function collapseAll() { open = {}; renderTable(); }
function allOpen() {
  if (!view.length) return false;
  for (var k = 0; k < view.length; k++) if (!open[view[k]]) return false;
  return true;
}
function syncExpandAll() {
  var b = document.getElementById("expandall");
  if (!b) return;
  var all = allOpen();
  b.textContent = all ? "Collapse all" : "Expand all";
  b.classList.toggle('collapse-action', all);
  b.disabled = !view.length;
}

/* ------------------------------------------------- link to a single match
   Keyed on the SPREADSHEET ROW, not on a position in the filtered view: a
   position means nothing once the filters differ, and the workbook row is the
   one identifier that survives a re-sort. */
function linkHashFor(i) {
  var h = location.hash.replace(/^#/, "");
  var parts = h ? h.split("&").filter(function (p) {
    return p.slice(0, 6) !== "match=";
  }) : [];
  parts.push("match=" + encodeURIComponent(ROWS[i][F.match_id]));
  return "#" + parts.join("&");
}
function rowForExcel(n) {
  if (typeof n === "number") n = (window.RUGBY_LEGACY_MATCH_IDS || {})[n] || null;
  for (var i = 0; i < N; i++) {
    if (typeof n === "number" ? ROWS[i][F.excel_row] === n : ROWS[i][F.match_id] === n) return i;
  }
  return -1;
}
/* Open the linked match and put it on screen. Called after the first render,
   so `view` is already built. */
function gotoMatch(excelRow) {
  var i = rowForExcel(excelRow);
  if (i < 0) return false;
  var k = view.indexOf(i);
  if (k < 0) return false;           // filtered out of the current view
  open[i] = true;
  renderTable();
  wrap.scrollTop = Math.max(0, yOf(k) - ROW_H * 2);
  paint();
  /* Measuring can move it once; put it back where the reader expects it. */
  wrap.scrollTop = Math.max(0, yOf(view.indexOf(i)) - ROW_H * 2);
  paint();
  var el = bodyEl.querySelector('[data-exp="' + i + '"]');
  if (el) el.focus({ preventScroll: true });
  return true;
}

/* Called on first load AND on every hashchange. Pasting a link into the
   address bar of a page that is already open is a HASHCHANGE, not a load, and
   the first version of this only ran at init - so the very gesture the
   feature exists for (someone sends you a link, you paste it) was the one
   that silently did nothing. */
function openLinkedMatch(raw) {
  var wanted = matchFromHash(raw);
  var warn = document.querySelector(".fchip.warn");
  if (warn) warn.remove();
  if (wanted === null) return;
  if (!gotoMatch(wanted)) notFoundMatch(wanted);
}

function notFoundMatch(excelRow) {
  var bar = document.getElementById("chipbar");
  var set = document.getElementById("chipset");
  if (!bar || !set) return;
  bar.hidden = false;
  set.insertAdjacentHTML("beforeend",
    '<span class="fchip warn">The linked match (' +
    esc(excelRow) + ") is not available in this filtered list</span>");
}

function setText(id, v) { document.getElementById(id).textContent = v; }

/* WITHOUT A TEAM OR AN OPPONENT, MOST OF THIS PANEL IS MEANINGLESS.
   Every W/D/L figure here runs through outcome(), which falls back to the
   HOME team when no side is selected - so "won 5,779" means "the side listed
   at home won 5,779 times", and the "17 match winning streak" is 17
   consecutive matches won by whoever happened to be at home. Those describe
   nothing. Same for win rate, points for/against and the form strip.
   So the cards are hidden until there is a point of view to compute them
   from. The HEADING stays: it is the only place the active filters are
   confirmed back to you, and it is accurate with or without a team. */
/* NOT `MONTHS`. There is already a MONTHS in this file - the three-letter one
   the table and the CSV use - and a second `var MONTHS` in the same function
   scope silently replaces it, because var declarations hoist and the later
   assignment wins. That is exactly what happened on 7 Sep 2026: every short
   date on the page quietly became a long one, and nothing threw. */
var MONTHS_LONG = ["January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November",
                   "December"];

/* "2026-08-11" -> "11 August 2026". Built by hand from the string rather than
   through Date(), because new Date("2026-08-11") is parsed as UTC midnight and
   prints as the 10th for anyone west of Greenwich. */
function longDate(iso) {
  var p = String(iso).split("-");
  if (p.length !== 3) return String(iso);
  return String(+p[2]) + " " + MONTHS_LONG[+p[1] - 1] + " " + p[0];
}

/* Whole years ELAPSED between the first and last match. 1871-03-27 to
   2026-08-11 is 155. Two other numbers are nearby and neither is this one:
   the span in year LABELS is 156 (2026 - 1871 + 1), and the number of years
   that actually contain a match is 150 - 1915-1919 and 1941 have none. The
   tile says "years of international rugby", which is a span, so elapsed is
   the honest one. */
function yearSpan(fromIso, toIso) {
  var a = String(fromIso).split("-"), b = String(toIso).split("-");
  if (a.length !== 3 || b.length !== 3) return null;
  var y = +b[0] - +a[0];
  if (+b[1] < +a[1] || (+b[1] === +a[1] && +b[2] < +a[2])) y -= 1;
  return y;
}

function hasPerspective() { return S.teamI >= 0 || S.oppI >= 0; }

/* ONE description of the active filters, used by BOTH the analysis heading
   and the chip bar. They used to be two lists that happened to agree; a chip
   that clears a filter the sentence does not mention is how a reader ends up
   not trusting either. `clear` names the state keys this chip switches off. */
function activeFilters() {
  var team = S.team, out = [];
  function add(key, label, clear) { out.push({ key: key, label: label, clear: clear }); }
  if (team) add("team", team, ["team", "side"]);
  if (S.opp) add("opp", (team ? "against " : "involving ") + S.opp, ["opp"]);
  if (S.side === "home") add("side", team ? team + " at home" : "at home", ["side"]);
  if (S.side === "away") add("side", team ? team + " away" : "away", ["side"]);
  if (S.side === "neutral") add("side", "at neutral venues", ["side"]);
  if(S.dateFrom||S.dateTo)add("dates",(S.dateFrom||"Start")+" to "+(S.dateTo||"latest"),["dateFrom","dateTo"]);
  if (S.yearFrom || S.yearTo) {
    add("years", (S.yearFrom || 1871) + "–" + (S.yearTo || 2026),
        ["yearFrom", "yearTo"]);
  }
  if (S.dows.length) {
    add("dows", S.dows.map(function (d) { return DAYS[d] + "s"; }).join(", "),
        ["dows"]);
  }
  if (S.comp) add("comp", S.comp, ["comp"]);
  if (S.country) add("country", "in " + S.country, ["country"]);
  if (S.city) add("city", "in " + S.city, ["city"]);
  if (S.venue) add("venue", "at " + S.venue, ["venue"]);
  if (S.mclass !== "any") add("mclass", MCLASS[+S.mclass], ["mclass"]);
  if (S.full === "1") add("full", "full internationals only", ["full"]);
  if (S.full === "0") add("full", "excluding full internationals", ["full"]);
  if (S.elig === "1") add("elig", "counts towards rankings", ["elig"]);
  if (S.elig === "0") add("elig", "does not count towards rankings", ["elig"]);
  if (S.wc === "1") add("wc", "World Cup only", ["wc"]);
  if (S.wc === "0") add("wc", "excluding the World Cup", ["wc"]);
  if (S.result !== "any") {
    add("result", { W: "wins", D: "draws", L: "defeats" }[S.result] + " only",
        ["result"]);
  }
  if (S.marginMin !== null || S.marginMax !== null) {
    add("margin", "margin " + (S.marginMin === null ? "0" : S.marginMin) + "–" +
        (S.marginMax === null ? "any" : S.marginMax),
        ["marginMin", "marginMax"]);
  }
  if (S.oppRankMin !== null || S.oppRankMax !== null) {
    add("opprank", (S.rankSource === "world" ? "World Rugby: " : "Archive: ") + (team ? "opponent" : "a side") + " ranked " +
        (S.oppRankMin === null ? "1" : S.oppRankMin) + "–" +
        (S.oppRankMax === null ? "any" : S.oppRankMax) + " at the time",
        ["oppRankMin", "oppRankMax"]);
  }
  if (S.neutralFilter !== "any") add("neutralFilter", S.neutralFilter === "1" ? "marked neutral" : "not marked neutral", ["neutralFilter"]);
  if (S.breakdownFilter !== "any") add("breakdownFilter", S.breakdownFilter === "1" ? "complete scoring breakdown" : "incomplete scoring breakdown", ["breakdownFilter"]);
  return out;
}

var DEFAULTS = {dateFrom:"",dateTo:"", rankSource: "archive", neutralFilter: "any", breakdownFilter: "any", team: "", opp: "", country: "", city: "", venue: "", comp: "",
                 side: "any", wc: "any", elig: "any", result: "any",
                 mclass: "any", full: "any", yearFrom: null, yearTo: null,
                 marginMin: null, marginMax: null, oppRankMin: null,
                 oppRankMax: null };

function renderChips() {
  var list = activeFilters();
  var bar = document.getElementById("chipbar");
  var set = document.getElementById("chipset");
  if (!bar || !set) return;
  bar.hidden = !list.length;
  set.innerHTML = list.map(function (f, n) {
    return '<button type="button" class="fchip" data-chip="' + n + '"' +
      ' aria-label="Remove filter: ' + esc(f.label) + '">' + esc(f.label) +
      ' <span class="x" aria-hidden="true">×</span></button>';
  }).join("");
}

function renderAnalysis(a) {
  var team = S.team;
  var persp = team || "the home team";
  document.getElementById("an-title").textContent =
    team ? team : (S.opp ? S.opp + " — all matches" : "Every match");
  var bits = activeFilters().map(function (f) { return f.label; });
  renderChips();

  document.getElementById("an-sub").textContent =
    bits.length ? bits.join(" · ") : "no filters — the whole archive";

  /* THE HOME/AWAY CONTROL IS DEAD WITHOUT A TEAM. The side branch in passes()
     sits inside `if (t >= 0)`, so with no team chosen all three buttons
     return the identical 10,128 rows - you could click Home, watch nothing
     move, and get no explanation. It is disabled until a team is picked, and
     its label names the team so it is obvious whose home matches you are
     asking for. Note: TEAM only, not opponent - an opponent gives the stats a
     perspective but does not make this control do anything. */
  var sideWrap = document.getElementById("f-side-wrap");
  if (sideWrap) {
    var live = S.teamI >= 0;
    sideWrap.classList.toggle("disabled", !live);
    [].forEach.call(sideWrap.querySelectorAll("#f-side button"), function (btn) {
      btn.disabled = !live;
    });
    document.getElementById("side-label").textContent =
      live ? team + " playing at" : "Playing at";
    document.getElementById("side-note").textContent = live
      ? "At World Cups and other neutral venues this is only how the fixture "
        + "was listed, not a real home advantage."
      : "Pick a team above first — this filters that team's matches, so it "
        + "does nothing on its own.";
  }

  var cards = document.querySelector(".analysis .cards");
  var show = hasPerspective();
  if (cards) cards.hidden = !show;

  /* THE HERO IS THE EMPTY STATE, and only the empty state. It appears when no
     team, no opponent and no other filter is set - the one moment the stats
     cards have nothing to say and the space is otherwise blank. The moment
     any filter lands it disappears and the analysis header takes over, so the
     two never both claim to describe what is on screen. */
  var virgin = !show && bits.length === 0;
  var hero = document.getElementById("hero");
  if (hero) hero.hidden = !virgin;
  var ahead = document.querySelector(".analysis .analysis-head");
  if (ahead) ahead.hidden = virgin;
  /* With both its children hidden the analysis block was still painting its
     own padding and bottom border - a ~30px dead band between the hero and
     the table. Hide the container too. Safe on a phone: the Stats toggle that
     opens this block is itself hidden whenever `virgin` is true. */
  var abox = document.getElementById("analysis");
  if (abox) abox.hidden = virgin;
  /* the phone Stats toggle has nothing to toggle when the cards are gone */
  var stog = document.getElementById("statstoggle");
  if (stog) {
    stog.hidden = !show;
    if (!show) {
      document.body.classList.remove("stats-open");
      stog.textContent = "Stats";
      stog.setAttribute("aria-expanded", "false");
    }
  }

  /* Phone only: the filter panel is collapsed by default there, so the count
     has to be visible on the bar or an active filter becomes invisible and
     the row count looks wrong. */
  var fc = document.getElementById("filtercount");
  if (fc) {
    fc.textContent = bits.length
      ? bits.length + (bits.length === 1 ? " filter on" : " filters on")
      : "showing everything";
  }

  document.getElementById("wdl-label").textContent =
    "Played / Won / Drawn / Lost — from " + persp + "'s point of view";
  document.getElementById("result-label").textContent =
    "Result (" + persp + ")";

  setText("k-played", fmtNum(a.played));
  setText("k-won", fmtNum(a.won));
  setText("k-drawn", fmtNum(a.drawn));
  setText("k-lost", fmtNum(a.lost));
  setText("k-winpct", pct(a.won, a.played));
  setText("k-winpct-sub", a.played
    ? "with draws as half a win: " + pct(a.won + a.drawn / 2, a.played)
    : "");
  setText("k-points", a.played ? fmtNum(a.pf) + " – " + fmtNum(a.pa) : "–");
  setText("k-points-sub", a.played
    ? (a.pf - a.pa >= 0 ? "+" : "") + fmtNum(a.pf - a.pa) + " difference"
    : "");
  setText("k-avg", a.played
    ? (a.pf / a.played).toFixed(1) + " – " + (a.pa / a.played).toFixed(1)
    : "–");
  setText("k-avg-sub", a.played ? "per match" : "");

  var bar = document.getElementById("winbar");
  var tot = a.played || 1;
  bar.children[0].style.width = (100 * a.won / tot) + "%";
  bar.children[1].style.width = (100 * a.drawn / tot) + "%";
  bar.children[2].style.width = (100 * a.lost / tot) + "%";

  function rec(x, unit) {
    if (!x) return "–";
    return scoreline(x.r) + "  ·  " + x.d + " " + unit + "  ·  " +
           fmtDate(x.r[F.date]);
  }
  setText("k-bigwin", rec(a.bigWin, "pt margin"));
  setText("k-bigloss", rec(a.bigLoss, "pt margin"));
  setText("k-highest", rec(a.highest, "pts total"));
  setText("k-span", a.first
    ? fmtDate(a.first[F.date]) + "  →  " + fmtDate(a.last[F.date]) : "–");

  function runTxt(n, span) {
    if (!n) return "–";
    return n + " match" + (n === 1 ? "" : "es") + "  (" +
      span[0][F.date].slice(0, 4) +
      (span[0][F.date].slice(0, 4) === span[1][F.date].slice(0, 4) ? "" :
        "–" + span[1][F.date].slice(0, 4)) + ")";
  }
  setText("k-winstreak", runTxt(a.wBest, a.wSpan));
  setText("k-unbeaten", runTxt(a.uBest, a.uSpan));
  setText("k-losestreak", runTxt(a.lBest, a.lSpan));

  document.getElementById("k-form").innerHTML = a.form.map(function (r) {
    return '<i class="' + r + '">' + r + "</i>";
  }).join("");

  setText("rowcount", fmtNum(a.played));
  /* THE EXPORT SAYS WHAT IT WILL EXPORT. "Download this list as CSV" gave no
     clue whether "this list" meant the filtered set or all 11,243. */
  var ex = document.getElementById("export");
  if (ex) {
    ex.textContent = "Export " + fmtNum(view.length) +
      (activeFilters().length ? " filtered matches" : " matches");
  }
  /* Team view only exists with a team selected, and it says whose view it is
     rather than leaving "Result" to be read from nowhere. */
  var vsw = document.getElementById("viewswitch");
  if (vsw) {
    vsw.hidden = S.teamI < 0;
    if (S.teamI >= 0) {
      document.getElementById("vs-team").textContent = S.team + "'s view";
      document.getElementById("vs-label").textContent = "Perspective";
    }
  }

  document.getElementById("pctall").textContent =
    a.played === N ? "" : "of " + fmtNum(N) + " (" +
      (100 * a.played / N).toFixed(1) + "%)";
}

var lastRefreshMs = 0;

function refresh() {
  var t0 = performance.now();
  applyFilters();
  view = sortView();
  var a = analyse(view);
  renderAnalysis(a);
  window.renderRankingRecords(S.team, S.opp);
  window.RugbyInsights.render(D, view, S.teamI, a, function(source,lo,hi){
    S.rankSource=source;S.oppRankMin=lo;S.oppRankMax=hi;syncControls();refresh();
  });
  drawHead();
  renderTable();
  /* Kept as a number, no longer painted on the page: how many milliseconds a
     recompute took is a fact about my code, not about rugby, and it sat in the
     toolbar next to the match count as though the two were comparable.
     verify_site.py times this independently and never read the element. */
  lastRefreshMs = performance.now() - t0;
  window.FilterCharts.render({team:S.teamI>=0?S.team:null,from:S.yearFrom,to:S.yearTo,stats:a,
    rows:view.map(function(i){var r=ROWS[i],sc=myScores(r);return {date:r[F.date],pf:sc[0],pa:sc[1],archiveRank:r[r[F.home]===S.teamI?F.away_rank_before:F.home_rank_before],worldRank:r[F.wr_available]?r[r[F.home]===S.teamI?F.away_wr_rank:F.home_wr_rank]:null};}),
    open:function(from,to){S.yearFrom=from;S.yearTo=to;syncControls();refresh();}
  });
  writeHash();
}


/* The theme switch lives in assets/theme.js, loaded from the <head> of every
   page. It used to live here, which meant it only ran on this page - the
   other three drew the buttons and wired them to nothing. */

// ------------------------------------------------------------------- wire
function fill(sel, values, placeholder) {
  var el = document.getElementById(sel);
  var html = '<option value="">' + placeholder + "</option>";
  for (var i = 0; i < values.length; i++) {
    html += '<option value="' + esc(values[i]) + '">' + esc(values[i]) + "</option>";
  }
  el.innerHTML = html;
  return el;
}

/* CASCADING VENUE PICKERS.
   Country narrows City; Country and City together narrow Venue. Nothing is
   fetched - every row already carries its country, city and stadium index,
   so this is one pass over the rows counting which values survive.

   Two things this has to get right:
   1. A selection can be INVALIDATED by a change above it. Pick Cardiff, then
      switch the country to France, and Cardiff is no longer a legal choice -
      it is cleared rather than left set to something the list cannot show,
      which would silently filter to zero matches.
   2. It deliberately keys on COUNTRY and CITY ONLY, not on the whole filter
      state. Narrowing the venue list by year or team as well would mean the
      list shifted under you every time you touched an unrelated control. */
function venueOptionsFor(field, whereCountry, whereCity) {
  var seen = Object.create(null);
  for (var i = 0; i < N; i++) {
    var r = ROWS[i];
    if (r[F[field]] === null) continue;
    if (whereCountry >= 0 && r[F.country] !== whereCountry) continue;
    if (whereCity >= 0 && r[F.city] !== whereCity) continue;
    var name = LK[field === "stadium" ? "stadium" : field][r[F[field]]];
    seen[name] = (seen[name] || 0) + 1;
  }
  return Object.keys(seen).sort().map(function (name) {
    return { name: name, n: seen[name] };
  });
}

function fillCounted(sel, rows, placeholder) {
  var el = document.getElementById(sel);
  var html = '<option value="">' + placeholder + "</option>";
  for (var i = 0; i < rows.length; i++) {
    html += '<option value="' + esc(rows[i].name) + '">' + esc(rows[i].name) +
            " (" + fmtNum(rows[i].n) + ")</option>";
  }
  el.innerHTML = html;
  return el;
}

/* Rebuild City and Venue for the current Country (and City). Returns true if
   it had to drop a selection that is no longer reachable, so the caller knows
   a refresh is needed. */
function syncVenuePickers() {
  var ci = S.country ? LK.country.indexOf(S.country) : -1;
  var cityRows = venueOptionsFor("city", ci, -1);
  var dropped = false;
  if (S.city && !cityRows.some(function (o) { return o.name === S.city; })) {
    S.city = ""; dropped = true;
  }
  fillCounted("f-city", cityRows,
              ci >= 0 ? "Any city in " + S.country : "Any city");
  document.getElementById("f-city").value = S.city;

  var cy = S.city ? LK.city.indexOf(S.city) : -1;
  var venueRows = venueOptionsFor("stadium", ci, cy);
  if (S.venue && !venueRows.some(function (o) { return o.name === S.venue; })) {
    S.venue = ""; dropped = true;
  }
  fillCounted("f-venue", venueRows,
              S.city ? "Any venue in " + S.city
                     : (ci >= 0 ? "Any venue in " + S.country : "Any venue"));
  document.getElementById("f-venue").value = S.venue;
  return dropped;
}

function countPresent(field) {
  var n = 0;
  for (var i = 0; i < N; i++) if (ROWS[i][field] !== null) n++;
  return n;
}

function init() {
  /* A build timestamp to the second and a source filename are things only I
     need. How far the record reaches is what a reader wants.
     IT MUST NOT SAY "COMPLETE TO". This string is generated from the last row,
     so it would assert completeness whatever the archive happened to be
     missing - and on 7 Sep 2026 it was missing three senior internationals
     (South Africa v New Zealand on 22 and 29 August, Argentina v Australia on
     29 August). A statement of fact about the last row is always true; a
     statement of completeness is a promise this line cannot keep. */
  document.getElementById("buildinfo").textContent =
    "Latest match in the archive: " + longDate(D.meta.last_match);

  setText("hero-matches", fmtNum(D.meta.matches));
  setText("hero-teams", fmtNum(D.meta.teams));
  var yrs = yearSpan(D.meta.first_match, D.meta.last_match);
  setText("hero-years", yrs === null ? "–" : fmtNum(yrs));

  // Teams sorted by how much they played — the ones he wants are at the top,
  // and the full alphabetical list follows.
  var counts = {};
  for (var i = 0; i < N; i++) {
    counts[ROWS[i][F.home]] = (counts[ROWS[i][F.home]] || 0) + 1;
    counts[ROWS[i][F.away]] = (counts[ROWS[i][F.away]] || 0) + 1;
  }
  var byName = TEAMS.slice().sort();
  var top = TEAMS.slice().sort(function (a, b) {
    return (counts[teamIdx[b]] || 0) - (counts[teamIdx[a]] || 0);
  }).slice(0, 12);

  function teamOptions(placeholder) {
    var h = '<option value="">' + placeholder + "</option>";
    h += '<optgroup label="Most played">';
    top.forEach(function (t) {
      h += '<option value="' + esc(t) + '">' + esc(t) + " (" +
           fmtNum(counts[teamIdx[t]]) + ")</option>";
    });
    h += "</optgroup><optgroup label=\"All teams, A–Z\">";
    byName.forEach(function (t) {
      h += '<option value="' + esc(t) + '">' + esc(t) + " (" +
           fmtNum(counts[teamIdx[t]] || 0) + ")</option>";
    });
    return h + "</optgroup>";
  }
  document.getElementById("f-team").innerHTML = teamOptions("Any team");
  document.getElementById("f-opp").innerHTML = teamOptions("Any opponent");

  /* Country, city and venue are now three exact pickers rather than one
     substring box. NOTE THE COST, it is deliberate and accepted: 42 stadium
     entries are the same ground under different names - Murrayfield appears
     four times - so picking one returns that spelling's matches only. The
     substring search used to catch all four at once. This becomes correct
     when the stadium names are deduplicated in the source data.
     The "— recorded on N of 10,128" coverage notes were removed on request. */
  fillCounted("f-country", venueOptionsFor("country", -1, -1), "Anywhere");
  fill("f-comp", LK.competition.slice().sort(), "Any competition");
  syncVenuePickers();

  // --- events
  function onSel(id, key) {
    document.getElementById(id).addEventListener("change", function () {
      S[key] = this.value; refresh();
    });
  }
  onSel("f-team", "team"); onSel("f-opp", "opp");
  onSel("f-venue", "venue"); onSel("f-comp", "comp");
  ["f-country", "f-city"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", function () {
      S[id === "f-country" ? "country" : "city"] = this.value;
      syncVenuePickers();
      refresh();
    });
  });

  function onNum(id, key) {
    document.getElementById(id).addEventListener("input", function () {
      var v = this.value.trim();
      S[key] = v === "" ? null : +v;
      refresh();
    });
  }
  onNum("f-year-from", "yearFrom"); onNum("f-year-to", "yearTo");
  onNum("f-margin-min", "marginMin"); onNum("f-margin-max", "marginMax");
  onSel('f-rank-source','rankSource');onSel('f-neutral','neutralFilter');onSel('f-breakdown','breakdownFilter');
  document.getElementById('rank-preset').addEventListener('change',function(){var v=this.value;if(v==='custom'){document.getElementById('rank-custom').hidden=false;return;}S.oppRankMin=v?(v.indexOf('top')===0?1:+v):null;S.oppRankMax=v?+v.replace('top',''):null;syncControls();refresh();});
  onNum("f-oppr-min", "oppRankMin"); onNum("f-oppr-max", "oppRankMax");

  function segGroup(id, key) {
    var box = document.getElementById(id);
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      [].forEach.call(box.children, function (c) { c.classList.remove("on"); });
      b.classList.add("on");
      S[key] = b.dataset.v;
      refresh();
    });
  }
  segGroup("f-side", "side");
  segGroup("f-wc", "wc"); segGroup("f-elig", "elig");
  segGroup("f-mclass", "mclass"); segGroup("f-full", "full");
  segGroup("f-result", "result");

  document.getElementById("f-dow").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    b.classList.toggle("on");
    var v = +b.dataset.v, at = S.dows.indexOf(v);
    if (at === -1) S.dows.push(v); else S.dows.splice(at, 1);
    refresh();
  });

  document.getElementById("f-era").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var on = b.classList.contains("on");
    [].forEach.call(this.children, function (c) { c.classList.remove("on"); });
    if (on) { S.yearFrom = S.yearTo = null; }
    else {
      b.classList.add("on");
      S.yearFrom = +b.dataset.from; S.yearTo = +b.dataset.to;
    }
    document.getElementById("f-year-from").value = S.yearFrom || "";
    document.getElementById("f-year-to").value = S.yearTo || "";
    refresh();
  });

  /* One listener on the body, not one per button: the table repaints
     constantly, so per-row listeners would be attached and thrown away
     thousands of times a minute. */
  bodyEl.addEventListener("click", function (e) {
    var cp = e.target.closest ? e.target.closest(".copylink") : null;
    if (cp) {
      var url = location.origin === "null" || location.protocol === "file:"
        ? location.href.split("#")[0] + cp.getAttribute("data-link").replace(
            location.pathname + location.search, "")
        : location.origin + cp.getAttribute("data-link");
      copyText(url, cp);
      return;
    }
    var btn = e.target.closest ? e.target.closest("[data-exp]") : null;
    if (!btn) return;
    toggleRow(+btn.getAttribute("data-exp"));
  });

  /* The heading cells are real <button>s now, so Enter and Space work without
     a keydown handler of their own; the click listener catches both. */
  head.addEventListener("click", function (e) {
    var d = e.target.closest("[data-key]"); if (!d) return;
    var key = d.dataset.key; if (!key) return;
    if (S.sort === key) S.dir = -S.dir;
    else { S.sort = key; S.dir = (key === "home" || key === "away" ||
                                  key === "comp" || key === "venue") ? 1 : -1; }
    view = sortView(); renderTable();
    /* The hash carries sort and dir, but this handler never wrote it - so a
       sort was in the URL only if some LATER filter change happened to flush
       it, which is a URL that is right sometimes for reasons the reader
       cannot see. */
    writeHash();
  });

  wrap.addEventListener("scroll", paint, { passive: true });
  /* Re-read the row height before repainting: crossing the phone breakpoint
     changes it, and painting on stale numbers is how a virtual table tears. */
  window.addEventListener("resize", function () {
    if (readMetrics()) renderTable(); else paint();
  });

  var ftog = document.getElementById("filtertoggle");
  if (ftog) {
    ftog.addEventListener("click", function () {
      var openNow = document.body.classList.toggle("filters-open");
      ftog.setAttribute("aria-expanded", String(openNow));
      ftog.textContent = openNow ? "Hide filters" : "Filters";
      /* The table is below the panel, so its height changes when the panel
         opens. Repaint or the virtual rows sit at stale offsets. */
      paint();
    });
  }

  var stog = document.getElementById("statstoggle");
  if (stog) {
    stog.addEventListener("click", function () {
      var openNow = document.body.classList.toggle("stats-open");
      stog.setAttribute("aria-expanded", String(openNow));
      stog.textContent = openNow ? "Hide stats" : "Stats";
      paint();
    });
  }

  document.getElementById("reset").addEventListener("click", function () {
    location.hash = "";
    resetAll();
  });

  document.getElementById("export").addEventListener("click", exportCSV);
  var tableGuide = document.querySelector(".tableguide");
  if (tableGuide) tableGuide.addEventListener("toggle", renderTable);

  /* ---- filter chips ---- */
  document.getElementById("chipset").addEventListener("click", function (e) {
    var b = e.target.closest("[data-chip]"); if (!b) return;
    var f = activeFilters()[+b.getAttribute("data-chip")];
    if (!f) return;
    f.clear.forEach(function (k) {
      S[k] = (k === "dows") ? [] : DEFAULTS[k];
    });
    if (S.team === "") VIEWMODE = "fixture";
    syncControls(); refresh();
  });
  document.getElementById("chipclear").addEventListener("click", function () {
    location.hash = ""; resetAll();
  });

  /* ---- row density ---- */
  document.getElementById("f-density").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]"); if (!b) return;
    DENSITY = b.dataset.v;
    savePrefs(); syncDisplayControls();
    drawerH = {};              // a density change re-flows every expander
    renderTable();
  });

  /* ---- fixture view vs team view ---- */
  document.getElementById("f-view").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]"); if (!b) return;
    VIEWMODE = b.dataset.v;
    savePrefs(); syncDisplayControls();
    /* RE-SORT. The away column becomes the OPPONENT column in team view, and
       the opponent is whichever side is not the selected team - so half the
       rows sort on a different name in one view than the other. Without this
       the heading said "Opponent A-Z" over an order that was still filed by
       the away side, which for Wales meant 190 inversions and a 400-row block
       under "W". A heading that lies about the order is worse than no sort. */
    view = sortView();
    renderTable();
  });

  /* ---- optional columns ---- */
  var colbtn = document.getElementById("colbtn");
  var colpanel = document.getElementById("colpanel");
  colbtn.addEventListener("click", function () {
    var openNow = colpanel.hidden;
    colpanel.hidden = !openNow;
    colbtn.setAttribute("aria-expanded", String(openNow));
  });
  document.addEventListener("click", function (e) {
    if (colpanel.hidden) return;
    if (colpanel.contains(e.target) || colbtn.contains(e.target)) return;
    colpanel.hidden = true;
    colbtn.setAttribute("aria-expanded", "false");
  });
  colpanel.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      colpanel.hidden = true;
      colbtn.setAttribute("aria-expanded", "false");
      colbtn.focus();
    }
  });
  colbtn.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !colpanel.hidden) {
      colpanel.hidden = true;
      colbtn.setAttribute("aria-expanded", "false");
    }
  });
  colpanel.addEventListener("change", function (e) {
    var cb = e.target.closest("input[data-col]"); if (!cb) return;
    OPT[cb.getAttribute("data-col")] = cb.checked;
    savePrefs(); renderTable();
  });

  /* ---- expand all / collapse all ---- */
  document.getElementById("expandall").addEventListener("click", function () {
    if (allOpen()) collapseAll(); else expandAll();
  });

  syncDisplayControls();
  readHash();
  syncControls();
  refresh();

  document.getElementById("loading").hidden = true;
  document.getElementById("app").hidden = false;
  paint();

  /* A link to one match opens it and scrolls to it. THIS HAS TO RUN AFTER THE
     APP IS UNHIDDEN. While #app is hidden the scroller's clientHeight is 0, so
     setting scrollTop does nothing and the virtual list paints almost no rows
     - the linked match was being opened into a viewport that did not exist
     yet, and the final paint then started again from the top. */
  openLinkedMatch();
}

function resetAll() {
  S.dateFrom=S.dateTo="";
  S.team = S.opp = S.country = S.city = S.venue = S.comp = "";
  S.side = S.wc = S.elig = S.result = S.mclass = S.full = "any";
  S.yearFrom = S.yearTo = S.marginMin = S.marginMax = null;
  S.oppRankMin = S.oppRankMax = null;S.rankSource="archive";S.neutralFilter=S.breakdownFilter="any";
  S.dows = [];
  S.sort = "date"; S.dir = -1;
  syncControls();
  refresh();
}

function syncControls() {
  document.getElementById('f-rank-source').value=S.rankSource;
  document.getElementById('f-neutral').value=S.neutralFilter;document.getElementById('f-breakdown').value=S.breakdownFilter;
  var rankPreset=S.oppRankMin===null&&S.oppRankMax===null?'':S.oppRankMin===S.oppRankMax&&[1,2,3,4,5].includes(S.oppRankMin)?String(S.oppRankMin):S.oppRankMin===1&&[5,10].includes(S.oppRankMax)?'top'+S.oppRankMax:'custom';
  document.getElementById('rank-preset').value=rankPreset;
  document.getElementById('rank-custom').hidden=rankPreset!=='custom';
  document.getElementById("f-team").value = S.team;
  document.getElementById("f-opp").value = S.opp;
  document.getElementById("f-country").value = S.country;
  document.getElementById("f-comp").value = S.comp;
  /* rebuilds City and Venue for whatever Country is now set, and re-applies
     their values - a deep link or a reset can change all three at once */
  syncVenuePickers();
  document.getElementById("f-year-from").value = S.yearFrom === null ? "" : S.yearFrom;
  document.getElementById("f-year-to").value = S.yearTo === null ? "" : S.yearTo;
  document.getElementById("f-margin-min").value = S.marginMin === null ? "" : S.marginMin;
  document.getElementById("f-margin-max").value = S.marginMax === null ? "" : S.marginMax;
  document.getElementById("f-oppr-min").value = S.oppRankMin === null ? "" : S.oppRankMin;
  document.getElementById("f-oppr-max").value = S.oppRankMax === null ? "" : S.oppRankMax;
  [["f-side", S.side], ["f-wc", S.wc], ["f-mclass", S.mclass],
   ["f-full", S.full],
   ["f-elig", S.elig], ["f-result", S.result]].forEach(function (p) {
    var box = document.getElementById(p[0]);
    [].forEach.call(box.children, function (c) {
      c.classList.toggle("on", c.dataset.v === p[1]);
    });
  });
  [].forEach.call(document.getElementById("f-dow").children, function (c) {
    c.classList.toggle("on", S.dows.indexOf(+c.dataset.v) !== -1);
  });
  [].forEach.call(document.getElementById("f-era").children, function (c) {
    c.classList.toggle("on", +c.dataset.from === S.yearFrom &&
                             +c.dataset.to === S.yearTo);
  });
}

/* Paint the display switches from the remembered preferences, so a reload
   shows the state it is actually in rather than the markup's defaults. */
function syncDisplayControls() {
  [].forEach.call(document.querySelectorAll("#f-density button"), function (b) {
    b.classList.toggle("on", b.dataset.v === DENSITY);
    b.setAttribute("aria-pressed", String(b.dataset.v === DENSITY));
  });
  [].forEach.call(document.querySelectorAll("#f-view button"), function (b) {
    var on = b.dataset.v === (teamView() ? "team" : "fixture");
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  [].forEach.call(document.querySelectorAll("#colpanel input[data-col]"),
    function (cb) { cb.checked = !!OPT[cb.getAttribute("data-col")]; });
}

/* Clipboard, with a fallback: navigator.clipboard is unavailable on a
   file:// page in several browsers, which is exactly how he opens this. */
function copyText(text, btn) {
  var was = btn.textContent;
  function done(ok) {
    btn.textContent = ok ? "Link copied" : "Press Ctrl+C to copy";
    setTimeout(function () { btn.textContent = was; }, 2200);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { done(true); },
                                             function () { fallback(); });
  } else { fallback(); }
  function fallback() {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.top = "-1000px";
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    done(ok);
  }
}

function matchFromHash(raw) {
  var h = (raw === undefined ? location.hash : raw).replace(/^#/, ""), out = null;
  h.split("&").forEach(function (p) {
    if (p.slice(0, 6) === "match=") {
      try {
        var value = decodeURIComponent(p.slice(6));
        out = /^\d+$/.test(value) ? Number(value) : value || null;
      } catch (_) { out = null; }
    }
  });
  return out;
}

// ---------------------------------------------- shareable / bookmarkable
var HASH_KEYS = ["dateFrom","dateTo","rankSource", "neutralFilter", "breakdownFilter", "team", "opp", "side", "yearFrom", "yearTo", "country",
                 "city", "venue", "comp", "wc", "elig", "mclass", "full", "result",
                 "marginMin", "marginMax", "oppRankMin", "oppRankMax",
                 "sort", "dir"];
var writingHash = false;

function writeHash() {
  var parts = [];
  HASH_KEYS.forEach(function (k) {
    var v = S[k];
    if (v === "" || v === null || v === "any") return;
    if (k === "sort" && v === "date") return;
    if (k === "dir" && v === -1) return;
    parts.push(k + "=" + encodeURIComponent(v));
  });
  if (S.dows.length) parts.push("dows=" + S.dows.join(","));
  /* A match= deep link survives a filter change: the reader followed a link to
     one match, and changing a filter should not silently drop it from the URL
     they might copy next. */
  var m = matchFromHash();
  if (m !== null) parts.push("match=" + encodeURIComponent(m));
  writingHash = true;
  var h = parts.length ? "#" + parts.join("&") : "";
  if (location.hash !== h) {
    history.replaceState(null, "", location.pathname + location.search + h);
  }
  writingHash = false;
}

/* Takes the hash string as an ARGUMENT, because by the time this runs on a
   hashchange the hash may no longer say what the reader typed - see the
   listener below. */
function readHash(raw) {
  var h = (raw === undefined ? location.hash : raw).replace(/^#/, "");
  if (!h) return;
  h.split("&").forEach(function (p) {
    var kv = p.split("="), k = kv[0], v = decodeURIComponent(kv[1] || "");
    if (k === "dows") { S.dows = v ? v.split(",").map(Number) : []; return; }
    if (HASH_KEYS.indexOf(k) === -1) return;
    if (["yearFrom", "yearTo", "marginMin", "marginMax", "oppRankMin",
         "oppRankMax", "dir"].indexOf(k) !== -1) S[k] = v === "" ? null : +v;
    else S[k] = v;
  });
}

window.addEventListener("hashchange", function () {
  if (writingHash) return;
  /* READ THE HASH BEFORE resetAll TOUCHES IT. resetAll() calls refresh(),
     refresh() calls writeHash(), and writeHash() overwrites location.hash from
     the freshly-defaulted state - so by the time readHash() ran, the thing it
     was meant to read had already been replaced by an empty one. Pasting a
     shared link into a tab that was already open therefore cleared every
     filter and looked like the link was broken. It had been that way since the
     hash was introduced; nothing caught it because a link opened in a NEW tab
     is a load, not a hashchange, and that is how it was always tested. */
  var raw = location.hash;
  resetAll();
  readHash(raw);
  syncControls();
  refresh();
  openLinkedMatch(raw);
});

// -------------------------------------------------------------- CSV out
function exportCSV() {
  /* The export always contains every column for every filtered match, one row
     per match, whatever is open on screen. Expanding a row is a view state,
     never a data state - so the drawer's contents are columns here, not extra
     rows. */
  var bdHead = [];
  ["Home", "Away"].forEach(function (side) {
    BD_HEAD.slice(0, HALF).forEach(function (h) { bdHead.push(side + " " + h); });
  });
  var head = ["Date", "Day", "Home", "Home Score", "Away Score", "Away",
              "Result (" + (S.team || "home") + ")", "Margin", "Competition",
              "Trophy", "Match Type", "Stadium", "City", "Country", "Attendance",
              "Neutral", "World Cup", "Counts for rankings", "Full international",
              "Sides",
              "Home rank before",
              "Home rating before", "Away rank before", "Away rating before"]
             .concat(bdHead, ["Excel row"]);
  var out = [head.join(",")];
  function q(v) {
    if (v === null || v === undefined) return "";
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  for (var k = 0; k < view.length; k++) {
    var i = view[k], r = ROWS[i];
    /* 167 dates are typed as text in the workbook and could mean two different
       days, so the table prints no weekday for them. The export must not
       assert what the table refuses to. */
    var b = BREAK[i] || [];
    var bd = [];
    for (var c2 = 0; c2 < HALF * 2; c2++) {
      bd.push(b.length > c2 ? b[c2] : "");
    }
    out.push([r[F.date], r[F.date_guessed] ? "" : DAYS[DOW[i]],
      homeName(r), r[F.home_score],
      r[F.away_score], awayName(r), outcome(r), r[F.margin],
      r[F.competition] === null ? "" : LK.competition[r[F.competition]],
      r[F.trophy] === null ? "" : LK.trophy[r[F.trophy]],
      r[F.match_type] === null ? "" : LK.match_type[r[F.match_type]],
      r[F.stadium] === null ? "" : LK.stadium[r[F.stadium]],
      r[F.city] === null ? "" : LK.city[r[F.city]],
      r[F.country] === null ? "" : LK.country[r[F.country]],
      r[F.attendance] === null ? "" : r[F.attendance],
      r[F.neutral] ? "TRUE" : "FALSE", r[F.world_cup] ? "TRUE" : "FALSE",
      r[F.eligible] ? "TRUE" : "FALSE",
      r[F.full_intl] === null ? "" : (r[F.full_intl] ? "TRUE" : "FALSE"),
      MCLASS_LONG[r[F.match_class]],
      r[F.home_rank_before] === null ? "" : r[F.home_rank_before],
      r[F.home_rating_before] === null ? "" : r[F.home_rating_before],
      r[F.away_rank_before] === null ? "" : r[F.away_rank_before],
      r[F.away_rating_before] === null ? "" : r[F.away_rating_before]]
      .concat(bd, [r[F.excel_row]]).map(q).join(","));
  }
  var blob = new Blob(["﻿" + out.join("\r\n")],
                      { type: "text/csv;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "rugby-archive-filtered.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

// expose a tiny hook so the build can be tested from outside the page
window.__ARCHIVE = {
  setFilters: function (patch) {
    Object.keys(patch).forEach(function (k) { S[k] = patch[k]; });
    syncControls(); refresh();
    return { count: view.length };
  },
  reset: resetAll,
  stats: function () { return analyse(view); },
  state: function () { return S; },
  rowsOut: function (n) {
    return view.slice(0, n || 5).map(function (i) {
      var r = ROWS[i];
      return r[F.date] + " " + homeName(r) + " " + r[F.home_score] + "-" +
             r[F.away_score] + " " + awayName(r);
    });
  }
};

init();

})();
