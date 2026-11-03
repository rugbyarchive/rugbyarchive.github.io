(function () {
  'use strict';
  window.RUGBY_CSV = {
    quote: function (value) {
      if (value === null || value === undefined) return '';
      var text = String(value);
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    },
    download: function (lines, filename) {
      var blob = new Blob(['\uFEFF' + lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
      var anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob); anchor.download = filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(function () { URL.revokeObjectURL(anchor.href); }, 2000);
    }
  };
})();
