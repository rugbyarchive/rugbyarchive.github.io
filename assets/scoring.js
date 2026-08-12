/* Rugby Archive — Score Normalisation.

   Re-scores historical matches under any scoring system rugby has used.

   The scoring values come from RUGBY_DATA.scoring.rows, which the pipeline
   reads out of the owner's own "Scoring Systems" sheet (SECTION 4). Nothing
   here is hard-coded, so correcting rugby history is an Excel edit.

   Two numbers are computed per side:
     "as played"  - the score in the archive
     "own era"    - what the recorded tries and kicks come to under the rules
                    in force on the day. If that differs from "as played", the
                    row is flagged: either the breakdown or the score is wrong.
     "restated"   - what they come to under the chosen target system.          */

(function () {
"use strict";

var D = window.RUGBY_DATA;
if (!D || window.__dataFailed) {
  document.getElementById("loading").hidden = true;
  document.getElementById("dataerror").hidden = false;
  return;
}
var SC = D.scoring, BREAK = D.breakdowns || {};
if (!SC || !Object.keys(BREAK).length) {
  document.getElementById("loading").hidden = true;
  document.getElementById("nodata").hidden = false;
  return;
}

var F = {};
D.fields.forEach(function (n, i) { F[n] = i; });
var ROWS = D.rows, LK = D.lookups, TEAMS = LK.teams;
var MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep",
            "Oct", "Nov", "Dec"];

var S = { target: SC.rows[SC.rows.length - 1][0], show: "all", team: "" };

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
function fmtDate(s) {
  return +s.slice(8, 10) + " " + MON3[+s.slice(5, 7) - 1] + " " + s.slice(0, 4);
}
function num(n) { return n.toLocaleString("en-GB"); }

function valuesFor(year) {
  var v = SC.rows[0].slice(1);
  for (var i = 0; i < SC.rows.length; i++) {
    if (year >= SC.rows[i][0]) v = SC.rows[i].slice(1);
  }
  return v;
}
function pointsFrom(c, v) {
  return c[0] * v[0] + c[1] * v[1] + c[2] * v[2] + c[3] * v[3] + c[4] * v[4];
}
function goalsFrom(c) { return c[1] + c[3]; }

function eraLabel(fromYear) {
  var rows = SC.rows;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === fromYear) {
      return i + 1 < rows.length ? fromYear + "–" + (rows[i + 1][0] - 1)
                                 : fromYear + " onwards";
    }
  }
  return String(fromYear);
}
function eraOf(year) {
  if (year <= SC.goals_era_ends) return "Goals era (to " + SC.goals_era_ends + ")";
  var rows = SC.rows, out = eraLabel(rows[0][0]);
  for (var i = 0; i < rows.length; i++) {
    if (year >= rows[i][0]) out = eraLabel(rows[i][0]);
  }
  return out;
}

/* Everything we know about one restatable match. */
function detail(i) {
  var r = ROWS[i], b = BREAK[i], y = +r[F.date].slice(0, 4);
  var tv = valuesFor(S.target);
  var nh = pointsFrom(b.slice(0, 5), tv), na = pointsFrom(b.slice(5), tv);
  var goals = y <= SC.goals_era_ends;
  var eh = goals ? goalsFrom(b.slice(0, 5))
                 : pointsFrom(b.slice(0, 5), valuesFor(y));
  var ea = goals ? goalsFrom(b.slice(5)) : pointsFrom(b.slice(5), valuesFor(y));
  var hs = r[F.home_score], as = r[F.away_score];
  var oldSign = hs === as ? 0 : (hs > as ? 1 : -1);
  var newSign = nh === na ? 0 : (nh > na ? 1 : -1);
  return {
    i: i, r: r, b: b, year: y, goals: goals,
    hs: hs, as: as, nh: nh, na: na, eh: eh, ea: ea,
    reconciles: (eh === hs && ea === as),
    flips: oldSign !== newSign,
    swing: Math.abs((nh - na) - (hs - as))
  };
}

var ALL = Object.keys(BREAK).map(Number).sort(function (a, b) { return a - b; });
var view = [];

// ------------------------------------------------------------------ render
var COLS = [
  { l: "Date", c: "date" }, { l: "Home", c: "" }, { l: "As played", c: "score" },
  { l: "Away", c: "" }, { l: "Restated", c: "score" }, { l: "Swing", c: "num" },
  { l: "Home T·C·P·DG·PT", c: "bd" }, { l: "Away T·C·P·DG·PT", c: "bd" },
  { l: "Era", c: "" }, { l: "Adds up?", c: "" }
];
var GRID = "100px minmax(90px,1fr) 78px minmax(90px,1fr) 96px 62px 124px 124px " +
           "minmax(94px,0.9fr) 86px";
var ROW_H = 30;

function build() {
  var t0 = performance.now();
  var ti = S.team ? TEAMS.indexOf(S.team) : -1;
  view = [];
  var flips = 0, bad = 0, biggest = null, restated = 0;
  for (var k = 0; k < ALL.length; k++) {
    var d = detail(ALL[k]);
    if (d.flips) flips++;
    if (!d.reconciles) bad++;
    if (!biggest || d.swing > biggest.swing) biggest = d;
    restated++;
    if (ti >= 0 && d.r[F.home] !== ti && d.r[F.away] !== ti) continue;
    if (S.show === "flip" && !d.flips) continue;
    if (S.show === "bad" && d.reconciles) continue;
    view.push(d);
  }

  var tv = valuesFor(S.target);
  document.getElementById("sccards").innerHTML =
    tile("Matches that can be restated", num(restated),
         (100 * restated / SC.total_matches).toFixed(1) + "% of the archive — " +
         "the rest record no try/kick breakdown") +
    tile("Results that CHANGE", num(flips),
         "the winner is different under " + eraLabel(S.target) + " values") +
    tile("Biggest swing in margin", biggest ? biggest.swing + " points" : "–",
         biggest ? TEAMS[biggest.r[F.home]] + " " + biggest.hs + "–" +
           biggest.as + " " + TEAMS[biggest.r[F.away]] + "  →  " + biggest.nh +
           "–" + biggest.na + " · " + fmtDate(biggest.r[F.date]) : "") +
    tile("Scores that don't add up", num(bad),
         "the recorded score disagrees with its own era's arithmetic") +
    tile("Target system", eraLabel(S.target),
         "try " + tv[0] + " · conversion +" + tv[1] + " · penalty " + tv[2] +
         " · drop goal " + tv[3] + " · penalty try " + tv[4]);

  document.getElementById("rowcount").textContent = num(view.length);
  document.getElementById("empty").hidden = view.length > 0;
  var head = document.getElementById("tablehead");
  head.style.gridTemplateColumns = GRID;
  head.innerHTML = COLS.map(function (c) {
    return '<div class="' + c.c + '">' + c.l + "</div>";
  }).join("");
  document.getElementById("tablespacer").style.height =
    (view.length * ROW_H) + "px";
  paint();
  document.getElementById("perf").textContent =
    (performance.now() - t0).toFixed(1) + " ms";
  writeHash();
}

function tile(label, big, sub) {
  return '<div class="card"><div class="card-label">' + esc(label) +
    '</div><div class="big small">' + esc(big) + '</div><div class="sub">' +
    esc(sub || "") + "</div></div>";
}

function paint() {
  var wrap = document.getElementById("tablewrap");
  var body = document.getElementById("tablebody");
  var first = Math.max(0, Math.floor(wrap.scrollTop / ROW_H) - 6);
  var last = Math.min(view.length,
                      first + Math.ceil(wrap.clientHeight / ROW_H) + 12);
  var out = "";
  for (var k = first; k < last; k++) {
    var d = view[k], r = d.r;
    out += '<div class="trow' + (d.flips ? " flip" : "") +
      '" style="grid-template-columns:' + GRID + '">' +
      '<div class="date">' + fmtDate(r[F.date]) + "</div>" +
      '<div title="' + esc(TEAMS[r[F.home]]) + '">' + esc(TEAMS[r[F.home]]) + "</div>" +
      '<div class="score">' + d.hs + "–" + d.as + "</div>" +
      '<div title="' + esc(TEAMS[r[F.away]]) + '">' + esc(TEAMS[r[F.away]]) + "</div>" +
      '<div class="score restated">' + d.nh + "–" + d.na +
        (d.flips ? '<span class="flipmark" title="the winner changes">⇄</span>'
                 : "") + "</div>" +
      '<div class="num">' + (d.swing || "–") + "</div>" +
      '<div class="bd">' + d.b.slice(0, 5).join("/") + "</div>" +
      '<div class="bd">' + d.b.slice(5).join("/") + "</div>" +
      "<div>" + esc(eraOf(d.year)) + "</div>" +
      "<div>" + (d.reconciles
        ? '<span class="ok">yes</span>'
        : '<span class="no" title="' + (d.goals
            ? "goals = conversions + drop goals"
            : "under the " + d.year + " system") + '">' +
          d.eh + "–" + d.ea + " ✕</span>") + "</div>" +
      "</div>";
  }
  body.style.transform = "translateY(" + (first * ROW_H) + "px)";
  body.innerHTML = out;
}

function renderReference() {
  document.getElementById("src").textContent = "from " + SC.source;
  var rows = SC.rows;
  document.getElementById("eratable").innerHTML =
    "<thead><tr><th>Era</th><th>Try</th><th>Conv</th><th>Pen</th>" +
    "<th>DG</th><th>Pen try</th></tr></thead><tbody>" +
    rows.map(function (r, i) {
      return "<tr" + (r[0] === S.target ? ' class="on"' : "") + "><td>" +
        eraLabel(r[0]) + "</td><td>" + r[1] + "</td><td>+" + r[2] + "</td><td>" +
        r[3] + "</td><td>" + r[4] + "</td><td>" + (r[5] || "–") +
        "</td></tr>";
    }).join("") + "</tbody>";
  document.getElementById("goalsnote").textContent = SC.goals_rule;

  var cov = {};
  ALL.forEach(function (i) {
    var e = eraOf(+ROWS[i][F.date].slice(0, 4));
    cov[e] = (cov[e] || 0) + 1;
  });
  var total = {};
  for (var i = 0; i < ROWS.length; i++) {
    var e = eraOf(+ROWS[i][F.date].slice(0, 4));
    total[e] = (total[e] || 0) + 1;
  }
  var order = ["Goals era (to " + SC.goals_era_ends + ")"].concat(
    SC.rows.map(function (r) { return eraLabel(r[0]); }));
  document.getElementById("covtable").innerHTML =
    "<thead><tr><th>Era</th><th>With</th><th>Total</th><th>%</th></tr></thead>" +
    "<tbody>" + order.filter(function (e) { return total[e]; }).map(function (e) {
      var c = cov[e] || 0;
      return "<tr><td>" + e + "</td><td>" + num(c) + "</td><td>" +
        num(total[e]) + "</td><td>" +
        (100 * c / total[e]).toFixed(0) + "%</td></tr>";
    }).join("") + "</tbody>";
}

// -------------------------------------------------------------------- wire
function writeHash() {
  var p = [];
  if (S.target !== SC.rows[SC.rows.length - 1][0]) p.push("target=" + S.target);
  if (S.show !== "all") p.push("show=" + S.show);
  if (S.team) p.push("team=" + encodeURIComponent(S.team));
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
    if (k === "target") S.target = +v;
    else if (k === "show") S.show = v;
    else if (k === "team") S.team = v;
  });
}

function init() {
  document.getElementById("buildinfo").innerHTML =
    num(SC.coverage) + " of " + num(SC.total_matches) +
    " matches carry a full try/kick breakdown<br>scoring systems " +
    esc(SC.source);

  document.getElementById("coverage").innerHTML =
    "<b>Read this before quoting any restated score.</b> Only <b>" +
    num(SC.coverage) + " of the " + num(SC.total_matches) + "</b> matches in " +
    "the archive (" + (100 * SC.coverage / SC.total_matches).toFixed(1) +
    "%) record a full breakdown for both sides, so only those can be " +
    "restated. Every other match appears here not at all. This is a " +
    "limitation of the source data, not of the method — fill in the " +
    "tries/conversions/penalties/drop goals columns in the spreadsheet and " +
    "those matches will appear here on the next Update Archive.";

  document.getElementById("f-target").innerHTML = SC.rows.slice().reverse()
    .map(function (r) {
      return '<option value="' + r[0] + '">' + eraLabel(r[0]) +
        " — try " + r[1] + "</option>";
    }).join("");

  var teams = {};
  ALL.forEach(function (i) {
    teams[TEAMS[ROWS[i][F.home]]] = 1; teams[TEAMS[ROWS[i][F.away]]] = 1;
  });
  document.getElementById("f-team").innerHTML =
    '<option value="">Any team</option>' +
    Object.keys(teams).sort().map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(t) + "</option>";
    }).join("");

  readHash();
  document.getElementById("f-target").value = S.target;
  document.getElementById("f-team").value = S.team;
  [].forEach.call(document.getElementById("f-show").children, function (c) {
    c.classList.toggle("on", c.dataset.v === S.show);
  });

  document.getElementById("f-target").addEventListener("change", function () {
    S.target = +this.value; renderReference(); build();
  });
  document.getElementById("f-team").addEventListener("change", function () {
    S.team = this.value; build();
  });
  document.getElementById("f-show").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    [].forEach.call(this.children, function (c) { c.classList.remove("on"); });
    b.classList.add("on"); S.show = b.dataset.v; build();
  });
  document.getElementById("tablewrap").addEventListener("scroll", paint,
                                                        { passive: true });
  window.addEventListener("resize", paint);
  document.getElementById("export").addEventListener("click", exportCSV);

  renderReference();
  build();
  document.getElementById("loading").hidden = true;
  document.getElementById("app").hidden = false;
  paint();
}

function exportCSV() {
  function q(v) {
    if (v === null || v === undefined) return "";
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  var tv = valuesFor(S.target);
  var out = [
    ["Restated under", eraLabel(S.target)].map(q).join(","),
    ["Values", "try " + tv[0] + ", conversion +" + tv[1] + ", penalty " + tv[2] +
      ", drop goal " + tv[3] + ", penalty try " + tv[4]].map(q).join(","),
    ["Source", SC.source].map(q).join(","),
    "",
    ["Date", "Home", "Away", "Home as played", "Away as played",
     "Home restated", "Away restated", "Swing", "Result changes?",
     "Home tries", "Home conv", "Home pens", "Home drop goals",
     "Home pen tries", "Away tries", "Away conv", "Away pens",
     "Away drop goals", "Away pen tries", "Own-era home", "Own-era away",
     "Adds up?", "Excel row"].map(q).join(",")
  ];
  view.forEach(function (d) {
    out.push([d.r[F.date], TEAMS[d.r[F.home]], TEAMS[d.r[F.away]], d.hs, d.as,
      d.nh, d.na, d.swing, d.flips ? "yes" : "no"]
      .concat(d.b)
      .concat([d.eh, d.ea, d.reconciles ? "yes" : "no", d.r[F.excel_row]])
      .map(q).join(","));
  });
  var blob = new Blob(["﻿" + out.join("\r\n")],
                      { type: "text/csv;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "scores-restated-" + S.target + ".csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

window.__SC = {
  set: function (patch) {
    Object.keys(patch).forEach(function (k) { S[k] = patch[k]; });
    renderReference(); build();
    return view.length;
  },
  summary: function () {
    var flips = 0, bad = 0;
    ALL.forEach(function (i) {
      var d = detail(i);
      if (d.flips) flips++;
      if (!d.reconciles) bad++;
    });
    return { restatable: ALL.length, flips: flips, notReconciling: bad,
             target: S.target, shown: view.length };
  },
  rows: function (n) {
    return view.slice(0, n || 10).map(function (d) {
      return [d.r[F.date], TEAMS[d.r[F.home]], d.hs, d.as, TEAMS[d.r[F.away]],
              d.nh, d.na, d.flips];
    });
  }
};

init();

})();
