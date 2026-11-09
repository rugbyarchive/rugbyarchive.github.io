# Nuck's Rugby Archive

A sourced, evolving archive of men's international rugby and selected touring fixtures, presented as a public history explorer and scoring comparison tool. Coverage is incomplete; published source and uncertainty notes describe known gaps.

**11,285 matches · 616 teams · latest recorded match 2026-10-31**

## The site

| Page | What it does |
|---|---|
| `index.html` | **The Super Filter** — every match in one table, with stackable filters (team, opponent, era, venue, competition, margin, day of week, world ranking at the time) and aggregates that recalculate on every change. |
| `rankings.html` | **The Rankings Time Machine** — archive reconstruction from 1871 and official World Rugby snapshots from October 2003. Match/day/update stepping, slow playback and rating changes. |
| `head-to-head.html` | **Head to Head** — every meeting between any two sides, and who has been ahead across the whole rivalry. |
| `scoring.html` | **Score Normalisation** — historical matches re-scored under any scoring system the game has used. |

## How it is built

The source is a curated Excel workbook. The release pipeline validates records,
builds the archive reconstruction and preserves separately sourced official
World Rugby snapshots. The interactive tools use static JavaScript datasets.
About uses small generated metadata; Report loads only the relevant match-index
shard, with legacy aliases loaded only when needed. There is no application backend.

`python tools/build-page-data.py` regenerates supporting-page payloads and fallback
coverage text from `data/archive-data.js`. The active release pipeline runs this
before versioning assets. Do not hand-edit generated payloads.

## Accuracy

Release checks cover record identity, exclusions, dataset consistency and the
affected browser behaviour. They are not a claim that every historical field has
been independently corroborated. Source quality and unresolved gaps remain visible.

Run `npm test` after installing development dependencies; see `tests/README.md`.

Coverage generated from the published archive. See the site for source notes and limitations.
