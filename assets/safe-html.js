(function () {
  'use strict';
  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function sourceURL(value) {
    try { var url=new URL(value); return url.protocol==='https:' ? url.href : ''; }
    catch (_) { return ''; }
  }
  window.RUGBY_SAFE={escape:escape,sourceURL:sourceURL};
})();
