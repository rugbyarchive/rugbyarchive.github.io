(function () {
  'use strict';
  let source='archive', group='bands';
  const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const count=n=>n+' '+(n===1?'match':'matches');
  function switches(attr,options,current,label){return '<div class="insight-switch" role="group" aria-label="'+label+'">'+options.map(([v,t])=>'<button type="button" '+attr+'="'+v+'" aria-pressed="'+(v===current)+'">'+t+'</button>').join('')+'</div>';}
  window.RugbyInsights={render:function(D,view,team,analysis,filter){
    const box=document.getElementById('rank-insights'),content=document.getElementById('insight-content'),streak=document.getElementById('streak-explanation');
    box.hidden=team<0;streak.hidden=team<0;if(team<0)return;
    const F=Object.fromEntries(D.fields.map((k,i)=>[k,i])),R=D.rows,L=D.lookups;
    const list=view.slice().sort((a,b)=>R[a][F.date].localeCompare(R[b][F.date])||R[a][F.seq]-R[b][F.seq]);
    const result=r=>{const d=r[F.home_score]-r[F.away_score];return d===0?'D':(r[F.home]===team?d>0:d<0)?'W':'L';};
    const name=(r,s)=>L.team_era&&r[F[s+'_as']]!=null?L.team_era[r[F[s+'_as']]]:L.teams[r[F[s]]];
    function rank(i){const r=R[i];if(source==='world'&&!r[F.wr_available])return null;const side=r[F.home]===team?'away':'home',n=r[F[side+(source==='world'?'_wr_rank':'_rank_before')]];return Number.isFinite(n)&&n>0?n:null;}
    function stats(items){let w=0,d=0;items.forEach(i=>{const x=result(R[i]);w+=x==='W';d+=x==='D';});return {p:items.length,w,d,l:items.length-w-d,pct:items.length?(100*w/items.length).toFixed(1)+'%':'—'};}
    function table(items,ranked){if(!items.length)return '<p>No matches in this selection.</p>';return '<div class="insight-scroll" tabindex="0" aria-label="Match list; scroll for more"><table><thead><tr><th>Date</th><th>Match</th><th>Result</th><th>'+(ranked?'Opponent rank':'Status')+'</th></tr></thead><tbody>'+items.map(i=>{const r=R[i];return '<tr><td>'+esc(r[F.date])+'</td><td><a href="index.html#match='+encodeURIComponent(r[F.match_id])+'">'+esc(name(r,'home')+' '+r[F.home_score]+'–'+r[F.away_score]+' '+name(r,'away'))+'</a></td><td>'+result(r)+'</td><td>'+(ranked?'#'+rank(i):r[F.full_intl]===1?'Test':r[F.full_intl]===0?'Non-Test':'Unknown')+'</td></tr>';}).join('')+'</tbody></table></div>';}
    document.getElementById('insight-team').textContent='— '+L.teams[team];
    function renderRanks(){
      const known=list.filter(i=>rank(i)!==null),ranks=known.map(rank),high=Math.min(...ranks),low=Math.max(...ranks);
      let html='<div class="insight-toolbar"><p class="insight-scope">Based on your current filters · <strong>'+esc(L.teams[team])+'</strong></p>'+switches('data-insight-source',[['archive','Reconstructed rankings'],['world','World Rugby rankings']],source,'Rankings to analyse')+'</div><p class="insight-coverage">Opponent rank available for <strong>'+known.length+' of '+list.length+' matches</strong>.</p>';
      if(known.length){
        html+='<div class="rank-extremes">';
        const extremes=high===low?[['All ranked opponents in this selection',high]]:[['Highest-ranked opponent faced',high],['Lowest-ranked opponent faced',low]];
        for(const [label,value] of extremes){const matches=known.filter(i=>rank(i)===value),st=stats(matches);html+='<section class="rank-extreme"><div class="card-label">'+label+'</div><div class="rank-value">No. '+value+' <span>· '+count(st.p)+'</span></div><details class="quiet-detail"><summary>View '+(st.p===1?'match':'matches')+'</summary><p>'+st.w+' wins · '+st.d+' draws · '+st.l+' losses · '+st.pct+' win rate</p>'+table(matches,true)+'</details></section>';}
        html+='</div>'+switches('data-insight-group',[['bands','Ranking bands'],['positions','Individual positions']],group,'Opposition grouping');
        const bands=group==='bands'?[['Top 5',1,5],['Top 10',1,10],['11–20',11,20],['21+',21,9999]]:[1,2,3,4,5].map(n=>['No. '+n,n,n]);
        html+='<div class="insight-scroll rank-summary"><table><thead><tr><th>Opponent rank</th><th>Played</th><th>Won</th><th>Drawn</th><th>Lost</th><th>Win%</th><th><span class="vh">Actions</span></th></tr></thead><tbody>';
        for(const [label,lo,hi] of bands){const st=stats(known.filter(i=>rank(i)>=lo&&rank(i)<=hi));html+='<tr><th scope="row">'+label+'</th><td>'+st.p+'</td><td>'+st.w+'</td><td>'+st.d+'</td><td>'+st.l+'</td><td>'+st.pct+'</td><td><button class="text-action" type="button" data-rank-source="'+source+'" data-lo="'+lo+'" data-hi="'+hi+'" aria-label="Filter matches against '+label+'">Filter matches →</button></td></tr>';}
        html+='</tbody></table></div><p class="insight-footnote">Win% includes draws in matches played.'+(group==='bands'?' Top 5 is included in Top 10.':'')+'</p>';
      }else html+='<p>No ranked opponents in this selection.</p>';
      html+='<details class="quiet-detail"><summary>About these rankings</summary><p>'+(source==='world'?'Published World Rugby tables saved for match dates, from October 2003. They are not necessarily verified pre-kickoff rankings.':'Reconstructed ranks before each match include idle sides. They use the full archive table, rather than the active-only Time Machine view.')+' Unknown or unavailable ranks are excluded. No. 1 is the highest rank; larger numbers mean lower positions.</p></details>';
      content.innerHTML=html;
    }
    renderRanks();
    content.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.insightSource){source=b.dataset.insightSource;renderRanks();content.querySelector('[data-insight-source="'+source+'"]').focus();}else if(b.dataset.insightGroup){group=b.dataset.insightGroup;renderRanks();content.querySelector('[data-insight-group="'+group+'"]').focus();}else if(b.dataset.rankSource)filter(b.dataset.rankSource,+b.dataset.lo,+b.dataset.hi);};
    function longest(items){let best=[],run=[];for(const i of items){if(result(R[i])==='W'){run.push(i);if(run.length>best.length)best=run.slice();}else run=[];}return best;}
    const wins=longest(list),tests=wins.filter(i=>R[i][F.full_intl]===1),testRun=longest(list.filter(i=>R[i][F.full_intl]===1));
    streak.innerHTML='<p class="streak-composition"><strong>'+tests.length+' Tests</strong> · '+(wins.length-tests.length)+' other fixtures</p><details class="quiet-detail streak-matches"><summary>View matches</summary>'+switches('data-streak-scope',[['all','All fixtures'],['tests','Tests only']],'all','Fixtures within this winning run')+'<div id="streak-list">'+table(wins)+'</div><p>These tabs show the same '+count(wins.length)+' winning run. Non-Test or unclassified fixtures appear under All fixtures.</p><details class="quiet-detail"><summary>Longest Test-only winning run: '+count(testRun.length)+'</summary><p>This is calculated separately and may cover different dates.</p>'+table(testRun)+'</details><p>Runs follow your current filters; omitting fixtures can join wins that were not consecutive in the full record. Test-only runs skip non-Tests. Classifications follow this archive and do not certify a world record.</p></details>';
    streak.onclick=e=>{const b=e.target.closest('[data-streak-scope]');if(!b)return;streak.querySelectorAll('[data-streak-scope]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));streak.querySelector('#streak-list').innerHTML=table(b.dataset.streakScope==='tests'?tests:wins);};
  }};
})();
