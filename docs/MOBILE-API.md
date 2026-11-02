# Archive/mobile boundary

The canonical records and rendering remain owned by `assets/app.js`.
`assets/mobile.js` mounts under `(max-width:700px)` and reverses its DOM moves
and listeners on unmount. Desktop styling remains the default.

- `__ARCHIVE.matchDetail(index)` returns the canonical drawer HTML, Match ID,
  date and title. The index is a current dataset index, never a stable ID.
- `linkedRow()` resolves the current permanent or legacy link to an index.
- `collapseRow(index)` removes a desktop expansion before opening a phone panel.
- `copyMatchLink(button)` preserves the canonical copy-link behaviour.
- `__MOBILE_MATCH_OPEN(index)` is installed only while the mobile view is mounted;
  the archive calls it rather than inserting a virtual-table drawer.
- `setFilters`, `reset`, `stats`, `state`, `rowsOut` are test/debug hooks, not a
  substitute for validating external URL state.

The phone dialog preserves list position, traps focus through native `dialog`,
returns focus on close and removes only `match` from the hash. Never reuse a
cached row index after a dataset replacement. Source/statistical HTML is rendered
by the archive once; mobile must not recompute historical facts.

Tests: `tests/accessibility.cjs` and `tests/share-links.cjs` cover dialog keyboard
behaviour and link/filter preservation. Physical Safari remains a separate check.
