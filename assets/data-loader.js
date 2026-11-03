(function () {
  'use strict';
  var pending = Object.create(null);
  // Share in-flight requests, but let callers retry failures and reload shard globals.
  window.RUGBY_LOAD = function (url) {
    if (pending[url]) return pending[url];
    pending[url] = new Promise(function (resolve, reject) {
      var script = document.createElement('script'), done = false;
      var timer = setTimeout(function () { finish(false); }, 15000);
      function finish(ok) {
        if (done) return;
        done = true; clearTimeout(timer); script.onload = script.onerror = null;
        delete pending[url]; script.remove();
        if (ok) resolve(); else reject(new Error('Data could not load'));
      }
      script.onload = function () { finish(true); };
      script.onerror = function () { finish(false); };
      script.src = url; document.head.appendChild(script);
    });
    return pending[url];
  };
})();
