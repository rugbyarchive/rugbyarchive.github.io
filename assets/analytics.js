/* Cloudflare Web Analytics: public site identifier, not an account credential. */
(function () {
  'use strict';
  if (location.hostname !== 'rugbyarchive.github.io' || location.protocol !== 'https:') return;
  const script = document.createElement('script');
  script.type = 'module';
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.setAttribute('data-cf-beacon', JSON.stringify({token:'b3e8a7c0b7c54b5b836e30da36d355c1'}));
  document.body.appendChild(script);
})();
