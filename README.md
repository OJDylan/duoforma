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

Tap **⚡ Challenge** for the **Daily Challenge**: four shared puzzles in a row (2 easy → 1 medium → 1 hard) against a single **3:00 countdown**. Clear all four to log a time. Challenge results appear as their own section in the daily leaderboard (separate from the single Daily puzzle).

- **Archive** — use `‹` / `›` (or `←` / `→`) to step through previous days, or open the leaderboard and **tap any day** in _Recent dailies_ or _Recent challenges_ to jump straight to that puzzle/series. Replaying a past day is **practice**: you can still play and share it, but it never counts toward your streak — only completing on the live day builds your streak.
- **Streaks & leaderboard** — the bar-chart icon (top-right) opens the daily leaderboard: Daily stats (played, streaks, fastest) plus a separate **Challenge** section with the same breakdown. Your current streak also shows under the board.
- **Share your time** — after solving, hit **Share your time** (or the share buttons in the leaderboard). On phones this opens the native share sheet; elsewhere it copies a spoiler-free summary to your clipboard:

  ```
  Duoforma Daily #550 ★ Medium
  ⏱ 2:34 · no hints
  🔥 3-day streak
  Beat my time → https://your-site/?daily=2026-07-04
  ```

  ```
  Duoforma Challenge #550 ⚡
  ⏱ 2:41 / 3:00 · 4/4 clear · no hints
  Beat my time → https://your-site/?challenge=2026-07-04
  ```

Everyone playing the same day gets the identical boards, so times are directly comparable. Results are stored locally in your browser.

Shared links end with `?daily=YYYY-MM-DD` or `?challenge=YYYY-MM-DD`, so opening them drops friends straight onto that mode for that exact day. (Bare `?daily` / `?challenge` open today.)

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

The Daily puzzle and Daily Challenge boards are generated at play time from a date seed, so they are **never** one of the puzzles from the `levels.json` bank. Generation compares each board (its given clues + constraint badges) against every bank puzzle and deterministically re-seeds on the astronomically-rare chance of a match.

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
node generate-expert.js 500 --append    # keep existing expert levels and add 500 more (8×8)
node validate-levels.js                 # sanity-check uniqueness & rules (exits non-zero on failure)
```

## Files

- `index.html` / `styles.css` / `game.js` — the game.
- `puzzle-gen.js` — deterministic, seeded in-browser puzzle generator that powers the Daily puzzle (a port of `generate-levels.js`; same seed ⇒ same puzzle in every browser).
- `levels.json` — generated puzzle bank (`{ easy, medium, hard, expert }`).
- `generate-levels.js` — puzzle generator + solver + difficulty rater.
- `generate-expert.js` — 8×8 expert puzzle generator.
- `validate-levels.js` — verifies every level is valid and uniquely solvable.
- `verify-daily.js` — verifies no Daily puzzle is identical to any leveled puzzle.
