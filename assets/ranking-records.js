(function(){
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.renderRankingRecords=function(team,opponent){
 const box=document.getElementById('ranking-records'),data=window.RUGBY_RANKING_RECORDS;
 box.hidden=!team||!!opponent;if(box.hidden)return;
 const canonical=data&&data.aliases[team],records=data&&data.teams[canonical];
 function cell(record,source){if(!record)return 'Unavailable';const link='rankings.html?source='+source+'&date='+record[1]+'&team='+encodeURIComponent(canonical);return '<a href="'+link+'"><strong>No. '+record[0]+'</strong><span>'+esc(record[1])+'</span></a>';}
 box.innerHTML='<div class="card-label">All-time ranking records</div><table class="rank-record-table"><thead><tr><th>Rankings</th><th>Highest</th><th>Lowest</th></tr></thead><tbody>'+[['world','World Rugby'],['archive','Reconstructed']].map(([source,label])=>{const r=records&&records[source];return '<tr><th scope="row">'+label+'</th><td>'+cell(r&&r.highest,source)+'</td><td>'+cell(r&&r.lowest,source)+'</td></tr>';}).join('')+'</tbody></table><p class="note">First date reached. All-time records ignore match filters. Official: within available published snapshots. Reconstructed: end-of-day ranks, with idle sides hidden after four years.</p>'+(canonical&&canonical!==team?'<p class="note">Records follow the '+esc(canonical)+' ranking lineage.</p>':'');
};
})();
