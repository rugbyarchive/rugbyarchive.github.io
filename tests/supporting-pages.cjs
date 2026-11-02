const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
(async()=>{
 const root=path.resolve(__dirname,'..'),base=process.env.SITE_URL||pathToFileURL(root).href+'/',ctx={window:{}};
 for(const file of ['archive-data.js','page-meta.js','legacy-match-links.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'data',file),'utf8'),ctx);
 const d=ctx.window.RUGBY_DATA,meta=ctx.window.RUGBY_PAGE_META,f=Object.fromEntries(d.fields.map((k,i)=>[k,i]));
 assert.equal(meta.meta.matches,d.rows.length);let total=0;
 const all={};for(const url of meta.report_shards){vm.runInNewContext(fs.readFileSync(path.join(root,url.split('?')[0]),'utf8'),ctx);Object.assign(all,ctx.window.RUGBY_REPORT_ROWS);total+=Object.keys(ctx.window.RUGBY_REPORT_ROWS).length;}
 assert.equal(total,d.rows.length);
 for(const r of d.rows){const name=s=>r[f[s+'_as']]!=null?d.lookups.team_era[r[f[s+'_as']]]:d.lookups.teams[r[f[s]]];assert.equal(JSON.stringify(all[r[f.match_id]]),JSON.stringify([r[f.date],name('home'),r[f.home_score],r[f.away_score],name('away')]));}
 const b=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 async function page(file,query='',noJS=false){const p=await b.newPage({javaScriptEnabled:!noJS});p.requests=[];p.errors=[];await p.route(/cloudflareinsights|formspree/,r=>r.abort());p.on('request',r=>p.requests.push(r.url()));p.on('pageerror',e=>p.errors.push(e.message));await p.goto(base+file+'.html'+query);return p;}
 for(const noJS of [true,false]){const p=await page('about','',noJS);assert.equal(await p.locator('[data-stat=matches]').innerText(),d.rows.length.toLocaleString('en-GB'));assert.equal(await p.locator('[data-stat=breakdown_coverage]').innerText(),d.meta.breakdown_coverage.toLocaleString('en-GB'));assert(!p.requests.some(u=>u.includes('archive-data')||u.includes('legacy-match')));await p.close();}
 const ids=[d.rows[0][f.match_id],d.rows[Math.floor(d.rows.length/2)][f.match_id],d.rows.at(-1)[f.match_id]];
 const aliases=ctx.window.RUGBY_MATCH_ID_ALIASES,old=Object.keys(aliases).find(k=>all[aliases[k]]);const numeric=Object.keys(ctx.window.RUGBY_LEGACY_MATCH_IDS).find(k=>all[ctx.window.RUGBY_LEGACY_MATCH_IDS[k]]);
 for(const id of [...ids,old,numeric]){assert(id);const p=await page('report','?match='+encodeURIComponent(id));await p.locator('#report-form').waitFor({state:'visible'});const canonical=aliases[id]||ctx.window.RUGBY_LEGACY_MATCH_IDS[id]||id,r=all[canonical];assert.equal(await p.locator('#report-id').inputValue(),canonical);assert.equal(await p.locator('#report-fixture').inputValue(),`${r[0]} — ${r[1]} ${r[2]}–${r[3]} ${r[4]}`);assert(!p.requests.some(u=>u.includes('archive-data')));if(ids.includes(id))assert(!p.requests.some(u=>u.includes('legacy-match')));assert.deepEqual(p.errors,[]);await p.close();}
 for(const id of ['','missing-record']){const p=await page('report',id?'?match='+id:'');await p.getByRole('link',{name:'Find a match in the archive'}).waitFor();if(!id)assert(!p.requests.some(u=>/data\/report\//.test(u)));assert.equal(await p.locator('meta[name=robots]').getAttribute('content'),'noindex');await p.close();}
 const p=await b.newPage();await p.route(/cloudflareinsights/,r=>r.abort());await p.route('**/data/report/**',r=>r.abort());await p.goto(base+'report.html?match='+ids[0]);await p.getByRole('link',{name:'Find a match in the archive'}).waitFor();assert((await p.locator('#report-loading').innerText()).includes('could not load'));await p.close();
 assert(!fs.readFileSync(path.join(root,'sitemap.xml'),'utf8').includes('report.html'));
 await b.close();console.log('PASS supporting pages: all match-index records equal source, no-JS counts, canonical/alias/numeric reports, minimal requests, missing-data recovery and noindex.');
})().catch(e=>{console.error(e);process.exit(1);});
