Previous session: codex-desktop-2026-06-07
JSONL: unavailable in this Codex desktop session
To review: read this handoff plus the files listed below

# Handoff: News Sources

## Context

The user wants Guo News Radio to expand beyond the small starter source list and add AI, research, developer, community, and market/finance sources inspired partly by Sell The News. The repository is currently M1/M2-ish: `config/sources.json` exists, but episode generation still reads `mock/items.today.json`; no real ingest pipeline consumes `sources.json` yet.

Sell The News publicly positions itself around real-time WSJ/Bloomberg/NYT/FT market feeds, WSB sentiment, Truth Social market-impact scoring, per-ticker stock news, options analytics, and archive search.

## Current State

- `config/sources.json` expanded from 5 sources to 26 sources.
- Enabled sources: 12. These are mostly direct RSS/public endpoints that passed URL checks.
- Disabled-but-cataloged sources: 14. These need API tokens, tracked repos, tracked tickers, CIKs, company IR URLs, backoff, or noise filters before use.
- Fixed stale Google DeepMind RSS URL from `https://deepmind.google/discover/blog/rss.xml` to `https://deepmind.google/blog/rss.xml`.
- Added `CONTEXT.md` terms that distinguish cataloged sources from enabled ingest sources.
- No Git repository is present in the workspace, so no diff/branch impact analysis was possible.

## Key Files

- `config/sources.json` -- source catalog; now includes official AI sources, arXiv categories, HN, Product Hunt, Reddit, market/news APIs, and company IR template.
- `CONTEXT.md` -- glossary terms for source catalog vs enabled ingest source.
- `docs/architecture.md` -- says NEWS includes RSS, GitHub, arXiv, company announcements, etc.
- `docs/roadmap.md` -- M2 calls for RSS ingestion and dedupe.
- `docs/task-board.md` -- next tasks already list RSS fetcher, URL import, dedupe, source quality scoring.
- `server/build-episode.mjs` -- current episode builder reads mock data only.
- `mock/items.today.json` -- current candidate news input.

## Next Steps

1. Build a read-only source loader for `config/sources.json`.
2. Implement the first RSS/Atom ingest vertical slice for enabled RSS sources.
3. Normalize RSS/arXiv/API items into the current `mock/items.today.json` item shape.
4. Add dedupe before rank/cluster so the larger source list does not repeat the same event.
5. Add API adapters only after env vars and source-specific filtering rules are defined.
6. Add tracked company lists for GitHub releases, SEC EDGAR CIKs, Finnhub tickers, and company IR RSS URLs.

## Suggested Skills

- `/tdd` for source loader and ingest adapters.
- `/to-issues` to split ingest into vertical slices.
- `/bugfix` if any source endpoint fails after being enabled.
- `/e2e-verify` after ingest has acceptance criteria.
- `/functional-test` for a human-readable checklist once the PWA exposes source controls.
- `/improve-codebase-architecture` before adding many API adapters.
