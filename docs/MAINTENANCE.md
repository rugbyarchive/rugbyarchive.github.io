# Maintenance decisions and remaining work

## Source and release ownership

`live-site` is the maintained production checkout. Codex is the sole merger and
publisher; Claude's pre-2000 research arrives as proposals. Writer-state and the
exclusive publication guard remain authoritative. Do not deploy an older snapshot.

## Redesign experiment

`rugby-reimagined` is an archived design experiment, not a production branch or
data source. No automatic synchronisation or deployment should use it. Preserve
its source as reference; the owner has approved the current production design.

## Line endings and formatting

Text is LF in Git. Asset-version hashes use LF-normalised text so a Windows
checkout does not produce different versions solely from CRLF conversion.
Font/image assets remain binary. EditorConfig and Prettier settings describe new
work; do not mix a wholesale legacy reformat with a functional change.
ESLint's initial rules target dangerous constructs and basic correctness; expand
the rules gradually. The declared lint command must pass before publishing.

## Safe workspace migration plan (not executed)

Do not relocate the active master, research library or checkout in the middle of
a publication. First inventory scheduled-task paths and scripts, take a verified
backup, pause writers, copy to a dedicated non-OneDrive directory, reproduce the
full test/build output, update all scheduler and writer-state paths, then switch
the active pointer. Keep the original read-only until one complete scheduled
research/publication cycle passes. Only then archive superseded copies.

Old release folders contain provenance and executable historical receipts. Index
them by baseline and purpose before archival; never delete merely by age. A new
pipeline repository must include configuration and tests, not just a copy of the
engine with broken relative paths. Migration and old-release consolidation remain
open work; this document is the agreed safe procedure, not a completion claim.

## Performance trade-offs

The About/Report split and font conversion reduce requests without changing
historical calculations. Further splitting of rankings must preserve reconstruction,
official snapshots and stepping; do not add asynchronous state paths just to reduce
an uncompressed-size headline. Keep this as an assessed follow-up until measured
network/CPU evidence justifies it. Existing legacy archive links remain supported.

## Archive legacy-link loading

Ordinary visits and current Match IDs do not request the alias table. Unresolved
or numeric legacy links load its versioned URL on demand. A failed lookup download
offers a retry; late responses cannot override a newer link. Known records hidden
by filters do not trigger this download. The maintained archive-loading test covers
ordinary/current/legacy/numeric links, failures, retry and stale responses.

Measured on 2 November: the omitted table is 362,396 bytes of JavaScript, with a
77,125-byte gzip estimate. These are payload measurements, not claimed page-speed
or Core Web Vitals gains. The rankings payload is 3,341,426 bytes (247,924 gzip);
its official-snapshot field is 2,887,044 JSON bytes (82,865 gzip). On-demand official
snapshots are the next loading target; current archive calculations must remain
usable on failure, and source-switch races and old links need regression coverage.

## Rankings loading and shared exports — 3 November

The preceding performance follow-up is implemented. Keep `rankings-data.js` as
the canonical pipeline export. `build-rankings-data.py` generates the core and
official payloads; the release check requires their recombination to equal the
canonical object. Only the core loads initially. Selecting World Rugby or opening
an official deep link loads snapshots, with retry and stale-selection protection.

Core payload: 454,369 bytes, 164,263 gzip estimate, versus 3,341,426 and 247,924
for the original bundle. These are payload measurements, not measured speed or
Core Web Vitals improvements. Official snapshot positions and ordering are kept.

Shared modules now own dynamic script loading, CSV quoting/downloads and official
snapshot lookup/change detection. The four tools retain their own CSV schemas.
Thirteen maintained suites include exact snapshot comparisons, source-switch
races and actual CSV downloads. Larger feature modules can be extracted as those
features change; a wholesale ES-module conversion is not required for this fix.
