/*
 * Duoforma in-browser puzzle generator.
 *
 * A deterministic, seeded port of generate-levels.js. Given the same seed it
 * always produces the exact same puzzle in every browser / JS engine, which is
 * what makes the "Daily" puzzle identical for everyone on a given day without a
 * backend.
 *
 * Board: 6x6. Symbols: 0 = blue circle, 1 = red triangle.
 * Rules mirror the main game (no three in a line, balanced rows/cols,
 * = / x constraints). Every generated puzzle has a unique solution.
 *
 * Exposes:  DuoformaGen.generate(seed, targetTier) -> { given, solution, constraints, tier }
 *   given/solution: 36-char strings of "0" / "1" (given also uses "." for blanks)
 *   constraints: [[a, b, t], ...]  (t: 0 = "=", 1 = "x")
 *
 * Works both as a browser global (window.DuoformaGen) and a CommonJS module
 * (require) so the same logic can be unit-tested under Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DuoformaGen = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const N = 6;
  const CELLS = N * N;

  // ---------- seeded RNG (mulberry32) ----------
  // Integer-only math keeps the sequence identical across every JS engine.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Hash an arbitrary string (e.g. a date) into a 32-bit seed.
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // ---------- line helpers ----------
  const LINES = [];
  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) row.push(r * N + c);
    LINES.push(row);
  }
  for (let c = 0; c < N; c++) {
    const col = [];
    for (let r = 0; r < N; r++) col.push(r * N + c);
    LINES.push(col);
  }

  const ADJ_PAIRS = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      if (c + 1 < N) ADJ_PAIRS.push([i, i + 1]);
      if (r + 1 < N) ADJ_PAIRS.push([i, i + N]);
    }
  }

  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- full solution generator ----------
  function canPlaceRaw(grid, pos, v) {
    const r = (pos / N) | 0;
    const c = pos % N;
    let rc = 0, cc = 0;
    for (let k = 0; k < N; k++) {
      if (grid[r * N + k] === v) rc++;
      if (grid[k * N + c] === v) cc++;
    }
    if (rc >= 3 || cc >= 3) return false;
    grid[pos] = v;
    const okLine = (line) => {
      for (let k = 0; k <= N - 3; k++) {
        const a = grid[line[k]];
        if (a !== -1 && a === grid[line[k + 1]] && a === grid[line[k + 2]]) return false;
      }
      return true;
    };
    const good = okLine(LINES[r]) && okLine(LINES[N + c]);
    grid[pos] = -1;
    return good;
  }

  function generateSolution(rng) {
    const grid = new Int8Array(CELLS).fill(-1);
    const order = [];
    for (let i = 0; i < CELLS; i++) order.push(i);
    function bt(k) {
      if (k === CELLS) return true;
      const pos = order[k];
      const vals = rng() < 0.5 ? [0, 1] : [1, 0];
      for (const v of vals) {
        if (canPlaceRaw(grid, pos, v)) {
          grid[pos] = v;
          if (bt(k + 1)) return true;
          grid[pos] = -1;
        }
      }
      return false;
    }
    return bt(0) ? grid : null;
  }

  // ---------- uniqueness solver ----------
  function buildConstraintMap(constraints) {
    const map = [];
    for (let i = 0; i < CELLS; i++) map.push([]);
    for (const [a, b, t] of constraints) {
      map[a].push([b, t]);
      map[b].push([a, t]);
    }
    return map;
  }

  function canPlaceSolve(grid, pos, v, cmap) {
    const r = (pos / N) | 0;
    const c = pos % N;
    let rc = 0, cc = 0;
    for (let k = 0; k < N; k++) {
      if (grid[r * N + k] === v) rc++;
      if (grid[k * N + c] === v) cc++;
    }
    if (rc >= 3 || cc >= 3) return false;
    grid[pos] = v;
    const okLine = (line) => {
      for (let k = 0; k <= N - 3; k++) {
        const a = grid[line[k]];
        if (a !== -1 && a === grid[line[k + 1]] && a === grid[line[k + 2]]) return false;
      }
      return true;
    };
    let good = okLine(LINES[r]) && okLine(LINES[N + c]);
    if (good) {
      for (const [other, t] of cmap[pos]) {
        const ov = grid[other];
        if (ov === -1) continue;
        if (t === 0 && ov !== v) { good = false; break; }
        if (t === 1 && ov === v) { good = false; break; }
      }
    }
    grid[pos] = -1;
    return good;
  }

  function countSolutions(given, constraints, limit) {
    limit = limit || 2;
    const cmap = buildConstraintMap(constraints);
    const grid = Int8Array.from(given);
    let count = 0;
    function bt(pos) {
      if (count >= limit) return;
      if (pos === CELLS) { count++; return; }
      if (grid[pos] !== -1) { bt(pos + 1); return; }
      for (let v = 0; v < 2; v++) {
        if (canPlaceSolve(grid, pos, v, cmap)) {
          grid[pos] = v;
          bt(pos + 1);
          grid[pos] = -1;
          if (count >= limit) return;
        }
      }
    }
    bt(0);
    return count;
  }

  // ---------- logic solver (human techniques, tiered) ----------
  function lineFeasibleWith(vals, fixIndex, fixVal) {
    const arr = vals.slice();
    if (fixIndex >= 0) {
      if (arr[fixIndex] !== -1 && arr[fixIndex] !== fixVal) return false;
      arr[fixIndex] = fixVal;
    }
    const unknown = [];
    for (let i = 0; i < N; i++) if (arr[i] === -1) unknown.push(i);
    const total = 1 << unknown.length;
    for (let m = 0; m < total; m++) {
      for (let b = 0; b < unknown.length; b++) arr[unknown[b]] = (m >> b) & 1;
      let ones = 0;
      for (let i = 0; i < N; i++) ones += arr[i];
      if (ones !== 3) continue;
      let bad = false;
      for (let k = 0; k <= N - 3; k++) {
        if (arr[k] === arr[k + 1] && arr[k] === arr[k + 2]) { bad = true; break; }
      }
      if (!bad) return true;
    }
    return false;
  }

  function propagate(grid, cmap, maxTier) {
    let changed = true;
    const set = (i, v) => {
      if (grid[i] === -1) { grid[i] = v; changed = true; return true; }
      return grid[i] === v;
    };
    while (changed) {
      changed = false;
      for (let i = 0; i < CELLS; i++) {
        if (grid[i] === -1) continue;
        for (const [other, t] of cmap[i]) {
          if (grid[other] !== -1) continue;
          const need = t === 0 ? grid[i] : 1 - grid[i];
          if (!set(other, need)) return "contradiction";
        }
      }
      for (const line of LINES) {
        const vals = [grid[line[0]], grid[line[1]], grid[line[2]], grid[line[3]], grid[line[4]], grid[line[5]]];
        for (let k = 0; k <= N - 3; k++) {
          const a = vals[k], b = vals[k + 1], c = vals[k + 2];
          const known = (a !== -1) + (b !== -1) + (c !== -1);
          if (known !== 2) continue;
          if (a !== -1 && b !== -1 && a === b && c === -1) { if (!set(line[k + 2], 1 - a)) return "contradiction"; vals[k + 2] = 1 - a; }
          else if (b !== -1 && c !== -1 && b === c && a === -1) { if (!set(line[k], 1 - b)) return "contradiction"; vals[k] = 1 - b; }
          else if (a !== -1 && c !== -1 && a === c && b === -1) { if (!set(line[k + 1], 1 - a)) return "contradiction"; vals[k + 1] = 1 - a; }
        }
        let z = 0, o = 0;
        for (let i = 0; i < N; i++) { if (vals[i] === 0) z++; else if (vals[i] === 1) o++; }
        if (z > 3 || o > 3) return "contradiction";
        if (z === 3 && z + o < N) { for (let i = 0; i < N; i++) if (vals[i] === -1) { if (!set(line[i], 1)) return "contradiction"; vals[i] = 1; } }
        if (o === 3 && z + o < N) { for (let i = 0; i < N; i++) if (vals[i] === -1) { if (!set(line[i], 0)) return "contradiction"; vals[i] = 0; } }
        if (maxTier >= 1) {
          for (let i = 0; i < N; i++) {
            if (vals[i] !== -1) continue;
            const can0 = lineFeasibleWith(vals, i, 0);
            const can1 = lineFeasibleWith(vals, i, 1);
            if (!can0 && !can1) return "contradiction";
            if (!can0) { if (!set(line[i], 1)) return "contradiction"; vals[i] = 1; }
            else if (!can1) { if (!set(line[i], 0)) return "contradiction"; vals[i] = 0; }
          }
        }
      }
    }
    return "ok";
  }

  function isFull(grid) {
    for (let i = 0; i < CELLS; i++) if (grid[i] === -1) return false;
    return true;
  }

  function minTierToSolve(given, constraints) {
    const cmap = buildConstraintMap(constraints);
    for (const tier of [0, 1]) {
      const grid = Int8Array.from(given);
      if (propagate(grid, cmap, tier) === "ok" && isFull(grid)) return tier;
    }
    const grid = Int8Array.from(given);
    if (propagate(grid, cmap, 1) === "contradiction") return 3;
    let guard = 0;
    while (!isFull(grid)) {
      if (guard++ > CELLS * 2) return 3;
      let progressed = false;
      for (let i = 0; i < CELLS && !progressed; i++) {
        if (grid[i] !== -1) continue;
        let bad = -1;
        for (let v = 0; v < 2; v++) {
          const test = Int8Array.from(grid);
          test[i] = v;
          if (propagate(test, cmap, 1) === "contradiction") bad = v;
        }
        if (bad !== -1) {
          grid[i] = 1 - bad;
          if (propagate(grid, cmap, 1) === "contradiction") return 3;
          progressed = true;
        }
      }
      if (!progressed) return 3;
    }
    return 2;
  }

  // ---------- puzzle construction ----------
  function solutionConstraints(sol) {
    return ADJ_PAIRS.map(([a, b]) => [a, b, sol[a] === sol[b] ? 0 : 1]);
  }

  function minimalGivens(sol, constraints, maxTier, rng) {
    const given = Int8Array.from(sol);
    for (const i of shuffle([...Array(CELLS).keys()], rng)) {
      const keep = given[i];
      given[i] = -1;
      const ok = countSolutions(given, constraints, 2) === 1 &&
        (maxTier == null || minTierToSolve(given, constraints) <= maxTier);
      if (!ok) given[i] = keep;
    }
    return given;
  }

  function minimalGivens2(given, sol, constraints, maxTier, rng) {
    const g = Int8Array.from(given);
    for (const i of shuffle([...Array(CELLS).keys()], rng)) {
      if (g[i] === -1) continue;
      const keep = g[i];
      g[i] = -1;
      const ok = countSolutions(g, constraints, 2) === 1 && minTierToSolve(g, constraints) <= maxTier;
      if (!ok) g[i] = keep;
    }
    return g;
  }

  function buildPuzzle(targetTier, rng) {
    const sol = generateSolution(rng);
    if (!sol) return null;
    const allC = solutionConstraints(sol);

    let range;
    if (targetTier === 0) range = [9, 15];
    else if (targetTier === 1) range = [4, 9];
    else range = [0, 4];
    const nC = range[0] + ((rng() * (range[1] - range[0] + 1)) | 0);
    const constraints = shuffle(allC.slice(), rng).slice(0, nC).map((x) => x.slice());

    let given = minimalGivens(sol, constraints, null, rng);
    if (countSolutions(given, constraints, 2) !== 1) return null;
    let tier = minTierToSolve(given, constraints);

    if (targetTier === 0) {
      let guard = 0;
      while (tier > 0 && guard++ < CELLS) {
        const hidden = [];
        for (let i = 0; i < CELLS; i++) if (given[i] === -1) hidden.push(i);
        if (!hidden.length) break;
        const i = hidden[(rng() * hidden.length) | 0];
        given[i] = sol[i];
        tier = minTierToSolve(given, constraints);
      }
      if (tier !== 0) return null;
      given = minimalGivens2(given, sol, constraints, 0, rng);
      tier = minTierToSolve(given, constraints);
      if (tier !== 0) return null;
    } else if (targetTier === 1) {
      let guard = 0;
      while (tier < 1 && guard++ < CELLS) {
        const shown = [];
        for (let i = 0; i < CELLS; i++) if (given[i] !== -1) shown.push(i);
        shuffle(shown, rng);
        let raised = false;
        for (const i of shown) {
          const keep = given[i];
          given[i] = -1;
          if (countSolutions(given, constraints, 2) === 1) {
            const nt = minTierToSolve(given, constraints);
            if (nt <= 2) { tier = nt; raised = true; break; }
          }
          given[i] = keep;
        }
        if (!raised) break;
      }
      guard = 0;
      while (tier > 1 && guard++ < CELLS) {
        const hidden = [];
        for (let i = 0; i < CELLS; i++) if (given[i] === -1) hidden.push(i);
        if (!hidden.length) break;
        const i = hidden[(rng() * hidden.length) | 0];
        given[i] = sol[i];
        tier = minTierToSolve(given, constraints);
      }
      if (tier !== 1) return null;
    } else {
      // Daily puzzles must be solvable with logic alone, so require exactly
      // tier 2 (one-level look-ahead) and reject tier 3 (needs guessing).
      if (tier !== 2) return null;
    }

    if (countSolutions(given, constraints, 2) !== 1) return null;
    return { given, constraints, sol, tier };
  }

  function encode(puzzle) {
    let given = "";
    for (let i = 0; i < CELLS; i++) given += puzzle.given[i] === -1 ? "." : String(puzzle.given[i]);
    let solution = "";
    for (let i = 0; i < CELLS; i++) solution += String(puzzle.sol[i]);
    return {
      given,
      solution,
      constraints: puzzle.constraints.map(([a, b, t]) => [a, b, t]),
      tier: puzzle.tier,
    };
  }

  // Generate a puzzle for a given seed and target difficulty tier (0/1/2).
  // Deterministic: the same (seed, targetTier) always yields the same puzzle.
  function generate(seed, targetTier) {
    if (targetTier == null) targetTier = 1;
    const rng = mulberry32(typeof seed === "number" ? seed : hashSeed(seed));
    let guard = 0;
    while (guard++ < 20000) {
      const p = buildPuzzle(targetTier, rng);
      if (p) return encode(p);
    }
    return null;
  }

  return { generate, hashSeed, mulberry32, N };
});
