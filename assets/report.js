(async function () {
  "use strict";
  var form = document.getElementById('report-form'), loading = document.getElementById('report-loading');
  var status = document.getElementById('report-status'), send = document.getElementById('report-send');
  var data=window.RUGBY_PAGE_META, id=new URLSearchParams(location.search).get('match');
  function recover(message){
    loading.textContent=message;var back=document.createElement('a');back.href='index.html';back.className='ghostbtn';back.textContent='Find a match in the archive';loading.appendChild(document.createElement('br'));loading.appendChild(back);
  }
  function load(url){return new Promise(function(resolve,reject){var script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});}
  function bucket(key){var h=0;for(var i=0;i<key.length;i++)h=(Math.imul(h,31)+key.charCodeAt(i))>>>0;return h%64;}
  async function find(key){window.RUGBY_REPORT_ROWS=null;await load(data.report_shards[bucket(key)]);return window.RUGBY_REPORT_ROWS && Object.prototype.hasOwnProperty.call(window.RUGBY_REPORT_ROWS,key)?window.RUGBY_REPORT_ROWS[key]:null;}
  if(!id){recover('Open a match in the archive and choose “Report an error” to identify the fixture.');return;}
  if(!data){recover('The match details could not load. Please refresh or find the match again.');return;}
  var row;
  try{
    row=await find(id);
    if(!row){
      await load(data.legacy_url);
      var alias=(window.RUGBY_MATCH_ID_ALIASES||{})[id]||(window.RUGBY_LEGACY_MATCH_IDS||{})[id];
      if(typeof alias==='string'){id=alias;row=await find(id);}
    }
  }catch(error){recover('The match details could not load. Please refresh or find the match again.');return;}
  if(!row){recover('This match could not be identified in the current archive. Please find it again.');return;}
  var fixture=row[0]+' — '+row[1]+' '+row[2]+'–'+row[3]+' '+row[4];
  var matchUrl = new URL('index.html', location.href); matchUrl.hash = 'match=' + encodeURIComponent(id);
  document.getElementById('report-fixture').value = fixture;
  document.getElementById('report-id').value = id;
  document.getElementById('report-url').value = matchUrl.href;
  document.getElementById('report-back').href = matchUrl.href;
  document.getElementById('report-build').value = data.meta.built;
  loading.hidden = true; form.hidden = false;
  var endpoint = window.RUGBY_REPORT_ENDPOINT || '';
  var ready = /^https:\/\/formspree\.io\/f\/[a-zA-Z0-9]+$/.test(endpoint);
  send.disabled = !ready;
  if (!ready) status.textContent = 'Reports are not accepting submissions yet. Please check back soon.';
  var busy = false;
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!ready || busy || !form.reportValidity()) return;
    if (!document.getElementById('report-message').value.trim()) { status.textContent = 'Please describe the correction.'; return; }
    busy = true; send.disabled = true; status.textContent = 'Sending your report…';
    var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var payload = new FormData(form);
      payload.set('fixture', fixture); payload.set('match_id', id); payload.set('match_url', matchUrl.href);
      var response = await fetch(endpoint, {method:'POST', body:payload, headers:{Accept:'application/json'}, signal:controller.signal});
      if (!response.ok) throw new Error('Rejected');
      status.textContent = 'Thank you. Your report has been submitted for review. The match record has not been changed.';
      send.textContent = 'Report submitted';
    } catch (error) {
      status.textContent = error.name === 'AbortError' ? 'We could not confirm delivery. Your text is still here; please wait before trying again to avoid a duplicate report.' : 'The report could not be sent. Your text is still here. Please try again later.';
      send.disabled = false; busy = false;
    } finally { clearTimeout(timeout); }
  });
})();
