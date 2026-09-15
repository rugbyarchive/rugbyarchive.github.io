/* One selection, two views. Charts use the explorer's already-filtered rows. */
(function () {
  'use strict';
  let data, mode='matches', metric='count', grouping=10, rankSource='archive', selected=null, bins=[];
  const $=id=>document.getElementById(id);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>n.toLocaleString('en-GB');
  const toggle=document.createElement('div');
  toggle.className='segbtns sm result-view';toggle.setAttribute('role','group');toggle.setAttribute('aria-label','Results view');
  toggle.innerHTML='<button type="button" data-result-view="matches" aria-pressed="true" class="on">Matches</button><button type="button" data-result-view="charts" aria-pressed="false">Charts</button>';
  document.querySelector('.tablebar .count').after(toggle);
  const panel=document.createElement('section');panel.id='filter-charts';panel.hidden=true;panel.setAttribute('aria-label','Charts for the current filters');
  panel.innerHTML=`<p id="chart-summary" class="chart-summary"></p>
    <div class="chart-controls"><label>Show<select id="chart-metric"><option value="count">Matches played</option><option value="wins">Win percentage</option><option value="points">Points for &amp; against</option><option value="results">Wins, draws &amp; losses</option><option value="margin">Average winning / losing margin</option><option value="close">Close matches (7 points or fewer)</option><option value="strength">Opponent strength</option></select></label><label>Group by<select id="chart-group"><option value="10">Decade</option><option value="1">Year</option></select></label><label id="chart-source-control" hidden>Ranking source<select id="chart-source"><option value="archive">Archive reconstruction</option><option value="world">World Rugby published</option></select></label></div>
    <p id="chart-perspective" class="chart-note"></p><h2 id="chart-title"></h2><div id="chart-legend" class="chart-legend"></div>
    <div id="chart-canvas"></div><p id="chart-empty" hidden>No matches fit these filters. Loosen a filter to draw a chart.</p>
    <div id="chart-inspect"><label>Inspect a period<select id="chart-period" aria-label="Inspect a chart period"></select></label><div id="chart-detail" aria-live="polite"></div><button type="button" id="chart-matches" class="ghostbtn" hidden></button></div>
    <details class="quiet-detail chart-help"><summary>How to read this chart</summary><p>Charts use exactly the matches in your current filters and scores as played. Win percentage is wins divided by all matches, including draws. Points are averages per match, from the selected team's perspective. Periods with no matches have no win rate or scoring average; faint dotted connections bridge these gaps without inventing results. Winning and losing margins are separate averages, excluding draws. Close matches include draws and all results decided by seven points or fewer. Opponent strength averages known opponent positions per match; unknown ranks are excluded. Rank 1 is strongest. Published ranks are saved tables for the match date, not necessarily verified pre-kickoff positions; archive ranks are reconstructed before the match and include idle sides. Partial years and decades include only the recorded matches in your selection. A small match count can produce a volatile percentage. Select a bar, a point or a period below to inspect the numbers and open its matches.</p></details>`;
  document.querySelector('.matchtable').after(panel);
  function setMode(next) {
    mode=next;document.querySelector('.results').classList.toggle('charts-mode',mode==='charts');panel.hidden=mode!=='charts';
    toggle.querySelectorAll('button').forEach(b=>{const on=b.dataset.resultView===mode;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
    if(mode==='charts')draw();else requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  }
  toggle.addEventListener('click',e=>{if(e.target.dataset.resultView)setMode(e.target.dataset.resultView);});
  $('chart-metric').addEventListener('change',e=>{metric=e.target.value;draw();});
  $('chart-source').addEventListener('change',e=>{rankSource=e.target.value;draw();});
  $('chart-group').addEventListener('change',e=>{grouping=+e.target.value;selected=null;draw();});
  $('chart-period').addEventListener('change',e=>{selected=e.target.value===''?null:+e.target.value;detail();});
  $('chart-canvas').addEventListener('click',e=>{const t=e.target.closest('[data-bin]');if(t){selected=+t.dataset.bin;$('chart-period').value=selected;detail();}});
  $('chart-matches').addEventListener('click',()=>{
    const bin=bins[selected];if(!bin||!bin.n)return;
    const from=Math.max(bin.year,data.from||bin.year),to=Math.min(bin.year+grouping-1,data.to||bin.year+grouping-1);
    setMode('matches');data.open(from,to);toggle.querySelector('[data-result-view="matches"]').focus();
  });
  function detail() {
    const b=bins[selected];$('chart-matches').hidden=!b||!b.n;
    if(!b){$('chart-detail').textContent='Select a period to see its figures.';return;}
    let text=`${b.label} · ${fmt(b.n)} ${b.n===1?'match':'matches'}`;
    if(data.team&&b.n&&metric==='count')text+=` · ${b.w} W / ${b.d} D / ${b.l} L · ${(100*b.w/b.n).toFixed(1)}% wins · ${(b.pf/b.n).toFixed(1)} for / ${(b.pa/b.n).toFixed(1)} against per match`;
    if(b.n&&metric!=='count')text+=' · '+figures(b);
    $('chart-detail').textContent=text;
    $('chart-matches').textContent=`View ${fmt(b.n)} ${b.n===1?'match':'matches'} →`;
  }
  function empty(year){return {year,n:0,w:0,d:0,l:0,pf:0,pa:0,wm:0,lm:0,close:0,rank:0,rn:0};}
  function value(b,key){const den=key==='wm'?b.w:key==='lm'?b.l:key==='rank'?b.rn:b.n;return den?b[key]/den*(['w','close'].includes(key)?100:1):null;}
  function figures(b){
    const avg=key=>value(b,key)===null?'unavailable':value(b,key).toFixed(1);
    if(metric==='margin')return `Winning margin ${avg('wm')} (${b.w} wins) / losing margin ${avg('lm')} (${b.l} losses)`;
    if(metric==='close')return `${b.close} close matches / ${b.n} played · ${avg('close')}%`;
    if(metric==='strength')return `Average opponent rank ${avg('rank')} · ${b.rn} ranked / ${b.n} matches; ${b.n-b.rn} unknown`;
    if(metric==='results')return `${b.w} wins / ${b.d} draws / ${b.l} losses`;
    if(metric==='wins')return avg('w')+'% wins';
    if(metric==='points')return avg('pf')+' for / '+avg('pa')+' against per match';
    return b.n+' played';
  }
  function draw() {
    if(!data)return;
    if(!data.team&&metric!=='count')metric='count';
    $('chart-metric').value=metric;
    [...$('chart-metric').options].forEach(o=>o.disabled=o.value!=='count'&&!data.team);
    const a=data.stats;
    $('chart-summary').textContent=(data.team?data.team+' · ':'Current selection · ')+fmt(a.played)+' played'+(data.team?` · ${fmt(a.won)} W / ${fmt(a.drawn)} D / ${fmt(a.lost)} L · ${a.played?(100*a.won/a.played).toFixed(1)+'% wins':'Win rate unavailable'}`:'');
    $('chart-source-control').hidden=metric!=='strength';
    $('chart-perspective').textContent=data.team?'From '+data.team+'’s perspective · current filters · scores as played':'Select a team in the filters to unlock results, scoring and opponent-strength charts.';
    $('chart-title').textContent={count:'Matches played',wins:'Win percentage',points:'Average points per match',results:'Wins, draws & losses',margin:'Average winning / losing margin',close:'Close matches (% decided by 7 points or fewer)',strength:'Average opponent rank (lower is stronger)'}[metric]+' by '+(grouping===10?'decade':'year');
    const series=metric==='points'?[['pf','Points for','for'],['pa','Points against','against']]:metric==='margin'?[['wm','Winning margin','for'],['lm','Losing margin','against']]:metric==='strength'?[['rank','Average opponent rank','for']]:[[metric==='close'?'close':'w',metric==='close'?'Close matches':'Win percentage','for']];
    $('chart-legend').innerHTML=(metric==='results'?[['','Wins','won'],['','Draws','drawn'],['','Losses','against']]:['count'].includes(metric)?[]:series).map(v=>`<span><i class="chart-key ${v[2]}"></i>${v[1]}</span>`).join('');
    bins=[];const by=new Map();
    data.rows.forEach(r=>{const year=Math.floor(+r.date.slice(0,4)/grouping)*grouping;let b=by.get(year);if(!b){b=empty(year);by.set(year,b);}b.n++;b.pf+=r.pf;b.pa+=r.pa;const diff=r.pf-r.pa;if(diff>0){b.w++;b.wm+=diff;}else if(diff<0){b.l++;b.lm-=diff;}else b.d++;if(Math.abs(diff)<=7)b.close++;const rank=r[rankSource+'Rank'];if(Number.isFinite(rank)&&rank>0){b.rank+=rank;b.rn++;}});
    const years=[...by.keys()].sort((a,b)=>a-b);
    if(years.length)for(let year=years[0];year<=years.at(-1);year+=grouping)bins.push({...by.get(year)||empty(year),label:grouping===10?year+'s':String(year)});
    const noRanks=metric==='strength'&&bins.length&&!bins.some(b=>b.rn);
    $('chart-empty').textContent=noRanks?'No known opponent ranks for this source in the current selection. Try the other ranking source or a later period.':'No matches fit these filters. Loosen a filter to draw a chart.';
    $('chart-empty').hidden=!!bins.length&&!noRanks;$('chart-inspect').hidden=!bins.length;
    $('chart-period').innerHTML='<option value="">Choose a '+(grouping===10?'decade':'year')+'</option>'+bins.map((b,i)=>`<option value="${i}">${b.label} · ${b.n} matches</option>`).join('');
    if(selected!==null&&selected>=bins.length)selected=null;
    $('chart-period').value=selected===null?'':selected;detail();
    if(!bins.length){$('chart-canvas').innerHTML='';return;}
    const W=Math.max(320,Math.round(panel.clientWidth-32)),H=300,L=48,R=14,T=16,B=36,pw=W-L-R,ph=H-T-B;
    const percent=metric==='wins'||metric==='close', bars=metric==='count'||metric==='results';
    let max=percent?100:Math.max(1,...bins.flatMap(b=>bars?[b.n]:series.map(v=>value(b,v[0])||0)));
    const step=percent?25:Math.max(1,Math.ceil(max/4));max=percent?100:step*4+(metric==='strength'?1:0);
    const floor=metric==='strength'?1:0;
    const x=i=>L+(i+.5)*pw/bins.length,y=v=>metric==='strength'?T+(v-floor)/(max-floor)*ph:T+ph-v/max*ph;
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="chart-svg-title chart-svg-desc"><title id="chart-svg-title">${escape($('chart-title').textContent)}</title><desc id="chart-svg-desc">${escape($('chart-summary').textContent)}. Exact figures are available using Inspect a period below.</desc>`;
    for(let j=0;j<=4;j++){let v=metric==='strength'?(1+(max-1)*j/4):max*j/4;svg+=`<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-axis" x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}${percent?'%':''}</text>`;}
    const stride=Math.max(1,Math.ceil(bins.length/Math.max(2,Math.floor(pw/65))));
    bins.forEach((b,i)=>{if(i%stride===0)svg+=`<text class="chart-axis" x="${x(i)}" y="${H-10}" text-anchor="middle">${b.year}${grouping===10?'s':''}</text>`;});
    if(bars)bins.forEach((b,i)=>{let base=0;for(const [key,cls] of metric==='results'?[['w','won'],['d','drawn'],['l','against']]:[['n','for']]){svg+=`<rect class="chart-bar ${cls}" x="${x(i)-pw/bins.length*.34}" y="${y(base+b[key])}" width="${pw/bins.length*.68}" height="${ph*b[key]/max}"/>`;base+=b[key];}});
    else {
      let gaps=false;
      for(const [key,label,cls] of series) {
        let d='',bridge='',prev=null;
        bins.forEach((b,i)=>{const v=value(b,key);if(v===null)return;const point=x(i)+','+y(v);if(prev&&i===prev.i+1)d+=' L'+point;else {d+=' M'+point;if(prev){bridge+=' M'+prev.point+' L'+point;gaps=true;}}prev={i,point};});
        svg+=`<path class="chart-line ${cls}" d="${d}"/><path class="chart-line chart-gap ${cls}" d="${bridge}"/>`;
        bins.forEach((b,i)=>{const v=value(b,key);if(v!==null)svg+=`<circle class="chart-dot ${cls}" cx="${x(i)}" cy="${y(v)}" r="2.7"/>`;});
      }
      if(gaps)$('chart-legend').innerHTML+='<span><i class="chart-key gap"></i>Dotted: no data for this series in intervening periods</span>';
      if(metric==='strength')$('chart-legend').innerHTML+='<span>'+ (rankSource==='archive'?'Reconstructed pre-match ranks; includes idle sides':'Published match-date tables; may precede kickoff')+' · unknown ranks excluded</span>';
    }
    bins.forEach((b,i)=>{svg+=`<rect class="chart-hit" data-bin="${i}" x="${L+i*pw/bins.length}" y="${T}" width="${pw/bins.length}" height="${ph}"><title>${b.label}: ${b.n} matches${b.n?', '+escape(figures(b)):''}</title></rect>`;});
    $('chart-canvas').innerHTML=svg+'</svg>';
  }
  new ResizeObserver(()=>{if(mode==='charts')draw();}).observe(panel);
  window.FilterCharts={render(payload){data=payload;selected=null;if(mode==='charts')draw();},matches(){setMode('matches');}};
})();
