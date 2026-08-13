/* Rugby Archive — Rankings Time Machine.

   The world table as at any date since 27 March 1871, under any of the four
   what-if rule sets.

   IMPORTANT: no ranking rule exists in this file. The pipeline ran
   engine\rugby_ranking_engine.py four times and recorded, for each rule set,
   every team's rating after every match it counted. All this page does is
   replay that recording up to the chosen date and sort the result. If the
   rules ever change, they change in the engine and this page follows.        */

(function () {
"use strict";

var D = window.RUGBY_RANKINGS;
if (!D || window.__dataFailed) {
  document.getElementById("loading").hidden = true;
  document.getElementById("dataerror").hidden = false;
  return;
}

var TEAMS = D.teams;
var M = D.matches;                 // [dayNumber, home, away, hs, as]
var SETS = D.sets;
var ORDER = D.order;

/* Era-correct names. TEAMS holds one entry per lineage - the identity the
   rating belongs to - so the Soviet Union and Russia are one row whose rating
   runs straight through. D.lineages says which name that row was using on a
   given day, so the table reads "Soviet Union" with the slider in 1980 and
   "Russia" with it in 2010. Names only: no rating moves.
   Sorting and tie-breaks deliberately keep using TEAMS, so dragging the slider
   never reshuffles two equally-rated sides. */
var LINEAGE = {};
(D.lineages || []).forEach(function (l) { LINEAGE[l.team] = l.names; });
function nameAt(t, day) {
  var w = LINEAGE[t];
  if (!w) return TEAMS[t];
  for (var i = 0; i < w.length; i++) {
    if ((w[i][0] === null || day >= w[i][0]) &&
        (w[i][1] === null || day <= w[i][1])) return w[i][2];
  }
  return TEAMS[t];
}
var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
              "August", "September", "October", "November", "December"];
var MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep",
            "Oct", "Nov", "Dec"];

// ------------------------------------------------------------------- dates
var EPOCH = new Date(D.epoch + "T00:00:00Z").getTime();
var DAY = 86400000;
function dayToDate(n) { return new Date(EPOCH + n * DAY); }
function dayToISO(n) { return dayToDate(n).toISOString().slice(0, 10); }
function isoToDay(s) {
  return Math.round((new Date(s + "T00:00:00Z").getTime() - EPOCH) / DAY);
}
function pretty(n) {
  var d = dayToDate(n);
  return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " +
         d.getUTCFullYear();
}
function shortDate(n) {
  var d = dayToDate(n);
  return d.getUTCDate() + " " + MON3[d.getUTCMonth()] + " " + d.getUTCFullYear();
}

var DAY_FIRST = isoToDay(D.first_match);
var DAY_LAST = isoToDay(D.last_match);

// ------------------------------------------------------------------- state
/* lions defaults to "0" - EXCLUDED - because that is what World Rugby
   actually does. Their published ratings do not move across Lions Tests.
   The "counted" view is kept as a what-if, not as the headline table. */
var S = { mode: "official", lions: "0", compare: "", find: "", dormant: "show",
          day: DAY_LAST, sort: "rank", dir: 1 };
var DORMANT_DAYS = 365 * 4;   // no match in four years

function setKey(mode, lions) {
  return mode + (lions === "1" || lions === true ? "" : "_no_lions");
}

/* Walk one rule set's recording up to and including `day`.
   Returns ratings, when each team last moved, and how many counted matches
   each team had played by then. */
function tableAt(key, day) {
  var set = SETS[key], rows = set.rows, r = set.r;
  var rating = {}, last = {}, played = {}, counted = 0;
  for (var k = 0; k < rows.length; k++) {
    var m = M[rows[k]];
    if (m[0] > day) break;
    var h = m[1], a = m[2];
    rating[h] = r[2 * k];
    rating[a] = r[2 * k + 1];
    last[h] = last[a] = m[0];
    played[h] = (played[h] || 0) + 1;
    played[a] = (played[a] || 0) + 1;
    counted++;
  }
  var order = Object.keys(rating).map(Number);
  order.sort(function (x, y) {
    return rating[y] - rating[x] || (TEAMS[x] < TEAMS[y] ? -1 : 1);
  });
  var pos = {};
  for (var i = 0; i < order.length; i++) pos[order[i]] = i + 1;
  return { rating: rating, pos: pos, order: order, last: last,
           played: played, counted: counted, cursor: k };
}

function recentMatches(key, day, n) {
  var rows = SETS[key].rows, out = [];
  for (var k = rows.length - 1; k >= 0 && out.length < n; k--) {
    var m = M[rows[k]];
    if (m[0] > day) continue;
    out.push(m);
  }
  return out;
}

// --------------------------------------------------------------- rendering
var COLS = [
  { key: "rank",   label: "#",            cls: "num" },
  { key: "move",   label: "12m",          cls: "num" },
  { key: "team",   label: "Team",         cls: "" },
  { key: "rating", label: "Rating",       cls: "num" },
  { key: "chg",    label: "12m pts",      cls: "num" },
  { key: "played", label: "Played",       cls: "num" },
  { key: "last",   label: "Last played",  cls: "" }
];
var CMP_COLS = [
  { key: "cpos",  label: "Other rank", cls: "num" },
  { key: "cdiff", label: "Diff",        cls: "num" }
];

var ROW_H = 30;
var wrap = document.getElementById("tablewrap");
var spacer = document.getElementById("tablespacer");
var bodyEl = document.getElementById("tablebody");
var headEl = document.getElementById("tablehead");
var emptyEl = document.getElementById("empty");
var rows = [];          // the current, sorted, filtered view

function cols() {
  return S.compare ? COLS.concat(CMP_COLS) : COLS;
}

function drawHead() {
  var c = cols();
  headEl.style.gridTemplateColumns = gridCols();
  headEl.innerHTML = c.map(function (x) {
    var on = S.sort === x.key;
    return '<div data-key="' + x.key + '" class="' + x.cls +
      (on ? " sorted" : "") + '">' + x.label +
      (on ? ' <span class="arrow">' + (S.dir > 0 ? "▲" : "▼") + "</span>" : "") +
      "</div>";
  }).join("");
}

function gridCols() {
  return S.compare
    ? "44px 52px minmax(120px,1fr) 74px 70px 60px 118px 84px 54px"
    : "44px 52px minmax(120px,1fr) 78px 74px 64px 118px";
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function movement(v) {
  if (v === null) return '<span class="mv new">new</span>';
  if (v === 0) return '<span class="mv same">–</span>';
  if (v > 0) return '<span class="mv up">▲' + v + "</span>";
  return '<span class="mv down">▼' + (-v) + "</span>";
}

function rowHTML(x) {
  var link = "index.html#team=" + encodeURIComponent(x.name);
  var h = '<div class="trow" style="grid-template-columns:' + gridCols() + '">' +
    '<div class="num pos">' + x.rank + "</div>" +
    '<div class="num">' + movement(x.move) + "</div>" +
    '<div class="teamcell"><a href="' + link + '" title="See every ' +
      esc(x.name) + " match in the Super Filter\">" + esc(x.name) + "</a></div>" +
    '<div class="num rating">' + x.rating.toFixed(2) + "</div>" +
    '<div class="num ' + (x.chg > 0 ? "up" : (x.chg < 0 ? "down" : "")) + '">' +
      (x.chg === null ? "–" : (x.chg > 0 ? "+" : "") + x.chg.toFixed(2)) +
      "</div>" +
    '<div class="num">' + x.played + "</div>" +
    '<div class="lastp' + (x.dormant ? " dormant" : "") + '">' +
      shortDate(x.last) + (x.dormant ? ' <span class="tag">idle</span>' : "") +
      "</div>";
  if (S.compare) {
    h += '<div class="num">' + (x.cpos === null ? "–" : x.cpos) + "</div>" +
         '<div class="num ' + (x.cdiff > 0 ? "up" : (x.cdiff < 0 ? "down" : "")) +
         '">' + (x.cdiff === null ? "–"
                 : (x.cdiff === 0 ? "–" : (x.cdiff > 0 ? "+" : "") + x.cdiff)) +
         "</div>";
  }
  return h + "</div>";
}

function paint() {
  var top = wrap.scrollTop;
  var first = Math.max(0, Math.floor(top / ROW_H) - 6);
  var count = Math.ceil(wrap.clientHeight / ROW_H) + 12;
  var last = Math.min(rows.length, first + count);
  var html = "";
  for (var k = first; k < last; k++) html += rowHTML(rows[k]);
  bodyEl.style.transform = "translateY(" + (first * ROW_H) + "px)";
  bodyEl.innerHTML = html;
}

function setText(id, v) { document.getElementById(id).textContent = v; }

// ------------------------------------------------------------------ update
var lastNow = null;

function refresh() {
  var t0 = performance.now();
  var key = setKey(S.mode, S.lions);
  var now = tableAt(key, S.day);
  var yearAgo = tableAt(key, S.day - 365);
  var cmp = S.compare ? tableAt(S.compare, S.day) : null;
  lastNow = now;

  rows = now.order.map(function (t) {
    var wasPos = yearAgo.pos[t], wasRating = yearAgo.rating[t];
    return {
      id: t, name: nameAt(t, S.day), rank: now.pos[t], rating: now.rating[t],
      move: wasPos === undefined ? null : wasPos - now.pos[t],
      chg: wasRating === undefined ? null : now.rating[t] - wasRating,
      played: now.played[t] || 0, last: now.last[t],
      dormant: (S.day - now.last[t]) > DORMANT_DAYS,
      cpos: cmp ? (cmp.pos[t] === undefined ? null : cmp.pos[t]) : null,
      cdiff: cmp ? (cmp.pos[t] === undefined ? null : now.pos[t] - cmp.pos[t])
                 : null
    };
  });

  if (S.dormant === "hide") {
    rows = rows.filter(function (x) { return !x.dormant; });
    for (var ri = 0; ri < rows.length; ri++) rows[ri].rank = ri + 1;
  }
  if (S.find) {
    var q = S.find.toLowerCase();
    rows = rows.filter(function (x) {
      return x.name.toLowerCase().indexOf(q) !== -1;
    });
  }
  sortRows();

  // ---- headline cards
  var top1 = rows.length ? rows0(now, rows[0].id) : null;
  if (top1) {
    setText("k-no1", nameAt(top1.team, S.day));
    setText("k-no1-sub", top1.rating.toFixed(2) + " points" +
      (top1.since !== null
        ? " · top of the table since " + shortDate(top1.since) + " (" +
          Math.round(top1.days / 365.25 * 10) / 10 + " years)"
        : " · highest-rated side still active on this date; another team is "
          + "rated higher but has not played in four years"));
  } else {
    setText("k-no1", "—");
    setText("k-no1-sub", "no matches played yet");
  }
  setText("k-teams", now.order.length.toLocaleString("en-GB"));
  setText("k-teams-sub", "of " + TEAMS.length + " that ever appear");
  setText("k-matches", now.counted.toLocaleString("en-GB"));
  setText("k-matches-sub", "counted under these rules since 1871");

  var climbs = rows.filter(function (x) { return x.move !== null; });
  var up = climbs.slice().sort(function (a, b) { return b.move - a.move; })[0];
  var dn = climbs.slice().sort(function (a, b) { return a.move - b.move; })[0];
  setText("k-climb", up && up.move > 0 ? up.name : "—");
  setText("k-climb-sub", up && up.move > 0
    ? "up " + up.move + " places in 12 months (now " + up.rank + ")" : "");
  setText("k-fall", dn && dn.move < 0 ? dn.name : "—");
  setText("k-fall-sub", dn && dn.move < 0
    ? "down " + (-dn.move) + " places in 12 months (now " + dn.rank + ")" : "");

  var rec = recentMatches(key, S.day, 6);
  document.getElementById("k-recent").innerHTML = rec.length
    ? rec.map(function (m) {
        return "<li><span>" + shortDate(m[0]) + "</span> " +
          esc(nameAt(m[1], m[0])) + " <b>" + m[3] + "–" + m[4] + "</b> " +
          esc(nameAt(m[2], m[0])) + "</li>";
      }).join("")
    : "<li><span>none yet</span></li>";

  setText("rowcount", rows.length.toLocaleString("en-GB"));
  setText("asat-date", pretty(S.day));
  document.getElementById("f-compare").value = S.compare;
  [].forEach.call(document.getElementById("f-dormant").children, function (c) {
    c.classList.toggle("on", c.dataset.v === S.dormant);
  });
  document.getElementById("datebox").value = dayToISO(S.day);
  document.getElementById("slider").value = S.day;

  var set = SETS[key];
  document.getElementById("rulenote").textContent =
    set.blurb + "  Under these rules " + set.matches_counted.toLocaleString("en-GB") +
    " of " + M.length.toLocaleString("en-GB") +
    " matches in the archive count, and " + set.teams_ranked +
    " teams are ranked by 2026.";

  drawHead();
  spacer.style.height = (rows.length * ROW_H) + "px";
  emptyEl.hidden = rows.length > 0;
  paint();
  setText("perf", (performance.now() - t0).toFixed(1) + " ms");
}

/* Who has been No.1, and since when.

   Computed ONCE per rule set and cached: a list of [dayNumber, teamId] at
   every change of leader. Recomputing this on every slider move would mean
   re-sorting 295 teams 9,864 times, which is exactly the sort of thing that
   makes a slider feel sticky. */
var LEADERS = {};

function leaderTimeline(key) {
  if (LEADERS[key]) return LEADERS[key];
  var set = SETS[key], rws = set.rows, r = set.r;
  var rating = {}, out = [], best = -1, bestV = -1e9;

  function better(t, v) {                 // same tie-break as the table sort
    if (v > bestV) return true;
    if (v < bestV) return false;
    return TEAMS[t] < TEAMS[best];
  }
  function rescan() {
    best = -1; bestV = -1e9;
    for (var t in rating) {
      var tv = rating[t];
      if (tv > bestV || (tv === bestV && TEAMS[t] < TEAMS[best])) {
        bestV = tv; best = +t;
      }
    }
  }

  for (var k = 0; k < rws.length; k++) {
    var m = M[rws[k]], h = m[1], a = m[2];
    var leaderPlayed = (h === best || a === best);
    var leaderWas = bestV;
    rating[h] = r[2 * k];
    rating[a] = r[2 * k + 1];
    if (leaderPlayed && rating[best] < leaderWas) {
      rescan();                            // the leader lost points: re-check all
    } else {
      if (better(h, rating[h])) { best = h; bestV = rating[h]; }
      if (better(a, rating[a])) { best = a; bestV = rating[a]; }
      if (h === best) bestV = rating[h];
      if (a === best) bestV = rating[a];
    }
    if (!out.length || out[out.length - 1][1] !== best) out.push([m[0], best]);
  }
  LEADERS[key] = out;
  return out;
}

function leaderAt(key, day) {
  var tl = leaderTimeline(key), lo = 0, hi = tl.length - 1, found = null;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (tl[mid][0] <= day) { found = tl[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

function rows0(now, team) {
  var key = setKey(S.mode, S.lions);
  var l = leaderAt(key, S.day);
  var since = l ? l[0] : null;
  var agrees = l ? l[1] === team : true;
  return { team: team, rating: now.rating[team],
           since: agrees ? since : null,
           days: (agrees && since !== null) ? S.day - since : 0 };
}

function sortRows() {
  var k = S.sort, d = S.dir;
  var get = {
    rank: function (x) { return x.rank; },
    move: function (x) { return x.move === null ? -999 : x.move; },
    rating: function (x) { return x.rating; },
    chg: function (x) { return x.chg === null ? -1e9 : x.chg; },
    played: function (x) { return x.played; },
    last: function (x) { return x.last; },
    cpos: function (x) { return x.cpos === null ? 1e9 : x.cpos; },
    cdiff: function (x) { return x.cdiff === null ? -1e9 : x.cdiff; }
  }[k];
  if (k === "team") {
    rows.sort(function (a, b) {
      return (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)) * d;
    });
  } else {
    rows.sort(function (a, b) { return (get(a) - get(b)) * d || a.rank - b.rank; });
  }
}

// ------------------------------------------------------------------- wire
var JUMPS = [
  ["First international", "1871-03-27"],
  ["1905 Originals tour", "1905-12-16"],
  ["First RWC final", "1987-06-20"],
  ["1995 RWC final", "1995-06-24"],
  ["2003 RWC final", "2003-11-22"],
  ["2007 RWC final", "2007-10-20"],
  ["2011 RWC final", "2011-10-23"],
  ["2015 RWC final", "2015-10-31"],
  ["2019 RWC final", "2019-11-02"],
  ["2023 RWC final", "2023-10-28"]
];

function init() {
  document.getElementById("buildinfo").innerHTML =
    "Rankings replayed from " + D.first_match + " to " + D.last_match +
    "<br>four rule sets · built " + D.built.replace("T", " ");

  var slider = document.getElementById("slider");
  slider.min = DAY_FIRST;
  slider.max = DAY_LAST;
  slider.value = DAY_LAST;
  document.getElementById("datebox").min = D.first_match;
  document.getElementById("datebox").max = D.last_match;

  // decade ticks under the slider
  var ticks = [], span = DAY_LAST - DAY_FIRST;
  for (var y = 1880; y <= 2020; y += 20) {
    var dnum = isoToDay(y + "-01-01");
    ticks.push('<i style="left:' + (100 * (dnum - DAY_FIRST) / span) +
               '%">' + y + "</i>");
  }
  document.getElementById("sliderticks").innerHTML = ticks.join("");

  document.getElementById("jumps").innerHTML = JUMPS.map(function (j) {
    return '<button type="button" data-d="' + j[1] + '">' + j[0] + "</button>";
  }).join("");

  var cmpSel = document.getElementById("f-compare");
  ORDER.forEach(function (k) {
    var o = document.createElement("option");
    o.value = k; o.textContent = SETS[k].label;
    cmpSel.appendChild(o);
  });

  slider.addEventListener("input", function () {
    stop(); S.day = +this.value; refresh();
  });
  document.getElementById("datebox").addEventListener("change", function () {
    if (!this.value) return;
    stop();
    S.day = Math.min(DAY_LAST, Math.max(DAY_FIRST, isoToDay(this.value)));
    refresh();
  });
  document.getElementById("today").addEventListener("click", function () {
    stop(); S.day = DAY_LAST; refresh();
  });
  document.getElementById("jumps").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    stop();
    [].forEach.call(this.children, function (c) { c.classList.remove("on"); });
    b.classList.add("on");
    S.day = Math.min(DAY_LAST, Math.max(DAY_FIRST, isoToDay(b.dataset.d)));
    refresh();
  });

  function seg(id, key, after) {
    var box = document.getElementById(id);
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      [].forEach.call(box.children, function (c) { c.classList.remove("on"); });
      b.classList.add("on");
      S[key] = b.dataset.v;
      if (after) after();
      refresh();
    });
  }
  seg("f-mode", "mode");
  seg("f-lions", "lions");
  seg("f-dormant", "dormant");
  seg("speed", "speed");

  cmpSel.addEventListener("change", function () {
    S.compare = this.value;
    if (S.compare === setKey(S.mode, S.lions)) S.compare = "";
    this.value = S.compare;
    if (S.sort === "cpos" || S.sort === "cdiff") { S.sort = "rank"; S.dir = 1; }
    refresh();
  });
  document.getElementById("f-find").addEventListener("input", function () {
    S.find = this.value.trim(); refresh();
  });

  headEl.addEventListener("click", function (e) {
    var d = e.target.closest("[data-key]"); if (!d) return;
    var k = d.dataset.key;
    if (S.sort === k) S.dir = -S.dir;
    else { S.sort = k; S.dir = (k === "rank" || k === "team") ? 1 : -1; }
    sortRows(); drawHead(); paint();
  });

  wrap.addEventListener("scroll", paint, { passive: true });
  window.addEventListener("resize", paint);
  document.getElementById("play").addEventListener("click", toggle);
  document.getElementById("export").addEventListener("click", exportCSV);

  document.addEventListener("keydown", function (e) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === "ArrowLeft") { stop(); step(-1); }
    else if (e.key === "ArrowRight") { stop(); step(1); }
    else if (e.key === " ") { e.preventDefault(); toggle(); }
  });

  refresh();
  document.getElementById("loading").hidden = true;
  document.getElementById("app").hidden = false;
  paint();
}

/* Step to the previous/next date on which the table actually changed, so the
   arrow keys never land on a day where nothing happened. */
function step(dir) {
  var rws = SETS[setKey(S.mode, S.lions)].rows;
  var day = S.day;
  if (dir > 0) {
    for (var k = 0; k < rws.length; k++) {
      if (M[rws[k]][0] > day) { S.day = M[rws[k]][0]; refresh(); return; }
    }
    S.day = DAY_LAST;
  } else {
    for (var j = rws.length - 1; j >= 0; j--) {
      if (M[rws[j]][0] < day) { S.day = M[rws[j]][0]; refresh(); return; }
    }
    S.day = DAY_FIRST;
  }
  refresh();
}

// -------------------------------------------------------------------- play
var timer = null;
S.speed = "1";
function toggle() { if (timer) stop(); else start(); }
function start() {
  if (S.day >= DAY_LAST) S.day = DAY_FIRST;
  document.getElementById("play").textContent = "❚❚ Pause";
  document.getElementById("play").classList.add("on");
  timer = setInterval(function () {
    S.day += 30 * +S.speed;          // a month per tick
    if (S.day >= DAY_LAST) { S.day = DAY_LAST; refresh(); stop(); return; }
    refresh();
  }, 80);
}
function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  document.getElementById("play").textContent = "▶ Play";
  document.getElementById("play").classList.remove("on");
}

// --------------------------------------------------------------------- CSV
function exportCSV() {
  var key = setKey(S.mode, S.lions);
  var head = ["Rank", "Team", "Rating", "12-month position change",
              "12-month rating change", "Matches counted", "Last played"];
  if (S.compare) head.push(SETS[S.compare].label + " rank", "Difference");
  function q(v) {
    if (v === null || v === undefined) return "";
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  var out = ["As at," + q(dayToISO(S.day)),
             "Rule set," + q(SETS[key].label),
             "Idle teams," + q(S.dormant === "hide"
               ? "hidden (no match in four years)" : "shown"),
             "", head.map(q).join(",")];
  rows.forEach(function (x) {
    var line = [x.rank, x.name, x.rating.toFixed(4),
                x.move === null ? "" : x.move,
                x.chg === null ? "" : x.chg.toFixed(4),
                x.played, dayToISO(x.last)];
    if (S.compare) line.push(x.cpos === null ? "" : x.cpos,
                             x.cdiff === null ? "" : x.cdiff);
    out.push(line.map(q).join(","));
  });
  var blob = new Blob(["﻿" + out.join("\r\n")],
                      { type: "text/csv;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "world-rankings-" + dayToISO(S.day) + "-" + key + ".csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

// test hook, same idea as the Super Filter's
window.__TM = {
  set: function (patch) {
    Object.keys(patch).forEach(function (k) {
      if (k === "date") S.day = isoToDay(patch[k]);
      else S[k] = patch[k];
    });
    refresh();
    return rows.length;
  },
  tableAt: function (mode, lions, iso) {
    var t = tableAt(setKey(mode, lions), isoToDay(iso));
    return t.order.map(function (id, i) {
      return [i + 1, nameAt(id, isoToDay(iso)),
              Math.round(t.rating[id] * 10000) / 10000];
    });
  },
  state: function () { return S; },
  top: function (n) {
    return rows.slice(0, n || 10).map(function (x) {
      return [x.rank, x.name, +x.rating.toFixed(2)];
    });
  }
};

init();

})();
