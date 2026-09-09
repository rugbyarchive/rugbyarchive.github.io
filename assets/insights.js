(function () {
  'use strict';
  function esc(x) { return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  window.RugbyInsights = {render:function(D, view, team, analysis, filter) {
    const box=document.getElementById('rank-insights'), content=document.getElementById('insight-content'), streak=document.getElementById('streak-explanation');
    box.hidden=team<0;streak.hidden=team<0;if(team<0)return;
    const F=Object.fromEntries(D.fields.map((k,i)=>[k,i])),R=D.rows,L=D.lookups;
    const list=view.slice().sort((a,b)=>R[a][F.date].localeCompare(R[b][F.date])||R[a][F.seq]-R[b][F.seq]);
    function name(r,side){return L.team_era&&r[F[side+'_as']]!=null?L.team_era[r[F[side+'_as']]]:L.teams[r[F[side]]];}
    function result(r){let h=r[F.home]===team,d=r[F.home_score]-r[F.away_score];return d===0?'D':(h?d>0:d<0)?'W':'L';}
    function rank(i,source){const r=R[i];if(source==='world'&&!r[F.wr_available])return null;const side=r[F.home]===team?'away':'home';const n=r[F[side+(source==='world'?'_wr_rank':'_rank_before')]];return Number.isFinite(n)&&n>0?n:null;}
    function stats(items){let w=0,d=0;items.forEach(i=>{let x=result(R[i]);w+=x==='W';d+=x==='D';});return {p:items.length,w,d,l:items.length-w-d,pct:items.length?(100*w/items.length).toFixed(1)+'%':'—'};}
    function table(items,source){return '<div class="insight-scroll" tabindex="0" aria-label="Matches, scroll for more"><table><thead><tr><th>Date</th><th>Match</th><th>Result</th><th>'+(source?'Opponent rank':'Status')+'</th></tr></thead><tbody>'+items.map(i=>{const r=R[i];return '<tr><td>'+esc(r[F.date])+'</td><td><a href="index.html#match='+encodeURIComponent(r[F.match_id])+'">'+esc(name(r,'home')+' '+r[F.home_score]+'–'+r[F.away_score]+' '+name(r,'away'))+'</a></td><td>'+result(r)+'</td><td>'+(source?'#'+rank(i,source):r[F.full_intl]===1?'Full international':r[F.full_intl]===0?'Not a full international':'Status unknown')+'</td></tr>';}).join('')+'</tbody></table></div>';}
    document.getElementById('insight-team').textContent='— '+L.teams[team];
    let html='<p>Within the current selection, from '+esc(L.teams[team])+ '’s perspective. Win% = wins ÷ all matches, with draws included in the denominator. Ranking #1 is highest; the largest position number is lowest. Unknown ranks are excluded, not treated as the weakest opposition.</p><div class="insight-grid">';
    for(const source of ['archive','world']){
      const known=list.filter(i=>rank(i,source)!==null),ranks=known.map(i=>rank(i,source)),high=ranks.length?Math.min(...ranks):null,low=ranks.length?Math.max(...ranks):null;
      html+='<section><h3>'+(source==='world'?'World Rugby published':'Archive reconstruction')+'</h3><p>'+known.length+' matches with a recorded opponent rank; '+(list.length-known.length)+' unavailable or unranked. '+(source==='world'?'Published table saved for the match date, from October 2003; not necessarily a verified pre-kickoff ranking.':'Reconstructed rank before the match, including idle sides. These stored ranks use the full archive table, rather than the active-only Time Machine view.')+'</p>';
      if(!known.length){html+='<p>No ranked opposition in this selection.</p></section>';continue;}
      for(const [label,value] of [['Highest-ranked opposition',high],['Lowest-ranked opposition',low]]){
        const matches=known.filter(i=>rank(i,source)===value),st=stats(matches);
        html+='<details class="insight-detail"><summary>'+label+': #'+value+' · '+st.p+' matches</summary><p>'+st.w+' wins, '+st.d+' draws, '+st.l+' losses · '+st.pct+' wins. All instances, oldest first.</p>'+table(matches,source)+'</details>';
      }
      html+='<div class="insight-scroll"><table><thead><tr><th>Opposition</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Win%</th></tr></thead><tbody>';
      for(const [label,lo,hi] of [['No. 1',1,1],['No. 2',2,2],['No. 3',3,3],['No. 4',4,4],['No. 5',5,5],['Top 5',1,5],['Top 10',1,10],['11–20',11,20],['21+',21,9999]]){
        const st=stats(known.filter(i=>rank(i,source)>=lo&&rank(i,source)<=hi));
        html+='<tr><td><button type="button" data-rank-source="'+source+'" data-lo="'+lo+'" data-hi="'+hi+'" title="Filter matches against '+label+'">'+label+'</button></td><td>'+st.p+'</td><td>'+st.w+'</td><td>'+st.d+'</td><td>'+st.l+'</td><td>'+st.pct+'</td></tr>';
      }
      html+='</tbody></table></div><p>Choose a ranking band to filter the match explorer. Top 5 and Top 10 overlap; they are not additional matches.</p></section>';
    }
    content.innerHTML=html+'</div>';
    content.onclick=function(e){const b=e.target.closest('[data-rank-source]');if(b)filter(b.dataset.rankSource,+b.dataset.lo,+b.dataset.hi);};
    function longest(items){let best=[],run=[];for(const i of items){if(result(R[i])==='W'){run.push(i);if(run.length>best.length)best=run.slice();}else run=[];}return best;}
    const wins=longest(list),tests=wins.filter(i=>R[i][F.full_intl]===1),nation=wins.filter(i=>R[i][F.match_class]===0),testRun=longest(list.filter(i=>R[i][F.full_intl]===1));
    streak.innerHTML='<div class="card-label">What the winning streak includes</div><p>The '+wins.length+'-match run contains '+tests.length+' full internationals and '+(wins.length-tests.length)+' other or unclassified fixtures; '+nation.length+' are country-versus-country matches. Runs follow the current filters, so omitting fixtures can join wins that were not consecutive in the full record.</p><details class="insight-detail"><summary>Inspect the '+wins.length+' wins</summary>'+table(wins)+'</details><details class="insight-detail"><summary>Full-international-only winning run: '+testRun.length+' matches</summary>'+table(testRun)+'</details><p>The full-international run skips non-Tests. Its classification follows this archive and is not, by itself, certification of a world record.</p>';
  }};
})();
