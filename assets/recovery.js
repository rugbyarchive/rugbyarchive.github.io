(function () {
  'use strict';
  document.querySelectorAll('[data-retry]').forEach(function (button) {
    button.addEventListener('click', function () { location.reload(); });
  });
})();
