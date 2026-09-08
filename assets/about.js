(function () {
  "use strict";
  var data = window.RUGBY_DATA;
  if (!data || !data.meta) return;
  document.querySelectorAll('[data-stat]').forEach(function (el) {
    var n = data.meta[el.dataset.stat];
    if (typeof n === 'number') el.textContent = n.toLocaleString('en-GB');
  });
  var date = new Date(data.meta.last_match + 'T12:00:00Z');
  if (!isNaN(date)) document.getElementById('about-latest').textContent = date.toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
})();
