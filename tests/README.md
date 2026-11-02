# Browser regressions

Install Playwright in the development environment, then run `node tests/share-links.cjs` from the site checkout. Microsoft Edge is the default browser. Set `BROWSER_CHANNEL=chromium` when using Playwright's installed Chromium instead.

`SITE_URL=https://rugbyarchive.github.io/` runs the same checks against deployment; otherwise they use the local checkout. Analytics and form requests are blocked. No forms are submitted. The suite includes deliberately failed data requests followed by recovery.

Publication must pass this suite locally and against the deployed files when changing URL or recovery behaviour. Other existing release/mobile checks still live in the dated workspace folders and await consolidation.
