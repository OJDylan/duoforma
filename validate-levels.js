// Validates levels.json: solution obeys rules, givens/constraints match solution, unique solution.
const fs = require("fs");
const N = 6, CELLS = 36;
const LINES = [];
for (let r = 0; r < N; r++) { const a = []; for (let c = 0; c < N; c++) a.push(r * N + c); LINES.push(a); }
for (let c = 0; c < N; c++) { const a = []; for (let r = 0; r < N; r++) a.push(r * N + c); LINES.push(a); }

function solutionValid(s) {
  const g = s.split("").map(Number);
  for (const line of LINES) {
    let z = 0, o = 0;
    for (const i of line) (g[i] === 0 ? z++ : o++);
    if (z !== 3 || o !== 3) return false;
    for (let k = 0; k <= N - 3; k++) if (g[line[k]] === g[line[k + 1]] && g[line[k]] === g[line[k + 2]]) return false;
  }
  return true;
}
function canPlace(grid, pos, v, cmap) {
  const r = (pos / N) | 0, c = pos % N;
  let rc = 0, cc = 0;
  for (let k = 0; k < N; k++) { if (grid[r * N + k] === v) rc++; if (grid[k * N + c] === v) cc++; }
  if (rc >= 3 || cc >= 3) return false;
  grid[pos] = v;
  const ok = (line) => { for (let k = 0; k <= N - 3; k++) { const a = grid[line[k]]; if (a !== -1 && a === grid[line[k + 1]] && a === grid[line[k + 2]]) return false; } return true; };
  let good = ok(LINES[r]) && ok(LINES[N + c]);
  if (good) for (const [o, t] of cmap[pos]) { const ov = grid[o]; if (ov === -1) continue; if (t === 0 && ov !== v) { good = false; break; } if (t === 1 && ov === v) { good = false; break; } }
  grid[pos] = -1;
  return good;
}
function countSolutions(given, constraints, limit = 2) {
  const cmap = Array.from({ length: CELLS }, () => []);
  for (const [a, b, t] of constraints) { cmap[a].push([b, t]); cmap[b].push([a, t]); }
  const grid = Int8Array.from(given);
  let count = 0;
  (function bt(pos) {
    if (count >= limit) return;
    if (pos === CELLS) { count++; return; }
    if (grid[pos] !== -1) { bt(pos + 1); return; }
    for (let v = 0; v < 2; v++) if (canPlace(grid, pos, v, cmap)) { grid[pos] = v; bt(pos + 1); grid[pos] = -1; if (count >= limit) return; }
  })(0);
  return count;
}

const MIN_PER_DIFFICULTY = Number(process.env.MIN_PER_DIFFICULTY || 500);
const data = JSON.parse(fs.readFileSync("levels.json", "utf8"));
let errors = 0, total = 0;
const globalSigs = new Map(); // puzzle signature -> "diff #id" (uniqueness across ALL levels)
for (const diff of ["easy", "medium", "hard"]) {
  if (!Array.isArray(data[diff]) || data[diff].length < MIN_PER_DIFFICULTY) {
    console.log(`${diff}: expected >= ${MIN_PER_DIFFICULTY} levels, found ${data[diff] ? data[diff].length : 0}`);
    errors++;
  }
  const ids = new Set();
  for (const lvl of data[diff]) {
    if (ids.has(lvl.id)) { console.log(`${diff} #${lvl.id}: duplicate id`); errors++; }
    ids.add(lvl.id);
    const sig = lvl.given + "|" + lvl.constraints.map((c) => c.join(",")).join(";");
    if (globalSigs.has(sig)) { console.log(`${diff} #${lvl.id}: duplicate puzzle (same as ${globalSigs.get(sig)})`); errors++; }
    else globalSigs.set(sig, `${diff} #${lvl.id}`);
  }
  for (const lvl of data[diff]) {
    total++;
    // solution valid
    if (!solutionValid(lvl.solution)) { console.log(`${diff} #${lvl.id}: invalid solution`); errors++; continue; }
    // givens match solution
    let bad = false;
    for (let i = 0; i < CELLS; i++) if (lvl.given[i] !== "." && lvl.given[i] !== lvl.solution[i]) bad = true;
    if (bad) { console.log(`${diff} #${lvl.id}: given mismatch`); errors++; continue; }
    // constraints match solution
    for (const [a, b, t] of lvl.constraints) {
      const same = lvl.solution[a] === lvl.solution[b];
      if ((t === 0) !== same) { console.log(`${diff} #${lvl.id}: constraint mismatch`); bad = true; break; }
    }
    if (bad) { errors++; continue; }
    // uniqueness
    const given = lvl.given.split("").map((ch) => (ch === "." ? -1 : Number(ch)));
    const n = countSolutions(given, lvl.constraints, 2);
    if (n !== 1) { console.log(`${diff} #${lvl.id}: ${n} solutions (not unique)`); errors++; }
  }
}
console.log(`Validated ${total} puzzles, ${errors} errors.`);
if (errors > 0) process.exit(1);
