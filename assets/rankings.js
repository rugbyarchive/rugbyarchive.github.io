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

/* Teams that rank in THIS archive but not with World Rugby. The owner's
   rankings deliberately include every side that fields a national team, so a
   reader has to be able to see which positions are his and which are
   orthodox. Badged in the table, and nowhere else - the Super Filter stays
   clean, which is what he asked for. */
var OWN = {};
(D.own_inclusion || []).forEach(function (i) { OWN[i] = 1; });
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
var S = { source: "archive", unit: "day", cursor: null, mode: "official", lions: "0", compare: "", find: "", dormant: "show",
          day: DAY_LAST, sort: "rank", dir: 1 };
var DORMANT_DAYS = 365 * 4;   // no match in four years

function setKey(mode, lions) {
  return mode + (lions === "1" || lions === true ? "" : "_no_lions");
}

/* Walk one rule set's recording up to and including `day`.
   Returns ratings, when each team last moved, and how many counted matches
   each team had played by then. */
function tableAt(key, day, limit) {
  var set = SETS[key], rows = set.rows, r = set.r;
  var rating = {}, last = {}, played = {}, counted = 0;
  for (var k = 0; k < rows.length; k++) {
    var m = M[rows[k]];
    if (m[0] > day || (limit !== undefined && k > limit)) break;
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
  { key: "move",   label: "12m rank",     cls: "num" },
  { key: "team",   label: "Team",         cls: "" },
  { key: "rating", label: "Rating",       cls: "num" },
  { key: "impact", label: "Matchday Δ pts", cls: "num" },
  { key: "rankImpact", label: "Δ rank", cls: "num" },
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
  var base = S.source === "world" ? COLS.filter(function(c){return c.key !== 'played' && c.key !== 'last';}).map(function(c){return c.key === 'impact' ? {key:c.key,label:'Update Δ pts',cls:'num'} : c;}) : COLS;
  return S.compare && S.source !== 'world' ? base.concat(CMP_COLS) : base;
}

function drawHead() {
  var c = cols();
  var width = c.reduce(function(n,x){return n+(x.key==='team'?150:x.key==='last'||x.key==='impact'?112:76);},0);
  headEl.style.minWidth = wrap.style.minWidth = width+'px';
  headEl.style.gridTemplateColumns = gridCols();
  headEl.innerHTML = c.map(function (x) {
    var on = S.sort === x.key;
    return '<button type="button" aria-label="Sort by ' + x.label + '" data-key="' + x.key + '" class="' + x.cls +
      (on ? " sorted" : "") + '">' + x.label +
      (on ? ' <span class="arrow">' + (S.dir > 0 ? "▲" : "▼") + "</span>" : "") +
      "</button>";
  }).join("");
}

function gridCols() {
  return cols().map(function(c){return c.key === 'team' ? 'minmax(150px,1fr)' : c.key === 'last' ? '112px' : c.key === 'impact' ? '112px' : '76px';}).join(' ');
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
      esc(x.name) + " match in the Super Filter\">" + esc(x.name) + "</a>" +
      (S.source !== 'world' && OWN[x.id] ? '<span class="ownflag" title="Ranked here but not a World '
        + 'Rugby member union - this position exists in this archive only">'
        + "\u2022</span>" : "") + "</div>" +
    '<div class="num rating">' + x.rating.toFixed(2) + "</div>" +
    '<div class="num ' + (x.impact > 0 ? 'up' : x.impact < 0 ? 'down' : '') + '">' +
      (x.impact === null ? 'new' : (x.impact > 0 ? '+' : '') + x.impact.toFixed(2)) + '</div>' +
    '<div class="num">' + movement(x.rankImpact) + '</div>' +
    '<div class="num ' + (x.chg > 0 ? "up" : (x.chg < 0 ? "down" : "")) + '">' +
      (x.chg === null ? "–" : (x.chg > 0 ? "+" : "") + x.chg.toFixed(2)) +
      "</div>";
  if (S.source !== 'world') h += '<div class="num">' + x.played + "</div>" +
    '<div class="lastp' + (x.dormant ? " dormant" : "") + '">' +
      shortDate(x.last) + (x.dormant ? ' <span class="tag">idle</span>' : "") +
      "</div>";
  if (S.compare && S.source !== 'world') {
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
var CHANGES = {};
function lastImpact(key,limit){
  if(!CHANGES[key]){
    var set=SETS[key],rating={},changed=[];
    set.rows.forEach(function(index,k){var m=M[index],h=m[1],a=m[2],hr=set.r[2*k],ar=set.r[2*k+1];
      if(rating[h]===undefined||rating[a]===undefined||Math.abs(rating[h]-hr)>1e-9||Math.abs(rating[a]-ar)>1e-9)changed.push(k);
      rating[h]=hr;rating[a]=ar;
    });CHANGES[key]=changed;
  }
  var found=-1;for(var i=0;i<CHANGES[key].length&&CHANGES[key][i]<=limit;i++)found=CHANGES[key][i];return found;
}

function refresh() {
  if (S.source === 'world') { refreshOfficial(); return; }
  var t0 = performance.now();
  var key = setKey(S.mode, S.lions);
  var now = tableAt(key, S.day, S.cursor === null ? undefined : S.cursor);
  var lastIndex = lastImpact(key,now.cursor-1), dayStart = lastIndex;
  while (dayStart > 0 && M[SETS[key].rows[dayStart-1]][0] === M[SETS[key].rows[lastIndex]][0]) dayStart--;
  var beforeDay = tableAt(key, S.day, dayStart-1);
  var yearAgo = tableAt(key, S.day - 365);
  var cmp = S.compare ? tableAt(S.compare, S.day) : null;
  lastNow = now;

  rows = now.order.map(function (t) {
    var wasPos = yearAgo.pos[t], wasRating = yearAgo.rating[t];
    return {
      id: t, name: nameAt(t, S.day), rank: now.pos[t], rating: now.rating[t],
      move: wasPos === undefined ? null : wasPos - now.pos[t],
      chg: wasRating === undefined ? null : now.rating[t] - wasRating,
      impact: beforeDay.rating[t] === undefined ? null : now.rating[t] - beforeDay.rating[t],
      rankImpact: beforeDay.pos[t] === undefined ? null : beforeDay.pos[t] - now.pos[t],
      played: now.played[t] || 0, last: now.last[t],
      dormant: (S.day - now.last[t]) > DORMANT_DAYS,
      cpos: cmp ? (cmp.pos[t] === undefined ? null : cmp.pos[t]) : null,
      cdiff: cmp ? (cmp.pos[t] === undefined ? null : now.pos[t] - cmp.pos[t])
                 : null
    };
  });

  if (S.dormant === "hide") {
    rows = rows.filter(function (x) { return !x.dormant; });
  }
  if (S.find) {
    var q = S.find.toLowerCase();
    rows = rows.filter(function (x) {
      return x.name.toLowerCase().indexOf(q) !== -1;
    });
  }
  sortRows();

  // ---- headline cards
  var top1 = now.order.length ? rows0(now, now.order[0]) : null;
  if (top1) {
    setText("k-no1", nameAt(top1.team, S.day));
    setText("k-no1-sub", top1.rating.toFixed(2) + " points" + (S.cursor !== null ? ' · after the selected step' :
      (top1.since !== null
        ? " · top of the table since " + shortDate(top1.since) + " (" +
          Math.round(top1.days / 365.25 * 10) / 10 + " years)"
        : " · highest-rated side still active on this date; another team is "
          + "rated higher but has not played in four years")));
  } else {
    setText("k-no1", "—");
    setText("k-no1-sub", "no matches played yet");
  }
  setText("k-teams", now.order.length.toLocaleString("en-GB"));
  setText("k-teams-sub", "ranked by the archive under these rules");
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

  var rec = lastIndex >= 0 ? SETS[key].rows.slice(dayStart,lastIndex+1).map(function(i){return M[i];}) : [];
  setText('recent-label', 'Latest matchday to change ratings' + (rec.length ? ' · ' + shortDate(rec[0][0]) : ''));
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
    'Archive reconstruction using ' + (S.mode === 'official' ? 'World Rugby points-exchange rules' : 'the legacy model') +
    '. Matchday Δ is the cumulative change on the latest matchday to affect ratings, up to this step. Matches follow archive order; kickoff order may be unknown.';
  syncTimeline(now.cursor-1);

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
    impact: function (x) { return x.impact === null ? -1e9 : x.impact; },
    rankImpact: function (x) { return x.rankImpact === null ? -1e9 : x.rankImpact; },
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

// Official snapshots retain their published positions, including tie ordering.
var WR = (D.official || {}).snapshots || [], WR_EVENTS = [];
WR.forEach(function(s){
  if (!WR_EVENTS.length || JSON.stringify(s[1]) !== JSON.stringify(WR_EVENTS[WR_EVENTS.length-1][1])) WR_EVENTS.push(s);
});
function officialAt(day) {
  var out={rating:{},pos:{},order:[],last:{},played:{},counted:0,snapshot:null}, snap=null;
  for(var i=0;i<WR.length;i++){if(WR[i][0]>day)break;snap=WR[i];}
  if(!snap)return out;
  out.snapshot=snap[0];
  for(var j=0;j<snap[1].length;j+=3){var t=snap[1][j];out.order.push(t);out.pos[t]=snap[1][j+1];out.rating[t]=snap[1][j+2];}
  return out;
}
function eventDays(){
  if(S.source==='world')return S.unit==='snapshot'?WR_EVENTS.map(function(s){return s[0];}):M.filter(function(m){return m[0]>=isoToDay('2003-10-06');}).map(function(m){return m[0];});
  return SETS[setKey(S.mode,S.lions)].rows.map(function(i){return M[i][0];});
}
function officialIndex(){var i=-1;while(i+1<WR_EVENTS.length&&WR_EVENTS[i+1][0]<=S.day)i++;return i;}
function selectedIndex(){var days=eventDays(),i=-1;while(i+1<days.length&&days[i+1]<=S.day)i++;return S.cursor===null?i:S.cursor;}
function bounds(){return S.source==='world'?[isoToDay('2003-10-06'),WR.length?WR[WR.length-1][0]:isoToDay('2003-10-06')]:[DAY_FIRST,DAY_LAST];}
function syncTimeline(index){
  var days=eventDays(), official=S.source==='world', first=index;
  while(first>0&&days[first-1]===days[index])first--;
  var n=days.filter(function(d){return d===S.day;}).length;
  setText('step-status', official&&S.unit==='snapshot'?'Latest changed snapshot: '+(index>=0?shortDate(days[index]):'none')+' · 1× = 5 seconds per update':
    (S.unit==='match'&&index>=0?'After match '+(index-first+1)+' of '+n+' · archive order':'After the matchday')+(official?' · Published ratings may stay unchanged':'')+' · 1× = 5 seconds per step');
  document.getElementById('previous').disabled=index<=0;
  document.getElementById('next').disabled=index>=days.length-1;
  document.getElementById('play').disabled=!days.length;
  document.querySelector('.asat-label').textContent=official?'World Rugby snapshot available by':'Archive rankings after counted matches on';
  setText('buildinfo',official?'Official snapshots · October 2003 to '+shortDate(bounds()[1]):'Archive reconstruction · 1871 to '+shortDate(DAY_LAST));
}
function sourceControls(){
  var official=S.source==='world',b=bounds();
  ['f-mode','f-lions','f-dormant','f-compare'].forEach(function(id){document.getElementById(id).closest('.rule').hidden=official;});
  var unit=document.getElementById('step-unit');
  unit.innerHTML=(official?'<option value="snapshot">Published update</option>':'')+'<option value="day">Matchday</option><option value="match">One match</option>';
  unit.value=S.unit;
  ['datebox','slider'].forEach(function(id){var el=document.getElementById(id);el.min=id==='datebox'?dayToISO(b[0]):b[0];el.max=id==='datebox'?dayToISO(b[1]):b[1];});
  document.getElementById('sliderticks').innerHTML='';
  document.querySelectorAll('#jumps button').forEach(function(el){el.hidden=isoToDay(el.dataset.d)<b[0];});
}
function refreshOfficial(){
  var now=officialAt(S.day),year=officialAt(S.day-365),idx=officialIndex(),prev=officialAt(idx>0?WR_EVENTS[idx-1][0]:isoToDay('2003-10-06')-1);
  lastNow=now;
  rows=now.order.map(function(t){return {id:t,name:nameAt(t,S.day),rank:now.pos[t],rating:now.rating[t],move:year.pos[t]===undefined?null:year.pos[t]-now.pos[t],chg:year.rating[t]===undefined?null:now.rating[t]-year.rating[t],impact:prev.rating[t]===undefined?null:now.rating[t]-prev.rating[t],rankImpact:prev.pos[t]===undefined?null:prev.pos[t]-now.pos[t]};});
  if(S.find)rows=rows.filter(function(r){return r.name.toLowerCase().includes(S.find.toLowerCase());});
  if(!cols().some(function(c){return c.key===S.sort;})){S.sort='rank';S.dir=1;}
  sortRows();
  var top=now.order[0];setText('k-no1',top===undefined?'—':nameAt(top,S.day));setText('k-no1-sub',top===undefined?'No source table available':now.rating[top].toFixed(2)+' published rating points');
  setText('k-teams',now.order.length);setText('k-teams-sub','in World Rugby’s published table');setText('k-matches','—');setText('k-matches-sub','Published snapshots do not contain match counts');
  var changes=rows.filter(function(r){return r.move!==null;}).sort(function(a,b){return b.move-a.move;}),up=changes[0],dn=changes[changes.length-1];
  setText('k-climb',up&&up.move>0?up.name:'—');setText('k-climb-sub',up&&up.move>0?'Up '+up.move+' places over 12 months':'');setText('k-fall',dn&&dn.move<0?dn.name:'—');setText('k-fall-sub',dn&&dn.move<0?'Down '+(-dn.move)+' places over 12 months':'');
  var start=idx>0?WR_EVENTS[idx-1][0]:Infinity,end=idx>=0?WR_EVENTS[idx][0]:-Infinity;
  var rec=SETS.official_no_lions.rows.map(function(i){return M[i];}).filter(function(m){return m[0]>start&&m[0]<=end;});
  setText('recent-label','Archive matches in this update window');
  document.getElementById('k-recent').innerHTML=rec.map(function(m){return '<li><span>'+shortDate(m[0])+'</span> '+esc(nameAt(m[1],m[0]))+' <b>'+m[3]+'–'+m[4]+'</b> '+esc(nameAt(m[2],m[0]))+'</li>';}).join('')+
    '<li class="dnote">Archive context, not verified attribution of World Rugby’s exchange. Other matches or corrections may contribute.</li>';
  setText('rowcount',rows.length);setText('asat-date',pretty(S.day));document.getElementById('datebox').value=dayToISO(S.day);document.getElementById('slider').value=S.day;
  setText('rulenote','World Rugby’s actual positions and ratings. Latest available snapshot: '+(now.snapshot===null?'none':pretty(now.snapshot))+'. Update Δ compares the latest changed snapshot with its predecessor. No intermediate match ratings are invented.'+((D.official.missing_dates||[]).length?' Weekly backfill is incomplete; the timeline uses saved snapshots.':'')+(now.snapshot!==null&&S.day-now.snapshot>7?' Warning: this snapshot is more than a week older than your selected date.':''));
  syncTimeline(selectedIndex());drawHead();spacer.style.height=rows.length*ROW_H+'px';emptyEl.hidden=!!rows.length;paint();setText('perf','');
}

// ------------------------------------------------------------------- wire
var JUMPS = [
  ["First international", "1871-03-27"],
  ["First official table", "2003-10-06"],
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

var MONTHS_L = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November",
                "December"];

/* "2026-08-11" -> "11 August 2026", built from the string. new Date("...")
   parses an ISO date as UTC midnight and prints the day before for anyone
   west of Greenwich. */
function longDate(iso) {
  var p = String(iso).split("-");
  if (p.length !== 3) return String(iso);
  return String(+p[2]) + " " + MONTHS_L[+p[1] - 1] + " " + p[0];
}

function init() {
  document.getElementById('tmcontext').open = !(window.matchMedia && window.matchMedia('(max-width:1000px)').matches);
  /* The build timestamp said when I last ran the pipeline, which tells a
     reader nothing. How far the replay actually reaches does. */
  document.getElementById("buildinfo").innerHTML =
    "Every rating replayed from 1871<br>complete to " +
    longDate(D.last_match) + " · four rule sets";

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
    stop(); S.cursor=null; S.day = +this.value; refresh();
  });
  document.getElementById("datebox").addEventListener("change", function () {
    if (!this.value) return;
    stop();
    S.cursor=null; S.day = Math.min(bounds()[1], Math.max(bounds()[0], isoToDay(this.value)));
    refresh();
  });
  document.getElementById("today").addEventListener("click", function () {
    stop(); S.cursor=null; S.day = bounds()[1]; refresh();
  });
  document.getElementById("jumps").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    stop();
    [].forEach.call(this.children, function (c) { c.classList.remove("on"); });
    b.classList.add("on");
    S.cursor=null; S.day = Math.min(bounds()[1], Math.max(bounds()[0], isoToDay(b.dataset.d)));
    refresh();
  });

  function seg(id, key, after) {
    var box = document.getElementById(id);
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      [].forEach.call(box.children, function (c) { c.classList.remove("on"); c.setAttribute('aria-pressed',String(c===b)); });
      b.classList.add("on");
      stop(); if(key==='source'||key==='mode'||key==='lions')S.cursor=null;
      S[key] = b.dataset.v;
      if (after) after();
      refresh();
    });
  }
  seg("f-mode", "mode");
  seg('f-source','source',function(){S.unit=S.source==='world'?'snapshot':'day';S.compare='';S.sort='rank';S.dir=1;S.day=Math.max(bounds()[0],Math.min(bounds()[1],S.day));sourceControls();});
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
  document.getElementById('step-unit').addEventListener('change',function(){stop();S.unit=this.value;S.cursor=null;refresh();});
  document.getElementById('previous').addEventListener('click',function(){stop();step(-1);});
  document.getElementById('next').addEventListener('click',function(){stop();step(1);});

  document.addEventListener("keydown", function (e) {
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(e.target.tagName)) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); stop(); step(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stop(); step(1); }
    else if (e.key === " ") { e.preventDefault(); toggle(); }
  });

  sourceControls();refresh();
  document.getElementById("loading").hidden = true;
  document.getElementById("app").hidden = false;
  paint();
}

/* Step to the previous/next date on which the table actually changed, so the
   arrow keys never land on a day where nothing happened. */
function step(dir) {
  var days=eventDays(),i=selectedIndex();if(!days.length)return;
  if((S.source==='world'&&S.unit==='snapshot')||S.unit==='match')i+=dir;
  else if(dir>0){i++;if(i<days.length){var next=days[i];while(i+1<days.length&&days[i+1]===next)i++;}}
  else {var current=i>=0?days[i]:S.day;while(i>=0&&days[i]>=current)i--;}
  i=Math.max(0,Math.min(days.length-1,i));S.cursor=i;S.day=days[i];
  refresh();
}

// -------------------------------------------------------------------- play
var timer = null;
S.speed = "1";
function toggle() { if (timer) stop(); else start(); }
function start() {
  if(!eventDays().length)return;
  if (selectedIndex() >= eventDays().length-1) {S.cursor=0;S.day=eventDays()[0];refresh();}
  document.getElementById("play").textContent = "❚❚ Pause";
  document.getElementById("play").classList.add("on");
  timer = setInterval(function () {
    if(selectedIndex()>=eventDays().length-1){stop();return;}
    step(1);
    if(selectedIndex()>=eventDays().length-1)stop();
  }, 5000 / +S.speed);
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
  var columns = cols(), head = columns.map(function(c){return c.label;});
  function q(v) {
    if (v === null || v === undefined) return "";
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  var out = ["As at," + q(dayToISO(S.day)),
             "Source," + (S.source === 'world' ? 'World Rugby published snapshots' : 'Archive reconstruction'),
             "Rule set," + q(S.source === 'world' ? 'World Rugby published' : SETS[key].label),
             "Step," + q(document.getElementById('step-status').textContent),
             "Idle teams," + q(S.dormant === "hide"
               ? "hidden (no match in four years)" : "shown"),
             "", head.map(q).join(",")];
  rows.forEach(function (x) {
    var line = columns.map(function(c){return c.key==='team'?x.name:c.key==='last'?dayToISO(x.last):x[c.key];});
    out.push(line.map(q).join(","));
  });
  var blob = new Blob(["﻿" + out.join("\r\n")],
                      { type: "text/csv;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "rankings-" + S.source + '-' + dayToISO(S.day) + "-" + key + ".csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

// test hook, same idea as the Super Filter's
window.__TM = {
  set: function (patch) {
    S.cursor=null;
    Object.keys(patch).forEach(function (k) {
      if (k === "date") S.day = isoToDay(patch[k]);
      else S[k] = patch[k];
    });
    sourceControls();refresh();
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
  view: function () { return rows; },
  step: step,
  officialAt: function(iso){return officialAt(isoToDay(iso));},
  top: function (n) {
    return rows.slice(0, n || 10).map(function (x) {
      return [x.rank, x.name, +x.rating.toFixed(2)];
    });
  }
};

init();

})();
