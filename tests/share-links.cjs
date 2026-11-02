const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  const base=process.env.SITE_URL||pathToFileURL(path.resolve(__dirname,'..')).href+'/';
  async function page(file,hash='',mobile=false){
    const p=await browser.newPage({viewport:{width:mobile?390:1440,height:900},isMobile:mobile,hasTouch:mobile});
    await p.route(/cloudflareinsights|formspree/,r=>r.abort());
    p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
    await p.goto(base+file+'.html'+hash);await p.waitForTimeout(150);return p;
  }
  async function hash(p,value){await p.evaluate(v=>{location.hash=v;},value);await p.waitForTimeout(100);}
  const p=await page('index','#team=France');
  const france=await p.evaluate(()=>__ARCHIVE.stats().played);assert(france>0&&france<11283);
  for(const bad of ['team=%E0%A4','team=Narnia','opp=Narnia','country=Narnia','city=Narnia','venue=Narnia','comp=Narnia','yearFrom=abc','yearFrom=2025&yearTo=2020','dateFrom=2020-02-30','sort=bogus','dir=0','dows=7','rankSource=bogus','marginMin=-1','oppRankMin=0','side=bogus','team=France&team=Narnia']){
    await hash(p,bad);assert.equal(await p.evaluate(()=>__ARCHIVE.state().team),'France',bad);assert.equal(await p.evaluate(()=>__ARCHIVE.stats().played),france,bad);assert(await p.locator('#link-notice').isVisible(),bad);assert(!p.url().includes('NaN'));assert.deepEqual(p.errors,[]);
  }
  await hash(p,'team=Soviet%20Union');assert.equal(await p.evaluate(()=>__ARCHIVE.state().team),'Russia');
  await hash(p,'');assert.equal(await p.evaluate(()=>__ARCHIVE.state().team),'');assert(!p.url().includes('#'));
  await p.close();
  for(const [file,key,selector] of [['index','team','#f-team'],['head-to-head','a','#f-a'],['scoring','team','#f-team']]){
    for(const v of ['Narnia','%E0%A4']){const q=await page(file,'#'+key+'='+v);assert(await q.locator('#link-notice').isVisible());assert.equal(await q.locator(selector).inputValue(),'');assert.deepEqual(q.errors,[]);await q.close();}
    const q=await page(file,'#'+key+'=France');await hash(q,key+'=Narnia');assert.equal(await q.locator(selector).inputValue(),'France');await hash(q,key+'=Soviet%20Union');assert.equal(await q.locator(selector).inputValue(),'Russia');assert.deepEqual(q.errors,[]);await q.close();
  }
  const h=await page('head-to-head','#a=France&b=New%20Zealand');const played=await h.evaluate(()=>__H2H.stats().played);
  for(const value of ['a=Narnia','era=NaN','meetFrom=2020-02-30','meetFrom=2022-01-01&meetTo=2020-01-01']){await hash(h,value);assert.equal(await h.evaluate(()=>__H2H.stats().played),played);assert.equal(await h.locator('#f-b').inputValue(),'New Zealand');}await h.close();
  const sc=await page('scoring','#team=France');for(const value of ['target=99999','show=invalid','team=%E0%A4']){await hash(sc,value);assert.equal(await sc.locator('#f-team').inputValue(),'France');assert(await sc.locator('#link-notice').isVisible());}assert.deepEqual(sc.errors,[]);await sc.close();
  const m=await page('index','#team=France',true);
  // Emulate older implementations without URLSearchParams.size.
  await m.evaluate(()=>{delete URLSearchParams.prototype.size;});
  const id=await m.evaluate(()=>{const d=RUGBY_DATA,f=Object.fromEntries(d.fields.map((n,i)=>[n,i])),t=d.lookups.teams.indexOf('France'),r=d.rows.find(r=>r[f.home]===t||r[f.away]===t);return r[f.match_id];});
  await hash(m,'team=France&match='+id);assert(await m.locator('.mobile-match').isVisible());await m.locator('.mobile-match-head button').click();assert(m.url().includes('team=France'));assert(!m.url().includes('match='));assert.equal(await m.locator('#f-team').inputValue(),'France');
  const alias=await m.evaluate(id=>Object.keys(RUGBY_MATCH_ID_ALIASES).find(k=>RUGBY_MATCH_ID_ALIASES[k]===id),id);
  if(alias){await hash(m,'match='+encodeURIComponent(alias));assert(await m.locator('.mobile-match').isVisible());await m.locator('.mobile-match-head button').click();}
  await hash(m,'match=missing-record');assert(await m.locator('.fchip.warn').isVisible());assert.deepEqual(m.errors,[]);await m.close();
  for(const file of ['index','head-to-head','scoring','rankings']){
    const q=await browser.newPage();await q.route(/cloudflareinsights/,r=>r.abort());await q.route('**/data/*',r=>r.abort());await q.goto(base+file+'.html');assert(await q.locator('#dataerror').isVisible());assert(!((await q.locator('#dataerror').innerText()).includes('Update Archive')));await q.unroute('**/data/*');await Promise.all([q.waitForEvent('load'),q.locator('[data-retry]').click()]);assert(!await q.locator('#dataerror').isVisible());await q.close();
  }
  const r=await page('report');assert(await r.getByRole('link',{name:'Find a match in the archive'}).isVisible());await r.close();
  const missing=await page('404');assert(await missing.getByRole('link',{name:'Find a match',exact:true}).isVisible());await missing.close();
  await browser.close();console.log('PASS audit: malformed and unknown links, atomic state, aliases, numeric/date/enumeration bounds, initial and hashchange paths, mobile filter preservation, failed-data retry, report/404 recovery.');
})().catch(e=>{console.error(e);process.exit(1);});
