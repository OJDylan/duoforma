/*
 * Duoforma puzzle generator.
 *
 * Board: 6x6. Two symbols: 0 = blue circle, 1 = red triangle.
 * Rules:
 *   1. No three identical symbols consecutively in any row or column.
 *   2. Every row and every column contains exactly three of each symbol.
 *   3. Cells joined by "=" must match; cells joined by "x" must differ.
 *
 * Difficulty is rated by the hardest human deduction technique required:
 *   tier 0 (easy)   : direct forced moves (triple rule, line balance, constraints)
 *   tier 1 (medium) : single-line feasibility deductions
 *   tier 2 (hard)   : one-level look-ahead (hypothetical) reasoning
 *
 * Output: levels.json => { easy: [...], medium: [...], hard: [...] }
 * Each level: { id, given: "36 chars of 0/1/.", constraints: [[a,b,t]], solution: "36 chars" }
 *   constraint t: 0 = equal ("="), 1 = different ("x")
 */

const fs = require("fs");

const N = 6;
const CELLS = N * N;
const PER_DIFFICULTY = Number(process.argv[2] || 500);

// ---------- line helpers ----------
const LINES = []; // 12 lines, each an array of 6 cell indices
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
// which two lines each cell belongs to
const CELL_LINES = [];
for (let i = 0; i < CELLS; i++) CELL_LINES.push([]);
LINES.forEach((line, li) => line.forEach((idx) => CELL_LINES[idx].push(li)));

// all adjacent pairs (for building constraints)
const ADJ_PAIRS = [];
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    const i = r * N + c;
    if (c + 1 < N) ADJ_PAIRS.push([i, i + 1]);
    if (r + 1 < N) ADJ_PAIRS.push([i, i + N]);
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- full solution generator ----------
function canPlaceRaw(grid, pos, v) {
  const r = (pos / N) | 0;
  const c = pos % N;
  // row / col counts
  let rc = 0;
  let cc = 0;
  for (let k = 0; k < N; k++) {
    if (grid[r * N + k] === v) rc++;
    if (grid[k * N + c] === v) cc++;
  }
  if (rc >= 3 || cc >= 3) return false; // would exceed 3 after placing (grid[pos] not yet set)
  // no three in a row (horizontal), windows containing c
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

function generateSolution() {
  const grid = new Int8Array(CELLS).fill(-1);
  const order = [];
  for (let i = 0; i < CELLS; i++) order.push(i);
  function bt(k) {
    if (k === CELLS) return true;
    const pos = order[k];
    const vals = Math.random() < 0.5 ? [0, 1] : [1, 0];
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

// ---------- uniqueness solver (backtracking, counts up to 2) ----------
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
  let rc = 0;
  let cc = 0;
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

function countSolutions(given, constraints, limit = 2) {
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
// enumerate whether a single line's unknowns can be completed (balance + no-three)
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
    if (!bad) { for (const u of unknown) arr[u] = -1; return true; }
  }
  for (const u of unknown) arr[u] = -1;
  return false;
}

// Propagate forced moves up to maxTier (0 or 1). Returns "contradiction" | "ok".
function propagate(grid, cmap, maxTier) {
  let changed = true;
  const set = (i, v) => {
    if (grid[i] === -1) { grid[i] = v; changed = true; return true; }
    return grid[i] === v; // false means contradiction
  };
  while (changed) {
    changed = false;
    // constraint propagation (tier 0)
    for (let i = 0; i < CELLS; i++) {
      if (grid[i] === -1) continue;
      for (const [other, t] of cmap[i]) {
        if (grid[other] !== -1) continue;
        const need = t === 0 ? grid[i] : 1 - grid[i];
        if (!set(other, need)) return "contradiction";
      }
    }
    // line techniques
    for (const line of LINES) {
      const vals = [grid[line[0]], grid[line[1]], grid[line[2]], grid[line[3]], grid[line[4]], grid[line[5]]];
      // tier 0: triple rule
      for (let k = 0; k <= N - 3; k++) {
        const a = vals[k], b = vals[k + 1], c = vals[k + 2];
        const known = (a !== -1) + (b !== -1) + (c !== -1);
        if (known !== 2) continue;
        if (a !== -1 && b !== -1 && a === b && c === -1) { if (!set(line[k + 2], 1 - a)) return "contradiction"; vals[k + 2] = 1 - a; }
        else if (b !== -1 && c !== -1 && b === c && a === -1) { if (!set(line[k], 1 - b)) return "contradiction"; vals[k] = 1 - b; }
        else if (a !== -1 && c !== -1 && a === c && b === -1) { if (!set(line[k + 1], 1 - a)) return "contradiction"; vals[k + 1] = 1 - a; }
      }
      // tier 0: line balance
      let z = 0, o = 0;
      for (let i = 0; i < N; i++) { if (vals[i] === 0) z++; else if (vals[i] === 1) o++; }
      if (z > 3 || o > 3) return "contradiction";
      if (z === 3 && z + o < N) { for (let i = 0; i < N; i++) if (vals[i] === -1) { if (!set(line[i], 1)) return "contradiction"; vals[i] = 1; } }
      if (o === 3 && z + o < N) { for (let i = 0; i < N; i++) if (vals[i] === -1) { if (!set(line[i], 0)) return "contradiction"; vals[i] = 0; } }
      // tier 1: single-line feasibility
      if (maxTier >= 1) {
        if (!lineFeasibleWith(vals, -1, 0) && z + o === N) { /* full line, verify below */ }
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

function consistent(grid, cmap) {
  for (const line of LINES) {
    const vals = line.map((i) => grid[i]);
    if (!lineFeasibleWith(vals, -1, 0)) return false;
  }
  for (let i = 0; i < CELLS; i++) {
    if (grid[i] === -1) continue;
    for (const [other, t] of cmap[i]) {
      if (grid[other] === -1) continue;
      if (t === 0 && grid[other] !== grid[i]) return false;
      if (t === 1 && grid[other] === grid[i]) return false;
    }
  }
  return true;
}

// Returns the minimum tier (0,1,2) needed to fully solve, or 3 if not solvable by these techniques.
function minTierToSolve(given, constraints) {
  const cmap = buildConstraintMap(constraints);
  // tier 0 and 1
  for (const tier of [0, 1]) {
    const grid = Int8Array.from(given);
    if (propagate(grid, cmap, tier) === "ok" && isFull(grid)) return tier;
  }
  // tier 2: one-level look-ahead using tier-1 propagation
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
    if (!progressed) return 3; // needs deeper guessing
  }
  return 2;
}

// ---------- puzzle construction ----------
function solutionConstraints(sol) {
  return ADJ_PAIRS.map(([a, b]) => [a, b, sol[a] === sol[b] ? 0 : 1]);
}

function minimalGivens(sol, constraints, maxTier) {
  // start from full board, remove cells while unique AND solvable within maxTier
  const given = Int8Array.from(sol);
  for (const i of shuffle([...Array(CELLS).keys()])) {
    const keep = given[i];
    given[i] = -1;
    const ok = countSolutions(given, constraints, 2) === 1 &&
      (maxTier == null || minTierToSolve(given, constraints) <= maxTier);
    if (!ok) given[i] = keep;
  }
  return given;
}

function countGiven(given) {
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (given[i] !== -1) n++;
  return n;
}

// try to build a puzzle of a target difficulty; return puzzle or null
function buildPuzzle(targetTier) {
  const sol = generateSolution();
  if (!sol) return null;
  const allC = solutionConstraints(sol);

  let range;
  if (targetTier === 0) range = [9, 15];
  else if (targetTier === 1) range = [4, 9];
  else range = [0, 4];
  const nC = range[0] + ((Math.random() * (range[1] - range[0] + 1)) | 0);
  const constraints = shuffle(allC.slice()).slice(0, nC).map((x) => x.slice());

  // minimal givens (no tier restriction yet) => usually a hard puzzle
  let given = minimalGivens(sol, constraints, null);
  if (countSolutions(given, constraints, 2) !== 1) return null;
  let tier = minTierToSolve(given, constraints);

  if (targetTier === 0) {
    // make easier: reveal cells until tier 0
    let guard = 0;
    while (tier > 0 && guard++ < CELLS) {
      const hidden = [];
      for (let i = 0; i < CELLS; i++) if (given[i] === -1) hidden.push(i);
      if (!hidden.length) break;
      const i = hidden[(Math.random() * hidden.length) | 0];
      given[i] = sol[i];
      tier = minTierToSolve(given, constraints);
    }
    if (tier !== 0) return null;
    given = minimalGivens2(given, sol, constraints, 0); // trim redundant while staying tier 0
    tier = minTierToSolve(given, constraints);
    if (tier !== 0) return null;
  } else if (targetTier === 1) {
    // ensure not trivially tier 0: if tier 0, hide a cell to raise difficulty
    let guard = 0;
    while (tier < 1 && guard++ < CELLS) {
      const shown = [];
      for (let i = 0; i < CELLS; i++) if (given[i] !== -1) shown.push(i);
      shuffle(shown);
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
    // if we overshot to tier 2+, reveal until tier <=1
    guard = 0;
    while (tier > 1 && guard++ < CELLS) {
      const hidden = [];
      for (let i = 0; i < CELLS; i++) if (given[i] === -1) hidden.push(i);
      if (!hidden.length) break;
      const i = hidden[(Math.random() * hidden.length) | 0];
      given[i] = sol[i];
      tier = minTierToSolve(given, constraints);
    }
    if (tier !== 1) return null;
  } else {
    // hard: want tier >= 2
    if (tier < 2) return null;
    // tier 3 (needs guessing) is acceptable but prefer 2; keep as is
  }

  if (countSolutions(given, constraints, 2) !== 1) return null;
  return { given, constraints, sol, tier };
}

// trim redundant givens while keeping unique and tier <= maxTier
function minimalGivens2(given, sol, constraints, maxTier) {
  const g = Int8Array.from(given);
  for (const i of shuffle([...Array(CELLS).keys()])) {
    if (g[i] === -1) continue;
    const keep = g[i];
    g[i] = -1;
    const ok = countSolutions(g, constraints, 2) === 1 && minTierToSolve(g, constraints) <= maxTier;
    if (!ok) g[i] = keep;
  }
  return g;
}

// ---------- encode ----------
function encode(puzzle, id) {
  let given = "";
  for (let i = 0; i < CELLS; i++) given += puzzle.given[i] === -1 ? "." : String(puzzle.given[i]);
  let solution = "";
  for (let i = 0; i < CELLS; i++) solution += String(puzzle.sol[i]);
  return {
    id,
    given,
    solution,
    constraints: puzzle.constraints.map(([a, b, t]) => [a, b, t]),
  };
}

// ---------- main ----------
// Usage:
//   node generate-levels.js <n>              generate <n> levels/difficulty from scratch
//   node generate-levels.js <n> --append     keep existing levels.json and add <n> more/difficulty
const APPEND = process.argv.includes("--append");
const signature = (enc) => enc.given + "|" + enc.constraints.map((c) => c.join(",")).join(";");

const targets = [
  ["easy", 0],
  ["medium", 1],
  ["hard", 2],
];
const out = { easy: [], medium: [], hard: [] };
const seen = { easy: new Set(), medium: new Set(), hard: new Set() };

if (APPEND) {
  const prev = JSON.parse(fs.readFileSync("levels.json", "utf8"));
  for (const [name] of targets) {
    out[name] = prev[name].slice();
    for (const lvl of prev[name]) seen[name].add(signature(lvl));
  }
  console.log(
    `Appending ${PER_DIFFICULTY} to existing (easy=${out.easy.length}, medium=${out.medium.length}, hard=${out.hard.length}).`
  );
}

const start = Date.now();
for (const [name, tier] of targets) {
  const target = out[name].length + PER_DIFFICULTY;
  let attempts = 0;
  while (out[name].length < target) {
    attempts++;
    const p = buildPuzzle(tier);
    if (!p) continue;
    const enc = encode(p, out[name].length + 1);
    const sig = signature(enc);
    if (seen[name].has(sig)) continue;
    seen[name].add(sig);
    out[name].push(enc);
    if (out[name].length % 50 === 0) {
      process.stdout.write(
        `  ${name}: ${out[name].length}/${target} (attempts ${attempts}, ${((Date.now() - start) / 1000).toFixed(1)}s)\n`
      );
    }
  }
  console.log(`Done ${name}: ${out[name].length} puzzles in ${attempts} attempts.`);
}

fs.writeFileSync("levels.json", JSON.stringify(out));
const kb = (fs.statSync("levels.json").size / 1024).toFixed(1);
console.log(`\nWrote levels.json (${kb} KB) in ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(`Counts: easy=${out.easy.length}, medium=${out.medium.length}, hard=${out.hard.length}`);
