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

## Workspace migration — completed 3 November 2026

Active website and pipeline repositories now live outside OneDrive. Their local
`../workspace.json` is the path authority; shared writer-state records the same
locations. All three scheduled runs retain their cadence and use that authority.
The shared master and research library retain their existing locations.

The site, engine and staged data were copied and hash-compared. Git integrity,
the relocated browser suite and the pipeline's release/rejection checks passed.
The original checkout remains a recovery copy with a pre-push block until a full
scheduled cycle passes. It must not be edited or used as a publication source.

Twenty-nine historical release folders were moved into the evidence archive:
123,224 files checked before and after, zero files deleted. The local archive
index maps every old path to its new location and records file hashes. Historical
builds are evidence, never active templates. The maintained private pipeline has
its own Git history, configuration guidance and `python manage.py check` entry
point; workbooks and generated outputs are excluded from that repository.

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
Fourteen maintained suites include exact snapshot comparisons, source-switch
races and actual CSV downloads. Larger feature modules can be extracted as those
features change; a wholesale ES-module conversion is not required for this fix.

## Contrast and device acceptance

The inactive filter's explanation keeps full opacity, theme variables are scoped
to the document rather than the similarly named toggle button, and light-theme
metadata, chart labels and result badges meet the measured contrast targets.
SVG chart labels and non-text indicators have a separate computed-colour check;
the chart labels were also visually inspected in both themes. These checks do not
constitute a physical iPhone/Safari or screen-reader test.

Device acceptance still requires: iPhone Safari filter open/close and result jump;
VoiceOver names, reading order and focus return; match-detail close and browser
Back; rankings source switch and retry; chart navigation; and enlarged text without
lost controls. Record device/OS/browser versions and actual results before closing
that item. The pre-2000 scoring-review queue separately remains with Claude.
