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

## Regenerating levels

`levels.json` is produced by a self-contained Node script (no dependencies). It generates a random valid solution, derives constraints, minimizes clues while keeping a **unique** solution, and rates difficulty by the hardest deduction technique required.

```bash
node generate-levels.js 1000            # 1000 puzzles per difficulty (fresh)
node generate-levels.js 500 --append    # keep existing bank and add 500 more per difficulty
node validate-levels.js                 # sanity-check uniqueness & rules (exits non-zero on failure)
```

## Files

- `index.html` / `styles.css` / `game.js` — the game.
- `levels.json` — generated puzzle bank (`{ easy, medium, hard }`).
- `generate-levels.js` — puzzle generator + solver + difficulty rater.
- `validate-levels.js` — verifies every level is valid and uniquely solvable.
