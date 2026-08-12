/* Rugby Archive — Head to Head.

   Two teams, every meeting, and who has been ahead across the whole rivalry.
   Also does score restatement: where the archive records a full try/kick
   breakdown, the match can be re-scored under any scoring system in the
   owner's own "Scoring Systems" sheet.

   The scoring values are NOT hard-coded here. They arrive in
   RUGBY_DATA.scoring.rows, read by the pipeline straight out of the workbook.  */

(function () {
"use strict";

var D = window.RUGBY_DATA;
if (!D || window.__dataFailed) {
  document.getElementById("loading").hidden = true;
  document.getElementById("dataerror").hidden = false;
  return;
}

var F = {};
D.fields.forEach(function (n, i) { F[n] = i; });
var ROWS = D.rows, LK = D.lookups, TEAMS = LK.teams, N = ROWS.length;
var SC = D.scoring || null;
var BREAK = D.breakdowns || {};

var MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep",
            "Oct", "Nov", "Dec"];
// Validated with the dataviz palette checker against a #ffffff surface:
// lightness band, chroma floor, CVD separation (ΔE 21.6 protan), normal-vision
// floor (ΔE 32.3) and 3:1 contrast all PASS. Do not eyeball replacements.
var C_A = "#2a78d6", C_B = "#e34948", C_ZERO = "#c2cad6";

var teamIdx = {};
TEAMS.forEach(function (t, i) { teamIdx[t] = i; });

var S = { a: "", b: "", basis: "played", era: null, find: "" };

// ------------------------------------------------------------------ helpers
function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
function fmtDate(s) {
  return +s.slice(8, 10) + " " + MON3[+s.slice(5, 7) - 1] + " " + s.slice(0, 4);
}
function num(n) { return n.toLocaleString("en-GB"); }
function pct(a, b) { return b ? (100 * a / b).toFixed(1) + "%" : "–"; }
function yearOf(r) { return +r[F.date].slice(0, 4); }

/* The scoring values in force in a given year, from the owner's table. */
function valuesFor(year) {
  var rows = SC.rows, v = rows[0].slice(1);
  for (var i = 0; i < rows.length; i++) if (year >= rows[i][0]) v = rows[i].slice(1);
  return v;
}
function pointsFrom(counts, v) {
  return counts[0] * v[0] + counts[1] * v[1] + counts[2] * v[2] +
         counts[3] * v[3] + counts[4] * v[4];
}

/* Scores for a match, honouring the current basis.
   Returns [home, away, restated?] — restated is false when the match has no
   recorded breakdown, in which case the as-played score is used unchanged and
   the caller must say so. */
function scores(i) {
  var r = ROWS[i];
  if (S.basis === "played" || !SC) return [r[F.home_score], r[F.away_score], false];
  var b = BREAK[i];
  if (!b) return [r[F.home_score], r[F.away_score], false];
  var v = valuesFor(S.era);
  return [pointsFrom(b.slice(0, 5), v), pointsFrom(b.slice(5), v), true];
}

function meetings(ai, bi) {
  var out = [];
  for (var i = 0; i < N; i++) {
    var r = ROWS[i], h = r[F.home], a = r[F.away];
    if ((h === ai && a === bi) || (h === bi && a === ai)) out.push(i);
  }
  out.sort(function (x, y) { return ROWS[x][F.date] < ROWS[y][F.date] ? -1 : 1; });
  return out;
}

/* Every stat we show, all from one perspective: team `ai`. */
function analyse(list, ai) {
  var st = { played: list.length, won: 0, drawn: 0, lost: 0, pf: 0, pa: 0,
             restated: 0, big: null, bigAgainst: null, highest: null,
             wStreak: 0, wSpan: null, lStreak: 0, lSpan: null,
             uStreak: 0, uSpan: null, gap: null, seq: [] };
  var w = 0, l = 0, u = 0, wS = null, lS = null, uS = null, prev = null;
  for (var k = 0; k < list.length; k++) {
    var i = list[k], r = ROWS[i], sc = scores(i);
    if (sc[2]) st.restated++;
    var mine = r[F.home] === ai ? sc[0] : sc[1];
    var theirs = r[F.home] === ai ? sc[1] : sc[0];
    st.pf += mine; st.pa += theirs;
    var d = mine - theirs;
    var res = d > 0 ? "W" : (d < 0 ? "L" : "D");
    st.seq.push({ i: i, res: res, diff: d, date: r[F.date],
                  mine: mine, theirs: theirs, restated: sc[2] });
    if (d > 0) { st.won++; if (!st.big || d > st.big.d) st.big = { d: d, i: i }; }
    else if (d < 0) {
      st.lost++;
      if (!st.bigAgainst || -d > st.bigAgainst.d) st.bigAgainst = { d: -d, i: i };
    } else st.drawn++;
    var tot = sc[0] + sc[1];
    if (!st.highest || tot > st.highest.d) st.highest = { d: tot, i: i };

    w = res === "W" ? w + 1 : 0; if (res === "W" && w === 1) wS = r[F.date];
    l = res === "L" ? l + 1 : 0; if (res === "L" && l === 1) lS = r[F.date];
    u = res !== "L" ? u + 1 : 0; if (res !== "L" && u === 1) uS = r[F.date];
    if (w > st.wStreak) { st.wStreak = w; st.wSpan = [wS, r[F.date]]; }
    if (l > st.lStreak) { st.lStreak = l; st.lSpan = [lS, r[F.date]]; }
    if (u > st.uStreak) { st.uStreak = u; st.uSpan = [uS, r[F.date]]; }

    if (prev) {
      var days = (Date.parse(r[F.date]) - Date.parse(prev)) / 86400000;
      if (!st.gap || days > st.gap.days) {
        st.gap = { days: days, from: prev, to: r[F.date] };
      }
    }
    prev = r[F.date];
  }
  return st;
}

// -------------------------------------------------------------- the chart
/* Diverging area on a zero baseline: above = team A ahead on wins, below =
   team B ahead. Diverging is the right form because the reader's job is
   polarity — which side of the line are we on — not magnitude comparison.  */
function drawChart(st, aName, bName) {
  var svg = document.getElementById("chart");
  var box = document.getElementById("chartbox");
  var W = Math.max(320, box.clientWidth), H = 210;
  var padL = 34, padR = 118, padT = 14, padB = 24;
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);

  if (st.seq.length < 1) { svg.innerHTML = ""; return; }

  var pts = [], run = 0;
  for (var k = 0; k < st.seq.length; k++) {
    var s = st.seq[k];
    run += s.res === "W" ? 1 : (s.res === "L" ? -1 : 0);
    pts.push({ t: Date.parse(s.date), v: run, s: s });
  }
  var t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  if (t1 === t0) { t1 = t0 + 86400000; }
  var maxAbs = Math.max(1, Math.max.apply(null, pts.map(function (p) {
    return Math.abs(p.v);
  })));
  var x = function (t) { return padL + (W - padL - padR) * (t - t0) / (t1 - t0); };
  var y = function (v) {
    return padT + (H - padT - padB) * (1 - (v + maxAbs) / (2 * maxAbs));
  };
  var y0 = y(0);

  // step path: the lead only changes when a match is played
  var d = "M" + x(pts[0].t) + " " + y0;
  pts.forEach(function (p) { d += " L" + x(p.t) + " " + y0; });
  d = "M" + x(t0) + " " + y0;
  var prevX = x(t0), prevY = y0;
  pts.forEach(function (p) {
    d += " L" + x(p.t) + " " + prevY + " L" + x(p.t) + " " + y(p.v);
    prevX = x(p.t); prevY = y(p.v);
  });
  d += " L" + x(t1) + " " + prevY;

  var above = d + " L" + x(t1) + " " + y0 + " L" + x(t0) + " " + y0 + " Z";

  // aim for 5-7 year labels, snapped to a round interval
  var ticks = [];
  var span = (t1 - t0) / 31557600000;
  var NICE = [1, 2, 5, 10, 20, 25, 50, 100];
  var stepY = NICE[NICE.length - 1];
  for (var ni = 0; ni < NICE.length; ni++) {
    if (span / NICE[ni] <= 6) { stepY = NICE[ni]; break; }
  }
  var startY = Math.ceil(new Date(t0).getUTCFullYear() / stepY) * stepY;
  for (var yy = startY; ; yy += stepY) {
    var tt = Date.UTC(yy, 0, 1);
    if (tt > t1) break;
    if (tt < t0) continue;
    ticks.push([x(tt), yy]);
  }

  var gridY = [];
  var stepV = maxAbs > 24 ? 10 : (maxAbs > 10 ? 5 : (maxAbs > 4 ? 2 : 1));
  for (var v = -Math.floor(maxAbs / stepV) * stepV; v <= maxAbs; v += stepV) {
    gridY.push(v);
  }

  var html = "";
  html += '<defs>' +
    '<clipPath id="clipAbove"><rect x="0" y="0" width="' + W + '" height="' +
      y0 + '"/></clipPath>' +
    '<clipPath id="clipBelow"><rect x="0" y="' + y0 + '" width="' + W +
      '" height="' + (H - y0) + '"/></clipPath></defs>';

  gridY.forEach(function (g) {
    html += '<line class="grid" x1="' + padL + '" x2="' + (W - padR) +
            '" y1="' + y(g) + '" y2="' + y(g) + '"/>' +
            '<text class="axis" x="' + (padL - 6) + '" y="' + (y(g) + 3.5) +
            '" text-anchor="end">' + (g > 0 ? "+" + g : g) + "</text>";
  });
  ticks.forEach(function (t) {
    html += '<text class="axis" x="' + t[0] + '" y="' + (H - 7) +
            '" text-anchor="middle">' + t[1] + "</text>";
  });

  html += '<path d="' + above + '" fill="' + C_A + '" fill-opacity="0.20" ' +
          'clip-path="url(#clipAbove)"/>';
  html += '<path d="' + above + '" fill="' + C_B + '" fill-opacity="0.20" ' +
          'clip-path="url(#clipBelow)"/>';
  html += '<line class="zero" x1="' + padL + '" x2="' + (W - padR) +
          '" y1="' + y0 + '" y2="' + y0 + '" stroke="' + C_ZERO + '"/>';
  html += '<path d="' + d + '" class="lead"/>';

  var lastV = pts[pts.length - 1].v;
  var lead = lastV > 0 ? aName : (lastV < 0 ? bName : "level");
  var endText = lead + (lastV === 0 ? "" : " +" + Math.abs(lastV));
  if (endText.length > 18) endText = endText.slice(0, 17) + "…";
  html += '<text class="endlabel" x="' + (W - padR + 8) + '" y="' +
          (y(lastV) + 4) + '">' + esc(endText) + "</text>";

  // hover targets, one per meeting, bigger than the mark
  pts.forEach(function (p, i) {
    html += '<rect class="hit" data-i="' + i + '" x="' + (x(p.t) - 6) +
            '" y="' + padT + '" width="12" height="' + (H - padT - padB) +
            '" fill="transparent"/>';
  });
  html += '<circle id="cursor" r="4.5" class="cursor" hidden/>';

  var desc = "Running difference in wins between " + aName + " and " + bName +
    " over " + st.played + " meetings. " +
    (lastV === 0 ? "The rivalry is level."
                 : lead + " leads by " + Math.abs(lastV) + ".") +
    " The full table of meetings is below.";
  svg.innerHTML = "<desc>" + esc(desc) + "</desc>" + html;
  svg.setAttribute("aria-label", desc);

  document.getElementById("chart-legend").innerHTML =
    '<span class="lg"><i style="background:' + C_A + '"></i>' + esc(aName) +
    " ahead</span>" +
    '<span class="lg"><i style="background:' + C_B + '"></i>' + esc(bName) +
    " ahead</span>";

  var tip = document.getElementById("tip");
  var cursor = document.getElementById("cursor");
  svg.onmousemove = function (e) {
    var t = e.target.closest ? e.target.closest(".hit") : null;
    if (!t) return;
    var p = pts[+t.dataset.i], r = ROWS[p.s.i];
    cursor.setAttribute("cx", x(p.t));
    cursor.setAttribute("cy", y(p.v));
    cursor.removeAttribute("hidden");
    tip.hidden = false;
    tip.innerHTML = "<b>" + fmtDate(r[F.date]) + "</b><br>" +
      esc(TEAMS[r[F.home]]) + " " + p.s.mine + "–" + p.s.theirs + " " +
      esc(TEAMS[r[F.away]]) +
      (r[F.home] === teamIdx[aName] ? "" : " (" + esc(aName) + " away)") +
      "<br><span class='muted'>" +
      (p.v === 0 ? "level" : (p.v > 0 ? esc(aName) : esc(bName)) + " +" +
       Math.abs(p.v)) + " after this match</span>";
    var bx = box.getBoundingClientRect();
    var left = Math.min(Math.max(x(p.t) - 90, 4), bx.width - 190);
    tip.style.left = left + "px";
    tip.style.top = Math.max(4, y(p.v) - 62) + "px";
  };
  svg.onmouseleave = function () {
    tip.hidden = true; cursor.setAttribute("hidden", "");
  };
}

// ------------------------------------------------------------------ render
function card(label, big, sub) {
  return '<div class="card"><div class="card-label">' + label +
    '</div><div class="big small">' + big + '</div><div class="sub">' +
    (sub || "") + "</div></div>";
}
function scoreline(i, st) {
  var r = ROWS[i], s = null;
  for (var k = 0; k < st.seq.length; k++) if (st.seq[k].i === i) s = st.seq[k];
  var sc = scores(i);
  return TEAMS[r[F.home]] + " " + sc[0] + "–" + sc[1] + " " + TEAMS[r[F.away]];
}

function renderRivalry() {
  var t0 = performance.now();
  var ai = teamIdx[S.a], bi = teamIdx[S.b];
  var list = meetings(ai, bi);
  var st = analyse(list, ai);

  document.getElementById("a-name").textContent = S.a;
  document.getElementById("b-name").textContent = S.b;
  document.getElementById("a-wins").textContent = st.won;
  document.getElementById("b-wins").textContent = st.lost;
  document.getElementById("m-total").textContent = num(st.played);
  document.getElementById("m-draws").textContent =
    st.drawn ? st.drawn + (st.drawn === 1 ? " draw" : " draws") : "no draws";
  document.getElementById("m-span").textContent = st.played
    ? fmtDate(ROWS[list[0]][F.date]) + " – " + fmtDate(ROWS[list[list.length - 1]][F.date])
    : "";
  var bar = document.getElementById("leadbar"), tot = st.played || 1;
  bar.children[0].style.width = (100 * st.won / tot) + "%";
  bar.children[1].style.width = (100 * st.drawn / tot) + "%";
  bar.children[2].style.width = (100 * st.lost / tot) + "%";
  document.getElementById("m-verdict").textContent = !st.played ? ""
    : (st.won > st.lost ? S.a + " lead " + st.won + "–" + st.lost
       : (st.lost > st.won ? S.b + " lead " + st.lost + "–" + st.won
          : "All square at " + st.won + "–" + st.lost));

  document.getElementById("meetempty").hidden = st.played > 0;
  document.getElementById("rivalry").hidden = false;
  document.getElementById("allopp").hidden = true;

  drawChart(st, S.a, S.b);
  document.getElementById("chart-note").textContent = st.played
    ? "Draws hold the line flat. The " + (st.played) + " meetings are listed in "
      + "full below — the chart is a picture of that table, not a separate "
      + "source."
    : "";

  var cards = [];
  cards.push(card("Win rate — " + esc(S.a), pct(st.won, st.played),
    st.played ? st.won + " of " + st.played + " · draws as half: " +
      pct(st.won + st.drawn / 2, st.played) : ""));
  cards.push(card("Points for / against",
    st.played ? num(st.pf) + " – " + num(st.pa) : "–",
    st.played ? (st.pf - st.pa >= 0 ? "+" : "") + num(st.pf - st.pa) +
      " · " + (st.pf / st.played).toFixed(1) + "–" +
      (st.pa / st.played).toFixed(1) + " a match" : ""));
  cards.push(card("Biggest win — " + esc(S.a),
    st.big ? scoreline(st.big.i, st) : "–",
    st.big ? st.big.d + " points · " + fmtDate(ROWS[st.big.i][F.date]) : ""));
  cards.push(card("Biggest win — " + esc(S.b),
    st.bigAgainst ? scoreline(st.bigAgainst.i, st) : "–",
    st.bigAgainst ? st.bigAgainst.d + " points · " +
      fmtDate(ROWS[st.bigAgainst.i][F.date]) : ""));
  cards.push(card("Highest scoring",
    st.highest ? scoreline(st.highest.i, st) : "–",
    st.highest ? st.highest.d + " points in total · " +
      fmtDate(ROWS[st.highest.i][F.date]) : ""));
  cards.push(card("Longest run — " + esc(S.a),
    st.wStreak ? st.wStreak + " wins" : "–",
    st.wSpan ? fmtDate(st.wSpan[0]) + " → " + fmtDate(st.wSpan[1]) : ""));
  cards.push(card("Longest run — " + esc(S.b),
    st.lStreak ? st.lStreak + " wins" : "–",
    st.lSpan ? fmtDate(st.lSpan[0]) + " → " + fmtDate(st.lSpan[1]) : ""));
  cards.push(card("Longest gap between meetings",
    st.gap ? (st.gap.days / 365.25).toFixed(1) + " years" : "–",
    st.gap ? fmtDate(st.gap.from) + " → " + fmtDate(st.gap.to) : ""));
  document.getElementById("h2h-cards").innerHTML = cards.join("");

  renderSplits(list, ai, st);
  renderMeetings(list, ai, st);
  document.getElementById("perf").textContent =
    (performance.now() - t0).toFixed(1) + " ms";
  writeHash();
}

function splitTable(groups, ai) {
  var keys = Object.keys(groups);
  if (!keys.length) return '<p class="nodata">nothing recorded</p>';
  var rows = keys.map(function (k) {
    var st = analyse(groups[k], ai);
    return { k: k, st: st };
  }).sort(function (a, b) { return b.st.played - a.st.played; });
  return '<table class="mini"><thead><tr><th></th><th>P</th><th>W</th>' +
    "<th>D</th><th>L</th><th>Win%</th></tr></thead><tbody>" +
    rows.map(function (r) {
      return "<tr><td>" + esc(r.k) + "</td><td>" + r.st.played + "</td><td>" +
        r.st.won + "</td><td>" + r.st.drawn + "</td><td>" + r.st.lost +
        "</td><td>" + pct(r.st.won, r.st.played) + "</td></tr>";
    }).join("") + "</tbody></table>";
}

function renderSplits(list, ai, st) {
  var venue = {}, era = {}, comp = {};
  list.forEach(function (i) {
    var r = ROWS[i];
    var vk = r[F.neutral] ? "Neutral venue"
           : (r[F.home] === ai ? "Home" : "Away");
    (venue[vk] = venue[vk] || []).push(i);
    var y = yearOf(r);
    var ek = eraLabel(y);
    (era[ek] = era[ek] || []).push(i);
    var ck = r[F.competition] === null ? "Not recorded"
           : LK.competition[r[F.competition]];
    (comp[ck] = comp[ck] || []).push(i);
  });
  document.getElementById("split-venue").innerHTML = splitTable(venue, ai);
  document.getElementById("split-era").innerHTML = splitTable(era, ai);
  document.getElementById("split-comp").innerHTML = splitTable(comp, ai);
}

function eraLabel(y) {
  if (!SC) return String(Math.floor(y / 10) * 10) + "s";
  var rows = SC.rows;
  if (y <= SC.goals_era_ends) return "Goals era (to " + SC.goals_era_ends + ")";
  for (var i = rows.length - 1; i >= 0; i--) {
    if (y >= rows[i][0]) {
      var to = i + 1 < rows.length ? rows[i + 1][0] - 1 : null;
      return rows[i][0] + (to ? "–" + to : " onwards");
    }
  }
  return "before " + rows[0][0];
}

// --------------------------------------------------------- meetings table
var MCOLS = [
  { l: "Date", c: "date" }, { l: "Home", c: "" }, { l: "Score", c: "score" },
  { l: "Away", c: "" }, { l: "Res", c: "" }, { l: "Marg", c: "num" },
  { l: "Competition", c: "" }, { l: "Venue", c: "" }, { l: "Rank H/A", c: "rk" }
];
var MGRID = "104px minmax(100px,1fr) 92px minmax(100px,1fr) 46px 56px " +
            "minmax(120px,1.4fr) minmax(110px,1.2fr) 82px";
var meetList = [], meetSt = null, meetAi = -1;

function renderMeetings(list, ai, st) {
  meetList = list; meetSt = st; meetAi = ai;
  document.getElementById("meetcount").textContent = num(list.length);
  var head = document.getElementById("meethead");
  head.style.gridTemplateColumns = MGRID;
  head.innerHTML = MCOLS.map(function (c) {
    return '<div class="' + c.c + '">' + c.l + "</div>";
  }).join("");
  document.getElementById("meetspacer").style.height =
    (list.length * 30) + "px";
  paintMeetings();
}

function paintMeetings() {
  var wrap = document.getElementById("meetwrap");
  var body = document.getElementById("meetbody");
  var first = Math.max(0, Math.floor(wrap.scrollTop / 30) - 6);
  var last = Math.min(meetList.length,
                      first + Math.ceil(wrap.clientHeight / 30) + 12);
  var out = "";
  for (var k = first; k < last; k++) {
    var i = meetList[k], r = ROWS[i], s = meetSt.seq[k];
    var sc = scores(i);
    var venue = r[F.stadium] !== null ? LK.stadium[r[F.stadium]]
              : (r[F.city] !== null ? LK.city[r[F.city]]
              : (r[F.country] !== null ? LK.country[r[F.country]] : "—"));
    var comp = r[F.competition] === null ? "—" : LK.competition[r[F.competition]];
    out += '<div class="trow" style="grid-template-columns:' + MGRID + '">' +
      '<div class="date">' + fmtDate(r[F.date]) + "</div>" +
      "<div>" + esc(TEAMS[r[F.home]]) + "</div>" +
      '<div class="score' + (s.restated ? " restated" : "") + '">' +
        sc[0] + "–" + sc[1] + "</div>" +
      "<div>" + esc(TEAMS[r[F.away]]) + "</div>" +
      '<div><span class="res ' + s.res + '">' + s.res + "</span></div>" +
      '<div class="num">' + Math.abs(s.diff) + "</div>" +
      '<div title="' + esc(comp) + '">' + esc(comp) +
        (r[F.world_cup] ? '<span class="tag rwc">RWC</span>' : "") +
        (r[F.neutral] ? '<span class="tag">N</span>' : "") + "</div>" +
      '<div title="' + esc(venue) + '">' + esc(venue) + "</div>" +
      '<div class="rk">' + (r[F.home_rank_before] === null ? "–" : r[F.home_rank_before]) +
        " / " + (r[F.away_rank_before] === null ? "–" : r[F.away_rank_before]) +
      "</div></div>";
  }
  body.style.transform = "translateY(" + (first * 30) + "px)";
  body.innerHTML = out;
}

// ------------------------------------------------------- all-opponents view
var oppRows = [];
function renderAllOpponents() {
  var t0 = performance.now();
  var ai = teamIdx[S.a];
  var by = {};
  for (var i = 0; i < N; i++) {
    var r = ROWS[i], h = r[F.home], a = r[F.away];
    if (h !== ai && a !== ai) continue;
    var opp = h === ai ? a : h;
    (by[opp] = by[opp] || []).push(i);
  }
  oppRows = Object.keys(by).map(function (o) {
    var st = analyse(by[o], ai);
    return { opp: TEAMS[o], st: st,
             first: ROWS[by[o][0]][F.date], last: ROWS[by[o][by[o].length - 1]][F.date] };
  }).sort(function (x, y) {
    // most-played first, then alphabetical - never an arbitrary order for
    // opponents a team has met the same number of times
    return (y.st.played - x.st.played) ||
           (x.opp < y.opp ? -1 : (x.opp > y.opp ? 1 : 0));
  });

  document.getElementById("rivalry").hidden = true;
  document.getElementById("allopp").hidden = false;
  document.getElementById("opp-title").textContent = S.a;
  document.getElementById("opp-sub").textContent =
    "Record against every opponent. Pick a second team above for the full " +
    "rivalry, or click an opponent below.";

  var view = oppRows;
  if (S.find) {
    var q = S.find.toLowerCase();
    view = view.filter(function (x) {
      return x.opp.toLowerCase().indexOf(q) !== -1;
    });
  }
  document.getElementById("oppcount").textContent = num(view.length);
  var grid = "minmax(140px,1.6fr) 58px 52px 52px 52px 66px 74px 74px 106px 106px";
  var head = document.getElementById("opphead");
  head.style.gridTemplateColumns = grid;
  head.innerHTML = ["Opponent", "P", "W", "D", "L", "Win%", "For", "Against",
                    "First met", "Last met"]
    .map(function (l, i) {
      return '<div class="' + (i > 0 && i < 8 ? "num" : "") + '">' + l + "</div>";
    }).join("");
  var out = view.map(function (x) {
    return '<div class="trow" style="grid-template-columns:' + grid + '">' +
      '<div class="teamcell"><a href="#a=' + encodeURIComponent(S.a) +
        "&b=" + encodeURIComponent(x.opp) + '">' + esc(x.opp) + "</a></div>" +
      '<div class="num">' + x.st.played + "</div>" +
      '<div class="num up">' + x.st.won + "</div>" +
      '<div class="num">' + x.st.drawn + "</div>" +
      '<div class="num down">' + x.st.lost + "</div>" +
      '<div class="num">' + pct(x.st.won, x.st.played) + "</div>" +
      '<div class="num">' + num(x.st.pf) + "</div>" +
      '<div class="num">' + num(x.st.pa) + "</div>" +
      '<div class="date">' + fmtDate(x.first) + "</div>" +
      '<div class="date">' + fmtDate(x.last) + "</div></div>";
  }).join("");
  document.getElementById("oppspacer").style.height = "0px";
  document.getElementById("oppbody").style.transform = "none";
  document.getElementById("oppbody").innerHTML = out;
  writeHash();
}

// ------------------------------------------------------------------- basis
function applyBasisNote() {
  var note = document.getElementById("basisnote");
  document.getElementById("era-wrap").hidden = S.basis !== "restated";
  if (S.basis !== "restated" || !SC) { note.hidden = true; return; }
  var v = valuesFor(S.era);
  note.hidden = false;
  note.innerHTML = "Scores are restated under the <b>" + S.era +
    "</b> scoring system (try " + v[0] + ", conversion +" + v[1] +
    ", penalty " + v[2] + ", drop goal " + v[3] + ", penalty try " + v[4] +
    "), taken from your own <b>Scoring Systems</b> sheet. Only the <b>" +
    num(SC.coverage) + "</b> matches (" +
    (100 * SC.coverage / SC.total_matches).toFixed(1) +
    "% of the archive) that record a full try-and-kick breakdown can be " +
    "restated — every other match keeps its score exactly as played, and is " +
    "shown in grey. Restated figures are therefore only comparable within " +
    "that subset.";
}

// -------------------------------------------------------------------- wire
function teamOptions(placeholder) {
  var counts = {};
  for (var i = 0; i < N; i++) {
    counts[ROWS[i][F.home]] = (counts[ROWS[i][F.home]] || 0) + 1;
    counts[ROWS[i][F.away]] = (counts[ROWS[i][F.away]] || 0) + 1;
  }
  var top = TEAMS.slice().sort(function (a, b) {
    return (counts[teamIdx[b]] || 0) - (counts[teamIdx[a]] || 0);
  }).slice(0, 12);
  var h = '<option value="">' + placeholder + "</option>" +
          '<optgroup label="Most played">';
  top.forEach(function (t) {
    h += '<option value="' + esc(t) + '">' + esc(t) + "</option>";
  });
  h += '</optgroup><optgroup label="All teams, A–Z">';
  TEAMS.slice().sort().forEach(function (t) {
    h += '<option value="' + esc(t) + '">' + esc(t) + "</option>";
  });
  return h + "</optgroup>";
}

function refresh() {
  applyBasisNote();
  if (S.a && S.b && S.a !== S.b) renderRivalry();
  else if (S.a) renderAllOpponents();
  else {
    document.getElementById("rivalry").hidden = true;
    document.getElementById("allopp").hidden = false;
    document.getElementById("opp-title").textContent = "Pick a team";
    document.getElementById("opp-sub").textContent =
      "Choose a team above to see its record against every opponent, then a " +
      "second team for the full rivalry.";
    document.getElementById("oppbody").innerHTML = "";
    document.getElementById("oppcount").textContent = "0";
    document.getElementById("opphead").innerHTML = "";
  }
}

function writeHash() {
  var p = [];
  if (S.a) p.push("a=" + encodeURIComponent(S.a));
  if (S.b) p.push("b=" + encodeURIComponent(S.b));
  if (S.basis === "restated") p.push("era=" + S.era);
  var h = p.length ? "#" + p.join("&") : "";
  if (location.hash !== h) {
    history.replaceState(null, "", location.pathname + location.search + h);
  }
}

function readHash() {
  var h = location.hash.replace(/^#/, "");
  if (!h) return;
  h.split("&").forEach(function (kv) {
    var p = kv.split("="), k = p[0], v = decodeURIComponent(p[1] || "");
    if (k === "a") S.a = v;
    else if (k === "b") S.b = v;
    else if (k === "era") { S.basis = "restated"; S.era = +v; }
  });
}

function syncControls() {
  document.getElementById("f-a").value = S.a;
  document.getElementById("f-b").value = S.b;
  document.getElementById("f-era").value = S.era;
  [].forEach.call(document.getElementById("f-basis").children, function (c) {
    c.classList.toggle("on", c.dataset.v === S.basis);
  });
}

function init() {
  document.getElementById("buildinfo").innerHTML =
    num(D.meta.matches) + " matches · " + num(D.meta.teams) + " teams<br>" +
    "scoring systems from " + esc(SC ? SC.source : "n/a");

  document.getElementById("f-a").innerHTML = teamOptions("Pick a team");
  document.getElementById("f-b").innerHTML = teamOptions("Every opponent");

  if (SC) {
    S.era = SC.rows[SC.rows.length - 1][0];
    document.getElementById("f-era").innerHTML = SC.rows.slice().reverse()
      .map(function (r) {
        return '<option value="' + r[0] + '">' + eraLabel(r[0]) +
          " (try " + r[1] + ")</option>";
      }).join("");
  }

  document.getElementById("f-a").addEventListener("change", function () {
    S.a = this.value; refresh();
  });
  document.getElementById("f-b").addEventListener("change", function () {
    S.b = this.value; refresh();
  });
  document.getElementById("swap").addEventListener("click", function () {
    var t = S.a; S.a = S.b; S.b = t; syncControls(); refresh();
  });
  document.getElementById("f-basis").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    S.basis = b.dataset.v; syncControls(); refresh();
  });
  document.getElementById("f-era").addEventListener("change", function () {
    S.era = +this.value; refresh();
  });
  document.getElementById("opp-find").addEventListener("input", function () {
    S.find = this.value.trim(); renderAllOpponents();
  });
  document.getElementById("export").addEventListener("click", exportCSV);
  document.getElementById("meetwrap").addEventListener("scroll", paintMeetings,
                                                       { passive: true });
  window.addEventListener("resize", function () {
    if (!document.getElementById("rivalry").hidden && S.a && S.b) {
      drawChart(analyse(meetings(teamIdx[S.a], teamIdx[S.b]), teamIdx[S.a]),
                S.a, S.b);
    }
  });
  window.addEventListener("hashchange", function () {
    S.a = S.b = ""; readHash(); syncControls(); refresh();
  });

  readHash();
  syncControls();
  refresh();
  document.getElementById("loading").hidden = true;
  document.getElementById("app").hidden = false;
  if (S.a && S.b) refresh();
}

function exportCSV() {
  function q(v) {
    if (v === null || v === undefined) return "";
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  var out = [];
  if (S.a && S.b) {
    out.push(["Rivalry", S.a + " v " + S.b].map(q).join(","));
    out.push(["Scores", S.basis === "restated"
      ? "restated under the " + S.era + " system" : "as played"].map(q).join(","));
    out.push("");
    out.push(["Date", "Home", "Home score", "Away score", "Away",
              "Result (" + S.a + ")", "Margin", "Restated?", "Competition",
              "Venue", "Neutral", "World Cup", "Home rank before",
              "Away rank before", "Excel row"].map(q).join(","));
    meetList.forEach(function (i, k) {
      var r = ROWS[i], s = meetSt.seq[k], sc = scores(i);
      out.push([r[F.date], TEAMS[r[F.home]], sc[0], sc[1], TEAMS[r[F.away]],
        s.res, Math.abs(s.diff), s.restated ? "yes" : "no",
        r[F.competition] === null ? "" : LK.competition[r[F.competition]],
        r[F.stadium] === null ? "" : LK.stadium[r[F.stadium]],
        r[F.neutral] ? "TRUE" : "FALSE", r[F.world_cup] ? "TRUE" : "FALSE",
        r[F.home_rank_before] === null ? "" : r[F.home_rank_before],
        r[F.away_rank_before] === null ? "" : r[F.away_rank_before],
        r[F.excel_row]].map(q).join(","));
    });
  } else {
    out.push(["Team", S.a].map(q).join(","));
    out.push("");
    out.push(["Opponent", "Played", "Won", "Drawn", "Lost", "Win %",
              "Points for", "Points against", "First met",
              "Last met"].map(q).join(","));
    oppRows.forEach(function (x) {
      out.push([x.opp, x.st.played, x.st.won, x.st.drawn, x.st.lost,
        pct(x.st.won, x.st.played), x.st.pf, x.st.pa, x.first,
        x.last].map(q).join(","));
    });
  }
  var blob = new Blob(["﻿" + out.join("\r\n")],
                      { type: "text/csv;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "head-to-head" + (S.a ? "-" + S.a : "") +
               (S.b ? "-v-" + S.b : "") + ".csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

window.__H2H = {
  set: function (patch) {
    Object.keys(patch).forEach(function (k) { S[k] = patch[k]; });
    syncControls(); refresh();
    return S.a && S.b ? meetList.length : oppRows.length;
  },
  stats: function () {
    if (!(S.a && S.b)) return null;
    var ai = teamIdx[S.a];
    var st = analyse(meetings(ai, teamIdx[S.b]), ai);
    return { played: st.played, won: st.won, drawn: st.drawn, lost: st.lost,
             pf: st.pf, pa: st.pa, restated: st.restated,
             big: st.big ? st.big.d : null,
             bigAgainst: st.bigAgainst ? st.bigAgainst.d : null,
             highest: st.highest ? st.highest.d : null,
             wStreak: st.wStreak, lStreak: st.lStreak, uStreak: st.uStreak,
             lead: st.won - st.lost };
  },
  opponents: function () {
    return oppRows.map(function (x) {
      return [x.opp, x.st.played, x.st.won, x.st.drawn, x.st.lost, x.st.pf,
              x.st.pa];
    });
  }
};

init();

})();
