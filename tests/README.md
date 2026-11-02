# Browser regressions

Install the development dependencies declared in `package.json` (`npm install`).
Run all maintained tests with **`npm test`**, or **`node tests/run.cjs`**.
The active publication pipeline invokes `python tools/check-site.py` and stops on failure.
Microsoft Edge must be installed for the default channel. On other systems install
Playwright Chromium and set `BROWSER_CHANNEL=chromium`.

Install Playwright in the development environment, then run `node tests/share-links.cjs` from the site checkout. Microsoft Edge is the default browser. Set `BROWSER_CHANNEL=chromium` when using Playwright's installed Chromium instead.

`SITE_URL=https://rugbyarchive.github.io/` runs the same checks against deployment; otherwise they use the local checkout. Analytics and form requests are blocked. No forms are submitted. The suite includes deliberately failed data requests followed by recovery.

Publication must pass this suite locally and against the deployed files when changing URL or recovery behaviour. Other existing release/mobile checks still live in the dated workspace folders and await consolidation.

Run `node tests/accessibility.cjs` for form names, navigation/theme state, focus indicators, mobile keyboard dialog behaviour and reduced-motion rankings playback. Run locally and live for accessibility changes. These browser checks do not replace physical-device or assistive-technology testing.

Supporting-page tests compare every generated match-index entry with the archive,
verify counts with JavaScript disabled, and check current/legacy/numeric match links
without submitting reports. Safe-HTML tests cover escaping and source URL protocols.
