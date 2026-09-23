(function () {
  "use strict";
  var form = document.getElementById('report-form'), loading = document.getElementById('report-loading');
  var status = document.getElementById('report-status'), send = document.getElementById('report-send');
  var data = window.RUGBY_DATA, id = new URLSearchParams(location.search).get('match');
  id = (window.RUGBY_MATCH_ID_ALIASES || {})[id] || id;
  if (!data || !id) { loading.textContent = 'Open a match in the archive and choose “Report an error” to identify the fixture.'; return; }
  var fields = {}; data.fields.forEach(function (key, i) { fields[key] = i; });
  var matches = data.rows.filter(function (r) { return r[fields.match_id] === id; });
  if (matches.length !== 1) { loading.textContent = 'This match could not be identified in the current archive. Please find it again in the match explorer.'; return; }
  var row = matches[0], lookup = data.lookups;
  function name(side) { return lookup.team_era && row[fields[side + '_as']] != null ? lookup.team_era[row[fields[side + '_as']]] : lookup.teams[row[fields[side]]]; }
  var fixture = row[fields.date] + ' — ' + name('home') + ' ' + row[fields.home_score] + '–' + row[fields.away_score] + ' ' + name('away');
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
