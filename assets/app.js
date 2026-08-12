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
  country: "", stadium: "", neutral: "any",
  comp: "", wc: "any", elig: "any",
  result: "any", marginMin: null, marginMax: null,
  oppRankMin: null, oppRankMax: null,
  sort: "date", dir: -1
};

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
    if (S.side === "home") { if (h !== t) return false; }
    else if (S.side === "away") { if (a !== t) return false; }
    else if (h !== t && a !== t) return false;
  }
  if (o >= 0 && h !== o && a !== o) return false;
  if (t >= 0 && o >= 0 && h !== o && a !== o) return false;

  var y = YEAR[i];
  if (S.yearFrom !== null && y < S.yearFrom) return false;
  if (S.yearTo !== null && y > S.yearTo) return false;
  if (S.dows.length && S.dows.indexOf(DOW[i]) === -1) return false;

  if (S.countryI >= 0 && r[F.country] !== S.countryI) return false;
  if (S.venueQ && VENUE[i].indexOf(S.venueQ) === -1) return false;
  if (S.compI >= 0 && r[F.competition] !== S.compI) return false;

  if (S.neutral !== "any" && r[F.neutral] !== +S.neutral) return false;
  if (S.wc !== "any" && r[F.world_cup] !== +S.wc) return false;
  if (S.elig !== "any" && r[F.eligible] !== +S.elig) return false;

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
  S.venueQ = S.stadium ? S.stadium.toLowerCase() : "";
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
var COLS = [
  { key: "date",   label: "Date",        cls: "date" },
  { key: "dow",    label: "Day",         cls: "" },
  { key: "home",   label: "Home",        cls: "" },
  { key: "",       label: "Score",       cls: "score", nosort: true },
  { key: "away",   label: "Away",        cls: "" },
  { key: "result", label: "Res",         cls: "" },
  { key: "margin", label: "Marg",        cls: "num" },
  { key: "comp",   label: "Competition", cls: "" },
  { key: "venue",  label: "Venue",       cls: "" },
  { key: "row",    label: "Rank H/A",    cls: "rk", nosort: true }
];

var head = document.getElementById("tablehead");
var wrap = document.getElementById("tablewrap");
var spacer = document.getElementById("tablespacer");
var bodyEl = document.getElementById("tablebody");
var emptyEl = document.getElementById("empty");
var ROW_H = 34;
var view = [];

function drawHead() {
  head.innerHTML = COLS.map(function (c) {
    var on = !c.nosort && c.key && S.sort === c.key;
    return '<div data-key="' + c.key + '" class="' + (on ? "sorted" : "") + '">' +
      esc(c.label) + (on ? ' <span class="arrow">' + (S.dir < 0 ? "▼" : "▲") +
      "</span>" : "") + "</div>";
  }).join("");
}

function rowHTML(i) {
  var r = ROWS[i];
  var t = S.teamI;
  var res = outcome(r);
  var hw = r[F.home_score] > r[F.away_score];
  var aw = r[F.away_score] > r[F.home_score];
  var venue = r[F.stadium] !== null ? LK.stadium[r[F.stadium]]
            : (r[F.city] !== null ? LK.city[r[F.city]]
            : (r[F.country] !== null ? LK.country[r[F.country]] : "—"));
  var comp = r[F.competition] !== null ? LK.competition[r[F.competition]] : "—";
  var tags = (r[F.world_cup] ? '<span class="tag rwc">RWC</span>' : "") +
             (r[F.neutral] ? '<span class="tag">N</span>' : "");
  var hr = r[F.home_rank_before], ar = r[F.away_rank_before];
  return '<div class="trow">' +
    '<div class="date">' + fmtDate(r[F.date]) + "</div>" +
    "<div>" + DAYS3[DOW[i]] + "</div>" +
    '<div class="' + (hw ? "winner" : "") + '">' + esc(homeName(r)) + "</div>" +
    '<div class="score">' + r[F.home_score] + "–" + r[F.away_score] + "</div>" +
    '<div class="' + (aw ? "winner" : "") + '">' + esc(awayName(r)) + "</div>" +
    '<div><span class="res ' + res + '">' + res + "</span></div>" +
    '<div class="num">' + r[F.margin] + "</div>" +
    '<div title="' + esc(comp) + '">' + esc(comp) + tags + "</div>" +
    '<div title="' + esc(venue) + '">' + esc(venue) + "</div>" +
    '<div class="rk">' + (hr === null ? "–" : hr) + " / " +
      (ar === null ? "–" : ar) + "</div>" +
    "</div>";
}

function paint() {
  var top = wrap.scrollTop;
  var first = Math.max(0, Math.floor(top / ROW_H) - 6);
  var count = Math.ceil(wrap.clientHeight / ROW_H) + 12;
  var last = Math.min(view.length, first + count);
  var html = "";
  for (var k = first; k < last; k++) html += rowHTML(view[k]);
  bodyEl.style.transform = "translateY(" + (first * ROW_H) + "px)";
  bodyEl.innerHTML = html;
}

function renderTable() {
  spacer.style.height = (view.length * ROW_H) + "px";
  emptyEl.hidden = view.length > 0;
  if (wrap.scrollTop > view.length * ROW_H) wrap.scrollTop = 0;
  paint();
}

function setText(id, v) { document.getElementById(id).textContent = v; }

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
  if (S.yearFrom || S.yearTo) {
    bits.push((S.yearFrom || 1871) + "–" + (S.yearTo || 2026));
  }
  if (S.dows.length) {
    bits.push(S.dows.map(function (d) { return DAYS[d] + "s"; }).join(", "));
  }
  if (S.comp) bits.push(S.comp);
  if (S.country) bits.push("in " + S.country);
  if (S.stadium) bits.push('venue containing "' + S.stadium + '"');
  if (S.neutral === "1") bits.push("neutral venues");
  if (S.neutral === "0") bits.push("home venues");
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

function countPresent(field) {
  var n = 0;
  for (var i = 0; i < N; i++) if (ROWS[i][field] !== null) n++;
  return n;
}

function init() {
  document.getElementById("buildinfo").innerHTML =
    fmtNum(D.meta.matches) + " matches · " + fmtNum(D.meta.teams) + " teams · " +
    D.meta.first_match + " to " + D.meta.last_match +
    "<br>built " + D.meta.built.replace("T", " ") + " from " +
    esc(D.meta.source_workbook);

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

  fill("f-country", LK.country.slice().sort(), "Anywhere");
  fill("f-comp", LK.competition.slice().sort(), "Any competition");
  document.getElementById("stadiums").innerHTML =
    LK.stadium.concat(LK.city).concat(LK.country).sort().map(function (s) {
      return '<option value="' + esc(s) + '">';
    }).join("");

  var cN = countPresent(F.country), pN = countPresent(F.competition);
  var sN = 0;
  for (var v = 0; v < N; v++) if (VENUE[v]) sN++;
  document.getElementById("sparse-country").textContent =
    "— recorded on " + fmtNum(cN) + " of " + fmtNum(N);
  document.getElementById("sparse-stadium").textContent =
    "— recorded on " + fmtNum(sN) + " of " + fmtNum(N);
  document.getElementById("sparse-comp").textContent =
    "— recorded on " + fmtNum(pN) + " of " + fmtNum(N);

  // --- events
  function onSel(id, key) {
    document.getElementById(id).addEventListener("change", function () {
      S[key] = this.value; refresh();
    });
  }
  onSel("f-team", "team"); onSel("f-opp", "opp");
  onSel("f-country", "country"); onSel("f-comp", "comp");
  document.getElementById("f-stadium").addEventListener("input", function () {
    S.stadium = this.value.trim(); refresh();
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
  segGroup("f-side", "side"); segGroup("f-neutral", "neutral");
  segGroup("f-wc", "wc"); segGroup("f-elig", "elig");
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

  head.addEventListener("click", function (e) {
    var d = e.target.closest("[data-key]"); if (!d) return;
    var key = d.dataset.key; if (!key) return;
    if (S.sort === key) S.dir = -S.dir;
    else { S.sort = key; S.dir = (key === "home" || key === "away" ||
                                  key === "comp" || key === "venue") ? 1 : -1; }
    view = sortView(); drawHead(); renderTable();
  });

  wrap.addEventListener("scroll", paint, { passive: true });
  window.addEventListener("resize", paint);

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
  S.team = S.opp = S.country = S.stadium = S.comp = "";
  S.side = S.neutral = S.wc = S.elig = S.result = "any";
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
  document.getElementById("f-stadium").value = S.stadium;
  document.getElementById("f-year-from").value = S.yearFrom === null ? "" : S.yearFrom;
  document.getElementById("f-year-to").value = S.yearTo === null ? "" : S.yearTo;
  document.getElementById("f-margin-min").value = S.marginMin === null ? "" : S.marginMin;
  document.getElementById("f-margin-max").value = S.marginMax === null ? "" : S.marginMax;
  document.getElementById("f-oppr-min").value = S.oppRankMin === null ? "" : S.oppRankMin;
  document.getElementById("f-oppr-max").value = S.oppRankMax === null ? "" : S.oppRankMax;
  [["f-side", S.side], ["f-neutral", S.neutral], ["f-wc", S.wc],
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
                 "stadium", "neutral", "comp", "wc", "elig", "result",
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
  var head = ["Date", "Day", "Home", "Home Score", "Away Score", "Away",
              "Result (" + (S.team || "home") + ")", "Margin", "Competition",
              "Match Type", "Stadium", "City", "Country", "Neutral",
              "World Cup", "Counts for rankings", "Home rank before",
              "Away rank before", "Excel row"];
  var out = [head.join(",")];
  function q(v) {
    if (v === null || v === undefined) return "";
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  for (var k = 0; k < view.length; k++) {
    var i = view[k], r = ROWS[i];
    out.push([r[F.date], DAYS[DOW[i]], homeName(r), r[F.home_score],
      r[F.away_score], awayName(r), outcome(r), r[F.margin],
      r[F.competition] === null ? "" : LK.competition[r[F.competition]],
      r[F.match_type] === null ? "" : LK.match_type[r[F.match_type]],
      r[F.stadium] === null ? "" : LK.stadium[r[F.stadium]],
      r[F.city] === null ? "" : LK.city[r[F.city]],
      r[F.country] === null ? "" : LK.country[r[F.country]],
      r[F.neutral] ? "TRUE" : "FALSE", r[F.world_cup] ? "TRUE" : "FALSE",
      r[F.eligible] ? "TRUE" : "FALSE",
      r[F.home_rank_before] === null ? "" : r[F.home_rank_before],
      r[F.away_rank_before] === null ? "" : r[F.away_rank_before],
      r[F.excel_row]].map(q).join(","));
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
