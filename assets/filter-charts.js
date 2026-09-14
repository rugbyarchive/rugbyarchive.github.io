/* One selection, two views. Charts use the explorer's already-filtered rows. */
(function () {
  'use strict';
  let data, mode='matches', metric='count', grouping=10, selected=null, bins=[];
  const $=id=>document.getElementById(id);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>n.toLocaleString('en-GB');
  const toggle=document.createElement('div');
  toggle.className='segbtns sm result-view';toggle.setAttribute('role','group');toggle.setAttribute('aria-label','Results view');
  toggle.innerHTML='<button type="button" data-result-view="matches" aria-pressed="true" class="on">Matches</button><button type="button" data-result-view="charts" aria-pressed="false">Charts</button>';
  document.querySelector('.tablebar .count').after(toggle);
  const panel=document.createElement('section');panel.id='filter-charts';panel.hidden=true;panel.setAttribute('aria-label','Charts for the current filters');
  panel.innerHTML=`<p id="chart-summary" class="chart-summary"></p>
    <div class="chart-controls"><label>Show<select id="chart-metric"><option value="count">Matches played</option><option value="wins">Win percentage</option><option value="points">Points for &amp; against</option></select></label><label>Group by<select id="chart-group"><option value="10">Decade</option><option value="1">Year</option></select></label></div>
    <p id="chart-perspective" class="chart-note"></p><h2 id="chart-title"></h2><div id="chart-legend" class="chart-legend"></div>
    <div id="chart-canvas"></div><p id="chart-empty" hidden>No matches fit these filters. Loosen a filter to draw a chart.</p>
    <div id="chart-inspect"><label>Inspect a period<select id="chart-period" aria-label="Inspect a chart period"></select></label><div id="chart-detail" aria-live="polite"></div><button type="button" id="chart-matches" class="ghostbtn" hidden></button></div>
    <details class="quiet-detail chart-help"><summary>How to read this chart</summary><p>Charts use exactly the matches in your current filters and scores as played. Win percentage is wins divided by all matches, including draws. Points are averages per match, from the selected team's perspective. Periods with no matches have no win rate or scoring average; gaps are left in the lines. Partial years and decades include only the recorded matches in your selection. A small match count can produce a volatile percentage. Select a bar, a point or a period below to inspect the numbers and open its matches.</p></details>`;
  document.querySelector('.matchtable').after(panel);
  function setMode(next) {
    mode=next;document.querySelector('.results').classList.toggle('charts-mode',mode==='charts');panel.hidden=mode!=='charts';
    toggle.querySelectorAll('button').forEach(b=>{const on=b.dataset.resultView===mode;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
    if(mode==='charts')draw();else requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  }
  toggle.addEventListener('click',e=>{if(e.target.dataset.resultView)setMode(e.target.dataset.resultView);});
  $('chart-metric').addEventListener('change',e=>{metric=e.target.value;draw();});
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
    if(data.team&&b.n)text+=` · ${b.w} W / ${b.d} D / ${b.l} L · ${(100*b.w/b.n).toFixed(1)}% wins · ${(b.pf/b.n).toFixed(1)} for / ${(b.pa/b.n).toFixed(1)} against per match`;
    $('chart-detail').textContent=text;
    $('chart-matches').textContent=`View ${fmt(b.n)} ${b.n===1?'match':'matches'} →`;
  }
  function draw() {
    if(!data)return;
    if(!data.team&&metric!=='count')metric='count';
    $('chart-metric').value=metric;
    [...$('chart-metric').options].forEach(o=>o.disabled=o.value!=='count'&&!data.team);
    const a=data.stats;
    $('chart-summary').textContent=(data.team?data.team+' · ':'Current selection · ')+fmt(a.played)+' played'+(data.team?` · ${fmt(a.won)} W / ${fmt(a.drawn)} D / ${fmt(a.lost)} L · ${a.played?(100*a.won/a.played).toFixed(1)+'% wins':'Win rate unavailable'}`:'');
    $('chart-perspective').textContent=data.team?'From '+data.team+'’s perspective · current filters · scores as played':'Select a team in the filters to unlock win percentage and points for & against.';
    $('chart-title').textContent={count:'Matches played',wins:'Win percentage',points:'Average points per match'}[metric]+' by '+(grouping===10?'decade':'year');
    $('chart-legend').innerHTML=metric==='points'?'<span><i class="chart-key for"></i>Points for</span><span><i class="chart-key against"></i>Points against</span>':'';
    bins=[];const by=new Map();
    data.rows.forEach(r=>{const year=Math.floor(+r.date.slice(0,4)/grouping)*grouping;let b=by.get(year);if(!b){b={year,n:0,w:0,d:0,l:0,pf:0,pa:0};by.set(year,b);}b.n++;b.pf+=r.pf;b.pa+=r.pa;if(r.pf>r.pa)b.w++;else if(r.pf<r.pa)b.l++;else b.d++;});
    const years=[...by.keys()].sort((a,b)=>a-b);
    if(years.length)for(let year=years[0];year<=years.at(-1);year+=grouping)bins.push({...by.get(year)||{year,n:0,w:0,d:0,l:0,pf:0,pa:0},label:grouping===10?year+'s':String(year)});
    $('chart-empty').hidden=!!bins.length;$('chart-inspect').hidden=!bins.length;
    $('chart-period').innerHTML='<option value="">Choose a '+(grouping===10?'decade':'year')+'</option>'+bins.map((b,i)=>`<option value="${i}">${b.label} · ${b.n} matches</option>`).join('');
    if(selected!==null&&selected>=bins.length)selected=null;
    $('chart-period').value=selected===null?'':selected;detail();
    if(!bins.length){$('chart-canvas').innerHTML='';return;}
    const W=Math.max(320,Math.round(panel.clientWidth-32)),H=300,L=48,R=14,T=16,B=36,pw=W-L-R,ph=H-T-B;
    let max=metric==='wins'?100:Math.max(1,...bins.map(b=>metric==='count'?b.n:Math.max(b.pf,b.pa)/(b.n||1)));
    const step=metric==='wins'?25:Math.max(1,Math.ceil(max/4));max=metric==='wins'?100:step*4;
    const x=i=>L+(i+.5)*pw/bins.length,y=v=>T+ph-v/max*ph;
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="chart-svg-title chart-svg-desc"><title id="chart-svg-title">${escape($('chart-title').textContent)}</title><desc id="chart-svg-desc">${escape($('chart-summary').textContent)}. Exact figures are available using Inspect a period below.</desc>`;
    for(let j=0;j<=4;j++){let v=max*j/4;svg+=`<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-axis" x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}${metric==='wins'?'%':''}</text>`;}
    const stride=Math.max(1,Math.ceil(bins.length/Math.max(2,Math.floor(pw/65))));
    bins.forEach((b,i)=>{if(i%stride===0)svg+=`<text class="chart-axis" x="${x(i)}" y="${H-10}" text-anchor="middle">${b.year}${grouping===10?'s':''}</text>`;});
    if(metric==='count')bins.forEach((b,i)=>{svg+=`<rect class="chart-bar" x="${x(i)-pw/bins.length*.34}" y="${y(b.n)}" width="${pw/bins.length*.68}" height="${ph*b.n/max}"/>`;});
    else for(const series of metric==='points'?['pf','pa']:['w']) {
      let d='',connected=false;
      bins.forEach((b,i)=>{if(!b.n){connected=false;return;}const v=(series==='w'?100:1)*b[series]/b.n;d+=(connected?' L':' M')+x(i)+','+y(v);connected=true;});
      svg+=`<path class="chart-line ${series==='pa'?'against':'for'}" d="${d}"/>`;
      bins.forEach((b,i)=>{if(b.n)svg+=`<circle class="chart-dot ${series==='pa'?'against':'for'}" cx="${x(i)}" cy="${y((series==='w'?100:1)*b[series]/b.n)}" r="2.7"/>`;});
    }
    bins.forEach((b,i)=>{const value=!b.n||metric==='count'?'':metric==='wins'?', '+(100*b.w/b.n).toFixed(1)+'% wins':', '+(b.pf/b.n).toFixed(1)+' for / '+(b.pa/b.n).toFixed(1)+' against per match';svg+=`<rect class="chart-hit" data-bin="${i}" x="${L+i*pw/bins.length}" y="${T}" width="${pw/bins.length}" height="${ph}"><title>${b.label}: ${b.n} matches${value}</title></rect>`;});
    $('chart-canvas').innerHTML=svg+'</svg>';
  }
  new ResizeObserver(()=>{if(mode==='charts')draw();}).observe(panel);
  window.FilterCharts={render(payload){data=payload;selected=null;if(mode==='charts')draw();},matches(){setMode('matches');}};
})();
