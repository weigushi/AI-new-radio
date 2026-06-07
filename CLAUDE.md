# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Guo News Radio — a personal AI news radio station. Not a news aggregator, but a judgment engine that decides what information deserves your attention, then编排 (orchestrates) it into a listenable audio episode. The entire UI, prompts, and content pipeline are in Chinese.

## Commands

```powershell
# Build episode JSON from mock data (reads mock/items.today.json -> sample/episode.today.json)
npm run episode

# Generate chapter MP3s via Fish Audio TTS (reads sample/episode.today.json -> public/audio/{episode-id}/)
npm run tts

# Start HTTP server on localhost:3080
npm start
```

If PowerShell blocks `npm.ps1`, use `node server/build-episode.mjs`, `npm.cmd run tts`, or `npm.cmd start`.

## Architecture

The pipeline is a three-stage transform over news items:

```
mock/items.today.json --rank--> --cluster--> --script--> sample/episode.today.json --tts--> public/audio/
```

**`server/ranker.mjs`** — Scores each item on novelty, impact, personal_relevance, source_quality, follow_up_value, and noise_penalty using a weighted formula (defined in `prompts/episode-builder.md`). Hardcoded signal sets (`highValueSignals`, `noiseSignals`) and domain weights drive scoring. No LLM call — pure heuristic.

**`server/clusterer.mjs`** — Groups ranked items by domain + token overlap (Jaccard-like, threshold 0.42). Derives cluster titles from the most frequent entity. No LLM call.

**`server/episode-builder.mjs`** — Assembles the top 6 clusters into 4 fixed chapter types: `mainline`, `brief`, `deep_dive`, `watchlist`. Generates Chinese scripts with hardcoded editorial framing. Estimates duration at 4.1 chars/second. No LLM call yet — this is the place where LLM-generated scripts will replace templates.

**`server/build-audio.mjs`** — Orchestrates TTS per chapter. Adds emotional SSML-like cues (`[calm]`, `[confident]`, `[curious]`, `[break]`) based on chapter type and keyword detection.

**`server/tts/fish-audio.mjs`** — Fish Audio TTS client. Tries native `fetch` first, falls back to spawning `powershell.exe` on Windows. Requires `FISH_API_KEY` in `.env`.

**`server/server.mjs`** — Minimal HTTP server (no framework). Serves `prototype/index.html` at `/`, `GET /api/episode/today` from the sample JSON, static files from `public/`. All API routes are in `contracts/http.md`.

## Key Configuration

- `config/user/interests.md` — Domain priority tiers (high/medium/low) that drive `domainRelevance` in ranker
- `config/user/attention-rules.md` — Inclusion/demotion/filter rules (currently editorial guidance, not yet wired into code)
- `config/sources.json` — RSS/web source definitions with quality scores
- `prompts/news-persona.md` — Radio persona: tone, judgment criteria, prohibitions
- `prompts/episode-builder.md` — Episode structure and scoring weights (the spec that `ranker.mjs` implements)
- `.env` — `FISH_API_KEY`, `FISH_REFERENCE_ID`, TTS params, `PORT` (default 3080)

## Data Flow

1. **Input**: `mock/items.today.json` — array of news items with `id`, `title`, `url`, `source`, `published_at`, `summary`, `domain`, `entities`, `source_quality`, `signals`
2. **Episode JSON**: `sample/episode.today.json` — chapters with `id`, `type`, `title`, `script`, `why_it_matters`, `sources`, `watch_items`, `start_seconds`, `duration_seconds`
3. **Audio output**: `public/audio/{episode-id}/{chapter-id}.mp3` — one file per chapter, paths written back into episode JSON as `audio_url`

## Conventions

- Pure ESM (`"type": "module"` in package.json). All server files use `.mjs`.
- No dependencies — only Node.js built-ins.
- `__dirname` / `__filename` derived from `import.meta.url` via `fileURLToPath`.
- `.env` loaded manually by `server/env.mjs` (no dotenv package).
- Windows-first development: `start-server.cmd`, PowerShell fallback in TTS, path separators handled via `path.join`.

## Roadmap State

Currently at **M1** (manual mock data → episode JSON → TTS → PWA prototype). Next milestones: RSS ingestion, deduplication, LLM-driven script generation, entity tracking.
