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
  yearFrom: null, yearTo: null, dows: [],
  country: "", city: "", venue: "",
  comp: "", wc: "any", elig: "any", mclass: "any", full: "any",
  result: "any", marginMin: null, marginMax: null,
  oppRankMin: null, oppRankMax: null,
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

  if (S.oppRankMin !== null || S.oppRankMax !== null) {
    var ranks;
    if (t >= 0) ranks = [h === t ? r[F.away_rank_before] : r[F.home_rank_before]];
    else ranks = [r[F.home_rank_before], r[F.away_rank_before]];
    var ok = false;
    for (var k = 0; k < ranks.length; k++) {
      var rk = ranks[k];
      if (rk === null) continue;
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
                  venue: F.stadium };

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
    var nameOf = fi === F.home ? homeName : (fi === F.away ? awayName : null);
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
function fmtDate(s) {
  return +s.slice(8, 10) + " " + MONTHS[+s.slice(5, 7) - 1] + " " + s.slice(0, 4);
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
var COLS = [
  { key: "date",   label: "Date",    cls: "c-date" },
  { key: "home",   label: "Home",    cls: "c-home" },
  { key: "margin", label: "Score",   cls: "c-sc", tip: "Sort by winning margin" },
  { key: "away",   label: "Away",    cls: "c-away" },
  { key: "",       label: "Tags",    cls: "c-tag", nosort: true },
  { key: "",       label: "",        cls: "c-exp", nosort: true },
  /* line two carries its own labels, so the reader knows what the small
     grey text under each fixture actually is */
  { key: "",       label: "Day",         cls: "c-when",  nosort: true },
  { key: "",       label: "Venue",       cls: "c-venue", nosort: true },
  { key: "",       label: "Competition", cls: "c-comp",  nosort: true },
  { key: "",       label: "Crowd",       cls: "c-crowd", nosort: true }
];

var head = document.getElementById("tablehead");
var wrap = document.getElementById("tablewrap");
var spacer = document.getElementById("tablespacer");
var bodyEl = document.getElementById("tablebody");
var emptyEl = document.getElementById("empty");
/* Row geometry lives in the STYLESHEET, not here. The virtual table computes
   scroll offsets arithmetically, so if CSS and JS ever disagree about how
   tall a row is, rows silently overlap or leave gaps - and nothing throws.
   Reading the custom properties keeps one source of truth, which is what
   lets the phone breakpoint use a taller three-line row safely. */
var ROW_H = 37;
var DRAWER_H = 132;
function readMetrics() {
  var cs = getComputedStyle(document.documentElement);
  var r = parseFloat(cs.getPropertyValue("--row-h"));
  var d = parseFloat(cs.getPropertyValue("--drawer-h"));
  var changed = false;
  if (r > 0 && r !== ROW_H) { ROW_H = r; changed = true; }
  if (d > 0 && d !== DRAWER_H) { DRAWER_H = d; changed = true; }
  return changed;
}
readMetrics();
var view = [];
var open = {};                 // data-row index -> true. Survives re-filtering.

function flag(name) {
  return window.RUGBY_FLAGS ? window.RUGBY_FLAGS.svg(name) : "";
}

function drawHead() {
  head.className = "tablehead fx";
  head.innerHTML = COLS.map(function (c) {
    var on = !c.nosort && c.key && S.sort === c.key;
    return '<div class="' + c.cls + (on ? " sorted" : "") + '"' +
      (c.key ? ' data-key="' + c.key + '"' : "") +
      (c.tip ? ' title="' + esc(c.tip) + '"' : "") + ">" + esc(c.label) +
      (on ? ' <span class="arrow">' + (S.dir < 0 ? "▼" : "▲") +
      "</span>" : "") + "</div>";
  }).join("");
}

/* Everything line 2 knows about a match, as one object, so the row builder
   and the drawer cannot disagree about what exists. */
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
function hasDetail(r, i) {
  var c = context(r);
  return !!(c.venue || c.comp || c.trophy || c.crowd || BREAK[i]);
}

function rowHTML(i, k) {
  var r = ROWS[i];
  var hs = r[F.home_score], as = r[F.away_score];
  var hw = hs > as, aw = as > hs;
  var c = context(r);
  var hr = r[F.home_rank_before], ar = r[F.away_rank_before];
  var tags = (r[F.world_cup] ? '<span class="tag rwc">RWC</span>' : "") +
             (r[F.neutral] ? '<span class="tag">N</span>' : "");
  /* 167 dates in the archive are typed as text and could genuinely mean two
     different days. Printing "Saturday" on those states something the data
     cannot support, so they show the date alone. */
  var when = r[F.date_guessed] ? "" : DAYS[DOW[i]];
  var isOpen = !!open[i];
  return '<div class="trow fx' + (isOpen ? " open" : "") + '" data-i="' + i + '">' +
    '<div class="c-date">' + r[F.date] + "</div>" +
    '<div class="c-when">' + esc(when) + "</div>" +
    /* Each side is ONE cell, not three, so the flag and the ranking sit hard
       against the name however short the name is. Three separate grid columns
       left "(207)" and the flag stranded at the far left of a 1fr column. */
    '<div class="c-home ' + (hw ? "win" : (aw ? "loserside" : "")) + '">' +
      '<span class="fg">' + flag(homeName(r)) + "</span>" +
      '<span class="rk">' + (hr === null ? "" : "(" + hr + ")") + "</span>" +
      '<span class="nm" title="' + esc(homeName(r)) + '">' +
        esc(homeName(r)) + "</span></div>" +
    '<div class="c-sc">' + hs + " – " + as + "</div>" +
    '<div class="c-away ' + (aw ? "win" : (hw ? "loserside" : "")) + '">' +
      '<span class="nm" title="' + esc(awayName(r)) + '">' +
        esc(awayName(r)) + "</span>" +
      '<span class="rk">' + (ar === null ? "" : "(" + ar + ")") + "</span>" +
      '<span class="fg">' + flag(awayName(r)) + "</span></div>" +
    '<div class="c-tag">' + tags + "</div>" +
    '<div class="c-exp">' + (hasDetail(r, i)
      ? '<button type="button" class="expbtn" data-exp="' + i +
        '" aria-expanded="' + isOpen + '" title="Show the detail">' +
        (isOpen ? "−" : "+") + "</button>"
      : "") + "</div>" +
    '<div class="c-venue" title="' + esc(c.venue || "") + '">' +
      esc(c.venue || "") + "</div>" +
    '<div class="c-comp" title="' + esc(c.comp || "") + '">' +
      esc(c.comp || "") + "</div>" +
    '<div class="c-crowd">' + (c.crowd ? fmtNum(c.crowd) : "") + "</div>" +
    "</div>" + (isOpen ? drawerHTML(i) : "");
}

/* ------------------------------------------------------------- the drawer */
var SC = D.scoring || null;
var BREAK = D.breakdowns || {};
var BO = (SC && SC.breakdown_order) || [];
var HALF = BO.length ? BO.length / 2 : 6;
var BD_HEAD = ["Tries", "Conv", "Pen", "Drop", "Mark", "Pen try"];

function valuesFor(year) {
  var v = SC.rows[0].slice(1), i;
  for (i = 0; i < SC.rows.length; i++) if (year >= SC.rows[i][0]) v = SC.rows[i].slice(1);
  return v;
}
function pointsFrom(counts, v) {
  var t = 0, n = Math.min(counts.length, v.length), i;
  for (i = 0; i < n; i++) t += counts[i] * v[i];
  return t;
}

function scoringBlock(r, i) {
  var b = BREAK[i];
  if (!b || !SC) {
    return '<div><h4>Scoring</h4><p class="none">No try-and-kick breakdown ' +
      "recorded for this match.</p></div>";
  }
  var y = +r[F.date].slice(0, 4);
  var era = valuesFor(y), latest = SC.rows[SC.rows.length - 1];
  var sides = [
    { name: homeName(r), counts: b.slice(0, HALF), got: r[F.home_score] },
    { name: awayName(r), counts: b.slice(HALF), got: r[F.away_score] }
  ];
  var head = "<tr><th>Scoring</th>" + BD_HEAD.slice(0, HALF).map(function (h) {
    return "<th>" + h + "</th>";
  }).join("") + "<th>Total</th><th>Adds up?</th></tr>";
  var body = sides.map(function (s) {
    var calc = pointsFrom(s.counts, era);
    var ok = calc === s.got;
    return "<tr><td>" + esc(s.name) + "</td>" +
      s.counts.map(function (n) { return "<td>" + (n || "·") + "</td>"; }).join("") +
      '<td class="tot">' + s.got + "</td>" +
      '<td class="' + (ok ? "ok" : "bad") + '">' +
      (ok ? "✓" : "≠ " + calc) + "</td></tr>";
  }).join("");
  var rest = '<tr class="restate"><td>under ' + latest[0] + " rules</td>" +
    '<td colspan="' + HALF + '"></td><td class="tot">' +
    pointsFrom(sides[0].counts, latest.slice(1)) + " – " +
    pointsFrom(sides[1].counts, latest.slice(1)) + "</td><td></td></tr>";
  return "<div><table>" + head + body + rest + "</table></div>";
}

function drawerHTML(i) {
  var r = ROWS[i], c = context(r);
  var hr = r[F.home_rank_before], ar = r[F.away_rank_before];
  var hR = r[F.home_rating_before], aR = r[F.away_rating_before];
  function dd(label, val) {
    return val ? "<dt>" + label + "</dt><dd>" + esc(String(val)) + "</dd>" : "";
  }
  var rank = (hr === null || ar === null) ? "" :
    homeName(r) + " #" + hr + (hR === null ? "" : " (" + hR.toFixed(2) + ")") +
    "  ·  " + awayName(r) + " #" + ar +
    (aR === null ? "" : " (" + aR.toFixed(2) + ")");
  return '<div class="drawer">' + scoringBlock(r, i) +
    "<div><h4>Match</h4><dl>" +
      dd("Competition", c.comp) + dd("Trophy", c.trophy) +
      dd("Venue", c.venue) + dd("Country", c.country) +
      dd("Crowd", c.crowd ? fmtNum(c.crowd) : null) +
      dd("Type", c.type) +
      dd("Test match", r[F.full_intl] === null ? "not established"
                     : (r[F.full_intl] ? "yes - a full international"
                                       : "no")) +
      dd("Sides", MCLASS_LONG[r[F.match_class]]) +
      dd("Ranked", r[F.eligible] ? "counts towards the rankings"
                                 : "moved nobody's rating") +
      dd("Before", rank) +
      dd("Source", "spreadsheet row " + r[F.excel_row]) +
    "</dl></div></div>";
}

/* ------------------------------------------- virtual list, variable height
   Only rows the reader has opened are taller, and always by exactly
   DRAWER_H, so the offset of row k is k*ROW_H plus DRAWER_H for each open
   row above it. `openAt` is the sorted list of open positions in the current
   view; it is tiny, so a linear scan beats anything cleverer.            */
var openAt = [];
function reindexOpen() {
  openAt = [];
  for (var k = 0; k < view.length; k++) if (open[view[k]]) openAt.push(k);
}
function openBefore(k) {
  var n = 0;
  for (var j = 0; j < openAt.length && openAt[j] < k; j++) n++;
  return n;
}
function yOf(k) { return k * ROW_H + openBefore(k) * DRAWER_H; }
function totalH() { return view.length * ROW_H + openAt.length * DRAWER_H; }
function firstAt(y) {
  var lo = 0, hi = view.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (yOf(mid) < y) lo = mid + 1; else hi = mid;
  }
  return Math.max(0, lo - 1);
}

function paint() {
  var top = wrap.scrollTop;
  var first = Math.max(0, firstAt(top) - 4);
  var yTop = yOf(first);
  var html = "", k = first, y = yTop;
  var limit = yTop + wrap.clientHeight + ROW_H * 10;
  while (k < view.length && y < limit) {
    html += rowHTML(view[k], k);
    y += ROW_H + (open[view[k]] ? DRAWER_H : 0);
    k++;
  }
  bodyEl.style.transform = "translateY(" + yTop + "px)";
  bodyEl.innerHTML = html;
}

function renderTable() {
  reindexOpen();
  spacer.style.height = totalH() + "px";
  emptyEl.hidden = view.length > 0;
  if (wrap.scrollTop > totalH()) wrap.scrollTop = 0;
  paint();
}

function toggleRow(i) {
  if (open[i]) delete open[i]; else open[i] = true;
  renderTable();
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
function hasPerspective() { return S.teamI >= 0 || S.oppI >= 0; }

function renderAnalysis(a) {
  var team = S.team;
  var persp = team || "the home team";
  document.getElementById("an-title").textContent =
    team ? team : (S.opp ? S.opp + " — all matches" : "Every match");
  var bits = [];
  if (team && S.opp) bits.push("against " + S.opp);
  else if (S.opp && !team) bits.push("matches involving " + S.opp);
  if (S.side === "home") bits.push("at home");
  if (S.side === "away") bits.push("away");
  if (S.side === "neutral") bits.push("at neutral venues");
  if (S.yearFrom || S.yearTo) {
    bits.push((S.yearFrom || 1871) + "–" + (S.yearTo || 2026));
  }
  if (S.dows.length) {
    bits.push(S.dows.map(function (d) { return DAYS[d] + "s"; }).join(", "));
  }
  if (S.comp) bits.push(S.comp);
  if (S.country) bits.push("in " + S.country);
  if (S.city) bits.push("in " + S.city);
  if (S.venue) bits.push("at " + S.venue);
  if (S.mclass !== "any") bits.push(MCLASS[+S.mclass]);
  if (S.full === "1") bits.push("full internationals only");
  if (S.full === "0") bits.push("excluding full internationals");
  if (S.wc === "1") bits.push("World Cup only");
  if (S.wc === "0") bits.push("excluding the World Cup");
  if (S.result !== "any") bits.push({ W: "wins", D: "draws", L: "defeats" }[S.result] + " only");
  if (S.marginMin !== null || S.marginMax !== null) {
    bits.push("margin " + (S.marginMin === null ? "0" : S.marginMin) + "–" +
              (S.marginMax === null ? "any" : S.marginMax));
  }
  if (S.oppRankMin !== null || S.oppRankMax !== null) {
    bits.push((team ? "opponent" : "a side") + " ranked " +
              (S.oppRankMin === null ? "1" : S.oppRankMin) + "–" +
              (S.oppRankMax === null ? "any" : S.oppRankMax) + " at the time");
  }
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
  document.getElementById("pctall").textContent =
    a.played === N ? "" : "of " + fmtNum(N) + " (" +
      (100 * a.played / N).toFixed(1) + "%)";
}

function refresh() {
  var t0 = performance.now();
  applyFilters();
  view = sortView();
  var a = analyse(view);
  renderAnalysis(a);
  drawHead();
  renderTable();
  var ms = performance.now() - t0;
  document.getElementById("perf").textContent = ms.toFixed(1) + " ms";
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
  document.getElementById("buildinfo").innerHTML =
    fmtNum(D.meta.matches) + " matches · " + fmtNum(D.meta.teams) + " teams · " +
    D.meta.first_match + " to " + D.meta.last_match +
    '<br>built ' + D.meta.built.replace("T", " ") +
    '<span class="fromwb"> from ' + esc(D.meta.source_workbook) + "</span>";

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
    var btn = e.target.closest ? e.target.closest("[data-exp]") : null;
    if (!btn) return;
    toggleRow(+btn.getAttribute("data-exp"));
  });

  head.addEventListener("click", function (e) {
    var d = e.target.closest("[data-key]"); if (!d) return;
    var key = d.dataset.key; if (!key) return;
    if (S.sort === key) S.dir = -S.dir;
    else { S.sort = key; S.dir = (key === "home" || key === "away" ||
                                  key === "comp" || key === "venue") ? 1 : -1; }
    view = sortView(); drawHead(); renderTable();
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

  readHash();
  syncControls();
  refresh();

  document.getElementById("loading").hidden = true;
  document.getElementById("app").hidden = false;
  paint();
}

function resetAll() {
  S.team = S.opp = S.country = S.city = S.venue = S.comp = "";
  S.side = S.wc = S.elig = S.result = S.mclass = S.full = "any";
  S.yearFrom = S.yearTo = S.marginMin = S.marginMax = null;
  S.oppRankMin = S.oppRankMax = null;
  S.dows = [];
  S.sort = "date"; S.dir = -1;
  syncControls();
  refresh();
}

function syncControls() {
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

// ---------------------------------------------- shareable / bookmarkable
var HASH_KEYS = ["team", "opp", "side", "yearFrom", "yearTo", "country",
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
  writingHash = true;
  var h = parts.length ? "#" + parts.join("&") : "";
  if (location.hash !== h) {
    history.replaceState(null, "", location.pathname + location.search + h);
  }
  writingHash = false;
}

function readHash() {
  var h = location.hash.replace(/^#/, "");
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
  resetAll();
  readHash();
  syncControls();
  refresh();
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
