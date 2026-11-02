# Static-site security review — November 2026

The public workbook-derived data is first-party, but is not treated as safe HTML.
Main tool templates use `RUGBY_SAFE.escape`, including both quote delimiters.
Insights and filter charts use that same helper. Dynamic record links use encoded
Match IDs and fixed local paths. Archive source links accept HTTP(S), escape the
attribute, and use `noopener noreferrer`; milestone source links allow HTTPS only.
Chart coordinates, classes and metric labels come from numeric calculations or
fixed option sets. Report fixture text uses input values/textContent, not HTML.

The CSP blocks inline/evaluated scripts, plugins and unlisted script origins.
Only same-origin scripts and Cloudflare's beacon origin are allowed. Connections
allow same-origin data, Formspree and Cloudflare analytics. Inline styles remain
allowed because existing SVG/chart/layout rendering sets style attributes.
This is not a claim of protection against a compromised same-origin JS file.

Tests intentionally attempt an inline script, stub the allowed analytics origin,
and intercept a Formspree request locally. They never send a test report.
Public form/analytics identifiers are not secrets. Additional CAPTCHA remains
conditional on actual abuse; no new visitor challenge has been imposed.

Meta CSP cannot enforce frame-ancestors. No unsupported clickjacking/header
protection is claimed. A hosting migration is not required by these fixes.
