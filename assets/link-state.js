/* Parse share links transactionally: invalid input never partially replaces a view. */
(function () {
  'use strict';
  function notice(message) {
    var el = document.getElementById('link-notice');
    if (!el) {
      el = document.createElement('p');
      el.id = 'link-notice'; el.className = 'rulenote'; el.setAttribute('role', 'alert');
      var header = document.querySelector('.topbar');
      if (header) header.after(el); else document.body.prepend(el);
    }
    el.textContent = message; el.hidden = !message;
  }
  function parse(raw, schema, ranges) {
    var out = Object.create(null), bad = [];
    String(raw).replace(/^#/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var at = pair.indexOf('='), key, value;
      try {
        key = decodeURIComponent(at < 0 ? pair : pair.slice(0, at));
        value = decodeURIComponent(at < 0 ? '' : pair.slice(at + 1));
      } catch (_) { bad.push('malformed text'); return; }
      if (!Object.prototype.hasOwnProperty.call(schema, key)) return;
      var parsed = schema[key](value);
      if (parsed === undefined) bad.push(key); else out[key] = parsed;
    });
    (ranges || []).forEach(function (r) {
      if (out[r[0]] != null && out[r[0]] !== '' && out[r[1]] != null && out[r[1]] !== '' && out[r[0]] > out[r[1]]) bad.push(r.join('/'));
    });
    notice(bad.length ? 'This link contains an unrecognised or invalid value (' + Array.from(new Set(bad)).join(', ') + '). Its filters were not applied; your current view is unchanged.' : '');
    return bad.length ? null : out;
  }
  function choice(values) { return function (v) { return values.indexOf(v) >= 0 ? v : undefined; }; }
  function integer(min, max) { return function (v) { if (v === '') return null; return /^-?\d+$/.test(v) && Number.isSafeInteger(+v) && +v >= min && +v <= max ? +v : undefined; }; }
  function date(v) { if (!v) return ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return; var n = Date.parse(v); return Number.isFinite(n) && new Date(n).toISOString().slice(0,10) === v ? v : undefined; }
  function team(data) {
    var teams = data.lookups.teams, era = data.lookups.team_era || [], f = {};
    data.fields.forEach(function (n,i) { f[n] = i; });
    return function (v) {
      if (!v || teams.indexOf(v) >= 0) return v;
      var e = era.indexOf(v); if (e < 0) return;
      var ids = new Set();
      data.rows.forEach(function (r) { if (r[f.home_as] === e) ids.add(r[f.home]); if (r[f.away_as] === e) ids.add(r[f.away]); });
      return ids.size === 1 ? teams[Array.from(ids)[0]] : undefined;
    };
  }
  window.RUGBY_LINK = {parse:parse, choice:choice, integer:integer, date:date, team:team};
})();
