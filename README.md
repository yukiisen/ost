# OSU! Stamina Trainer

A browser-based stamina / stream-speed trainer for osu! players, with a **shared global leaderboard**.

Based on [osu! Stamina Improver](https://github.com/wbaws/osu-stamina-improver) by Yepstare (which is itself based on the [osu! Stream Speed Benchmark](https://github.com/ckrisirkc/osuStreamSpeed.js) by arctic). This is a UI rewrite in TypeScript.

## Play

No install, no account, works in any modern browser:

- **Locally:** clone the repo, then `npm install && npm run dev`.
- **Online:** on the website [OST](https://ost-psi.vercel.app/)

## How it works

- **Levels 1-79**: lenient ramp - 100 bpm / 350 UR / 6 notes up to 170 bpm / 200 UR / 64 notes.
- **Levels 80+**: 10-level cycles. Even positions are **stamina** levels (bpm/UR climb at 2/3 the original speed, note counts grow to thousands); odd positions are **BURST** levels (8 notes at ~1.22x the surrounding bpm, 12 from L110).
- A level is cleared when your **stream speed** (osu! 1/4-note formula) hits the target **and** your **unstable rate** (10 x stdev of inter-click intervals) stays under the cap.
- **Find Suitable Level** runs 3 benchmarks at your own pace and places you at the right level.
- Custom keys, optional metronome with real osu! hit sounds, optional mouse/touch tandem tapping, automatic breaks between levels.

Your progress is saved in your browser (localStorage); nothing is tracked unless you submit to the leaderboard.

## Themes

- Pick any wallpaper (JPG/PNG up to 4MB) and the UI palette is **auto-generated from its colors**.
- Background **dim** and **blur** sliders to taste.
- Everything is persisted per-browser, custom wallpaper included.

## Global leaderboard

Shares the [osu-stamina-improver](https://osu-stamina-improver.pages.dev/) leaderboard API:

- **ranked by highest level cleared**, showing bpm, UR, total taps and a relative submission time
- set your display name once; runs are submitted automatically on a clear
- **anti-cheat**: submissions include the raw click timings; the server recomputes bpm/UR with the exact same level formula and rejects anything inconsistent
- Easilly exploitable by ilyes09!

## Development

```bash
npm install        # install deps
npm run dev        # vite dev server
npm run build      # tsc typecheck + vite build to dist/
npm run preview    # preview the production build
```

The project is intentionally dependency-light (no framework):

- `src/measures.ts` — pure, DOM-free game math (level formula, bpm/UR analysis, benchmarks), unit-testable in Node
- `src/main.ts` — game loop and UI wiring
- `src/dom.ts` / `src/components.ts` — tiny DOM wrapper and custom widgets (sliders, toggles)
- `src/audio.ts` — accurate metronome with osu! hit sound fallbacks
- `src/pallette.ts` — theme engine: wallpaper loading, color extraction, palette application
- `src/api.ts` — leaderboard client (points at the shared osu-stamina-improver API)

## Credits & license

- Based on osu! Stamina Improver by **Yepstare** and the osu! Stream Speed Benchmark by **arctic**, both MIT
- osu! is a registered trademark of ppy Pty Ltd. This project is not affiliated with or endorsed by ppy.

MIT - see [LICENSE](LICENSE).
