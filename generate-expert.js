/*
 * Expert puzzle generator — 8x8 variant of generate-levels.js.
 *
 * Board: 8x8. Rules match the 6x6 game but scaled:
 *   1. No three identical symbols consecutively in any row or column.
 *   2. Every row and every column contains exactly four of each symbol.
 *   3. Cells joined by "=" must match; cells joined by "x" must differ.
 *
 * Produces "very hard" puzzles (tier >= 2: require look-ahead reasoning) with a
 * unique solution, then writes them to levels.json under the "expert" key.
 *
 * Usage:
 *   node generate-expert.js [count]              generate [count] expert levels from scratch
 *   node generate-expert.js [count] --append     keep existing expert levels and add [count] more
 * Default count: 500
 */

const fs = require("fs");

const N = 8;
const CELLS = N * N;
const HALF = N / 2;
const APPEND = process.argv.includes("--append");
const COUNT = Number(process.argv.filter((a) => a !== "--append")[2] || 500);

const LINES = [];
for (let r = 0; r < N; r++) { const row = []; for (let c = 0; c < N; c++) row.push(r * N + c); LINES.push(row); }
for (let c = 0; c < N; c++) { const col = []; for (let r = 0; r < N; r++) col.push(r * N + c); LINES.push(col); }

const ADJ = [];
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const i = r * N + c;
  if (c + 1 < N) ADJ.push([i, i + 1]);
  if (r + 1 < N) ADJ.push([i, i + N]);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function okLine(grid, line) {
  for (let k = 0; k <= N - 3; k++) {
    const a = grid[line[k]];
    if (a !== -1 && a === grid[line[k + 1]] && a === grid[line[k + 2]]) return false;
  }
  return true;
}

function canPlaceRaw(grid, pos, v) {
  const r = (pos / N) | 0, c = pos % N;
  let rc = 0, cc = 0;
  for (let k = 0; k < N; k++) { if (grid[r * N + k] === v) rc++; if (grid[k * N + c] === v) cc++; }
  if (rc >= HALF || cc >= HALF) return false;
  grid[pos] = v;
  const good = okLine(grid, LINES[r]) && okLine(grid, LINES[N + c]);
  grid[pos] = -1;
  return good;
}

function generateSolution() {
  const grid = new Int8Array(CELLS).fill(-1);
  const order = [...Array(CELLS).keys()];
  function bt(k) {
    if (k === CELLS) return true;
    const pos = order[k];
    const vals = Math.random() < 0.5 ? [0, 1] : [1, 0];
    for (const v of vals) {
      if (canPlaceRaw(grid, pos, v)) { grid[pos] = v; if (bt(k + 1)) return true; grid[pos] = -1; }
    }
    return false;
  }
  return bt(0) ? grid : null;
}

function buildCmap(cons) {
  const m = [];
  for (let i = 0; i < CELLS; i++) m.push([]);
  for (const [a, b, t] of cons) { m[a].push([b, t]); m[b].push([a, t]); }
  return m;
}

function canPlaceSolve(grid, pos, v, cmap) {
  const r = (pos / N) | 0, c = pos % N;
  let rc = 0, cc = 0;
  for (let k = 0; k < N; k++) { if (grid[r * N + k] === v) rc++; if (grid[k * N + c] === v) cc++; }
  if (rc >= HALF || cc >= HALF) return false;
  grid[pos] = v;
  let good = okLine(grid, LINES[r]) && okLine(grid, LINES[N + c]);
  if (good) {
    for (const [o, t] of cmap[pos]) {
      const ov = grid[o];
      if (ov === -1) continue;
      if (t === 0 && ov !== v) { good = false; break; }
      if (t === 1 && ov === v) { good = false; break; }
    }
  }
  grid[pos] = -1;
  return good;
}

function countSolutions(given, cons, limit = 2) {
  const cmap = buildCmap(cons);
  const grid = Int8Array.from(given);
  let count = 0;
  function bt(pos) {
    if (count >= limit) return;
    if (pos === CELLS) { count++; return; }
    if (grid[pos] !== -1) { bt(pos + 1); return; }
    for (let v = 0; v < 2; v++) {
      if (canPlaceSolve(grid, pos, v, cmap)) { grid[pos] = v; bt(pos + 1); grid[pos] = -1; if (count >= limit) return; }
    }
  }
  bt(0);
  return count;
}

function lineFeasibleWith(vals, fixIndex, fixVal) {
  const arr = vals.slice();
  if (fixIndex >= 0) { if (arr[fixIndex] !== -1 && arr[fixIndex] !== fixVal) return false; arr[fixIndex] = fixVal; }
  const unknown = [];
  for (let i = 0; i < N; i++) if (arr[i] === -1) unknown.push(i);
  const total = 1 << unknown.length;
  for (let m = 0; m < total; m++) {
    for (let b = 0; b < unknown.length; b++) arr[unknown[b]] = (m >> b) & 1;
    let ones = 0;
    for (let i = 0; i < N; i++) ones += arr[i];
    if (ones !== HALF) continue;
    let bad = false;
    for (let k = 0; k <= N - 3; k++) { if (arr[k] === arr[k + 1] && arr[k] === arr[k + 2]) { bad = true; break; } }
    if (!bad) { return true; }
  }
  return false;
}

function propagate(grid, cmap, maxTier) {
  let changed = true;
  const set = (i, v) => { if (grid[i] === -1) { grid[i] = v; changed = true; return true; } return grid[i] === v; };
  while (changed) {
    changed = false;
    for (let i = 0; i < CELLS; i++) {
      if (grid[i] === -1) continue;
      for (const [o, t] of cmap[i]) {
        if (grid[o] !== -1) continue;
        const need = t === 0 ? grid[i] : 1 - grid[i];
        if (!set(o, need)) return "contradiction";
      }
    }
    for (const line of LINES) {
      const vals = line.map((i) => grid[i]);
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
      if (z > HALF || o > HALF) return "contradiction";
      if (z === HALF && z + o < N) { for (let i = 0; i < N; i++) if (vals[i] === -1) { if (!set(line[i], 1)) return "contradiction"; vals[i] = 1; } }
      if (o === HALF && z + o < N) { for (let i = 0; i < N; i++) if (vals[i] === -1) { if (!set(line[i], 0)) return "contradiction"; vals[i] = 0; } }
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

function isFull(grid) { for (let i = 0; i < CELLS; i++) if (grid[i] === -1) return false; return true; }

function minTierToSolve(given, cons) {
  const cmap = buildCmap(cons);
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

function solutionConstraints(sol) { return ADJ.map(([a, b]) => [a, b, sol[a] === sol[b] ? 0 : 1]); }

function minimalGivens(sol, cons) {
  const given = Int8Array.from(sol);
  for (const i of shuffle([...Array(CELLS).keys()])) {
    const keep = given[i];
    given[i] = -1;
    if (countSolutions(given, cons, 2) !== 1) given[i] = keep;
  }
  return given;
}

function buildPuzzle() {
  const sol = generateSolution();
  if (!sol) return null;
  const allC = solutionConstraints(sol);
  const nC = 3 + ((Math.random() * 8) | 0); // 3..10 constraints
  const cons = shuffle(allC.slice()).slice(0, nC).map((x) => x.slice());
  const given = minimalGivens(sol, cons);
  if (countSolutions(given, cons, 2) !== 1) return null;
  const tier = minTierToSolve(given, cons);
  return { given, cons, sol, tier };
}

function encode(p, id) {
  let given = "";
  for (let i = 0; i < CELLS; i++) given += p.given[i] === -1 ? "." : String(p.given[i]);
  let solution = "";
  for (let i = 0; i < CELLS; i++) solution += String(p.sol[i]);
  return { id, given, solution, constraints: p.cons.map(([a, b, t]) => [a, b, t]) };
}

// ---------- main ----------
const signature = (enc) => enc.given + "|" + enc.constraints.map((c) => c.join(",")).join(";");
const data = JSON.parse(fs.readFileSync("levels.json", "utf8"));
const out = [];
const seen = new Set();

if (APPEND) {
  out.push(...(data.expert || []));
  for (const lvl of out) seen.add(signature(lvl));
  console.log(`Appending ${COUNT} to existing expert (${out.length} already).`);
}

const target = APPEND ? out.length + COUNT : COUNT;
let attempts = 0;
const start = Date.now();
while (out.length < target) {
  attempts++;
  const p = buildPuzzle();
  if (!p) continue;
  if (p.tier < 2) continue; // require look-ahead → "very hard"
  const enc = encode(p, out.length + 1);
  const sig = signature(enc);
  if (seen.has(sig)) continue;
  seen.add(sig);
  out.push(enc);
  if (out.length % 50 === 0 || out.length === target) {
    const givens = enc.given.replace(/\./g, "").length;
    console.log(
      `expert ${out.length}/${target}: tier=${p.tier} givens=${givens} constraints=${enc.constraints.length} (attempts ${attempts}, ${((Date.now() - start) / 1000).toFixed(1)}s)`
    );
  }
}
if (!out.length) { console.error("Failed to generate any expert puzzle."); process.exit(1); }
data.expert = out;
fs.writeFileSync("levels.json", JSON.stringify(data));
console.log(`Wrote ${out.length} expert puzzle(s) to levels.json in ${((Date.now() - start) / 1000).toFixed(1)}s.`);
