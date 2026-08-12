# Rugby Archive

A complete, unified database of every international rugby union match, from the
first ever international on 27 March 1871 to the present day — presented as a
public time capsule and what-if tool.

**9,977 matches · 306 teams · 1871-03-27 to 2026-07-12**

## The site

| Page | What it does |
|---|---|
| `index.html` | **The Super Filter** — every match in one table, with stackable filters (team, opponent, era, venue, competition, margin, day of week, world ranking at the time) and aggregates that recalculate on every change. |
| `rankings.html` | **The Rankings Time Machine** — the World Rugby rankings replayed from 1871. Any date, four what-if rule sets. |
| `head-to-head.html` | **Head to Head** — every meeting between any two sides, and who has been ahead across the whole rivalry. |
| `scoring.html` | **Score Normalisation** — historical matches re-scored under any scoring system the game has used. |

## How it is built

The single source of truth is a curated Excel workbook. A Python pipeline
validates it, replays the World Rugby points-exchange ranking system over every
match from 1871 using the same engine four times (official and legacy rules,
with and without British & Irish Lions matches), and writes the JSON this site
ships to the browser. There is no backend: the whole dataset loads with the
page.

Rankings are a blind replay, not a copy of the published table. As an
independent check, at each of the six most recent Rugby World Cup final dates
the replay puts the correct side top under official rules.

## Accuracy

Every figure on every page is cross-checked against an independent Python
recomputation before release. Known data gaps and open audit items are
documented rather than hidden — see the coverage notes on each page.

Built 2026-08-12 at 14:12:29 from `Historical Rugby Results.xlsx`.
