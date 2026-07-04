# Duoforma

A self-hosted logic puzzle game where you balance two shapes across a grid — unlimited plays, no account required.

**▶ Play it now: https://[your-username].github.io/duoforma/**

## How to play

Fill every cell of the 6×6 grid with a blue circle or a red triangle so that:

1. **No three in a line** — you can't have three of the same shape in a row horizontally or vertically.
2. **Balance** — each row and column has exactly three circles and three triangles.
3. **Signs between cells**:
   - `=` the two cells are the **same** shape.
   - `×` the two cells are **different** shapes.

Every puzzle has exactly one solution and is solvable with logic alone (no guessing).

## Daily puzzle & sharing

Tap **★ Daily** for a fresh puzzle that is the **same for everyone, every day** — it's generated in your browser from a date seed, so no server or account is needed. The difficulty rotates through the week (easy warm-ups, medium mid-week, harder on Thursdays/Fridays).

- **Archive** — use `‹` / `›` (or `←` / `→`) to step through previous days, or open the stats panel and **tap any day in _Recent dailies_** to jump straight to that puzzle and play it. Replaying a past day is **practice**: you can still play and share it, but it never counts toward your daily streak — only completing the puzzle on its own live day builds your streak.
- **Streaks & stats** — the bar-chart icon (top-right) opens your daily stats: games played, current and best streak, fastest time, and a history of recent dailies (each row is tappable to replay that day). Your current streak also shows under the board.
- **Share your time** — after solving the daily, hit **Share your time** (or **Share your results** in the stats panel). On phones this opens the native share sheet; elsewhere it copies a spoiler-free summary to your clipboard so you can post your time and compare with friends:

  ```
  Duoforma Daily #550 ★ Medium
  ⏱ 2:34 · no hints
  🔥 3-day streak
  Beat my time → https://your-site/?daily=2026-07-04
  ```

Everyone playing the same day gets the identical board, so times are directly comparable. Daily results are stored locally in your browser.

The shared link ends with `?daily=YYYY-MM-DD`, so opening it drops your friends straight onto the **★ Daily** tab for that exact day's puzzle. (A bare `?daily` opens today's daily.)

**Controls**

- Click/tap a cell to cycle: empty → circle → triangle → empty.
- Right-click (desktop) or **long-press** (touch) to cycle backwards.
- `←` / `→` change level, `Ctrl/Cmd+Z` undoes.
- Undo / Clear / Hint / Check buttons are below the board.

**Mobile:** the board scales fluidly to the screen, respects the notch/safe areas, and disables pinch/double-tap zoom for reliable tapping. Add it to your home screen for a full-screen experience.

Progress (solved levels + last level per difficulty) is saved in your browser via `localStorage`.

## Run it locally

It's a static site. Because it fetches `levels.json`, open it via a local web server (not `file://`):

```bash
cd duoforma
python3 -m http.server 8000
# then open http://localhost:8000
```

or

```bash
npx serve .
```

## Daily vs. leveled puzzles

The Daily puzzle is generated at play time from a date seed, so it is **never** one of the puzzles from the `levels.json` bank. `getDailyPuzzle` compares each generated board (its given clues + constraint badges) against every bank puzzle and deterministically re-seeds on the astronomically-rare chance of a match, guaranteeing a Daily is never an exact duplicate of a leveled puzzle.

Verify this across many years of dailies (exits non-zero if any Daily equals a bank puzzle):

```bash
node verify-daily.js            # ~10 years of dailies
node verify-daily.js 7300       # ~20 years
```

## Regenerating levels

`levels.json` is produced by a self-contained Node script (no dependencies). It generates a random valid solution, derives constraints, minimizes clues while keeping a **unique** solution, and rates difficulty by the hardest deduction technique required.

```bash
node generate-levels.js 1000            # 1000 puzzles per difficulty (fresh)
node generate-levels.js 500 --append    # keep existing bank and add 500 more per difficulty
node validate-levels.js                 # sanity-check uniqueness & rules (exits non-zero on failure)
```

## Files

- `index.html` / `styles.css` / `game.js` — the game.
- `puzzle-gen.js` — deterministic, seeded in-browser puzzle generator that powers the Daily puzzle (a port of `generate-levels.js`; same seed ⇒ same puzzle in every browser).
- `levels.json` — generated puzzle bank (`{ easy, medium, hard }`).
- `generate-levels.js` — puzzle generator + solver + difficulty rater.
- `validate-levels.js` — verifies every level is valid and uniquely solvable.
- `verify-daily.js` — verifies no Daily puzzle is identical to any leveled puzzle.
