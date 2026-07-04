// Verifies the Daily puzzles are never identical to any leveled (bank) puzzle.
//
// A puzzle's identity is its starting board: the given clues plus the set of
// constraint badges (order-independent). This mirrors getDailyPuzzle() in
// game.js, including the deterministic salted-reseed fallback, so the check
// reflects exactly what players get.
//
// Usage: node verify-daily.js [days]   (default: 3660 ≈ 10 years)
//        exits non-zero if any Daily collides with a bank puzzle.
const fs = require("fs");
const gen = require("./puzzle-gen.js");

const DAILY_EPOCH = "2025-01-01";
const DAILY_ROTATION = [1, 0, 1, 1, 2, 2, 1]; // by weekday (0 = Sunday)

function parseDateStr(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateToStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function dateStrForDay(offset) {
  const t = parseDateStr(DAILY_EPOCH);
  t.setDate(t.getDate() + offset);
  return dateToStr(t);
}
function dailyTierFor(dateStr) {
  return DAILY_ROTATION[parseDateStr(dateStr).getDay()];
}

function puzzleSignature(given, constraints) {
  const cons = constraints
    .map((c) => Math.min(c[0], c[1]) + "," + Math.max(c[0], c[1]) + "," + c[2])
    .sort()
    .join("|");
  return given + "#" + cons;
}

// Same salted-reseed logic as game.js getDailyPuzzle().
function dailyPuzzle(dateStr, bank) {
  const tier = dailyTierFor(dateStr);
  let p = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    const seed = "duoforma-daily-" + dateStr + (attempt ? "-v" + attempt : "");
    const cand = gen.generate(seed, tier);
    if (!cand) break;
    p = cand;
    if (!bank.has(puzzleSignature(cand.given, cand.constraints))) break;
  }
  return p;
}

const DAYS = Number(process.argv[2] || 3660);
const data = JSON.parse(fs.readFileSync("levels.json", "utf8"));

const bank = new Set();
let bankCount = 0;
for (const diff of Object.keys(data)) {
  for (const lv of data[diff]) {
    bank.add(puzzleSignature(lv.given, lv.constraints));
    bankCount++;
  }
}

let collisions = 0;
let reseeds = 0;
let genFails = 0;
for (let day = 0; day < DAYS; day++) {
  const dateStr = dateStrForDay(day);
  const tier = dailyTierFor(dateStr);
  // Raw (un-salted) output: track how often the fallback would be needed.
  const raw = gen.generate("duoforma-daily-" + dateStr, tier);
  if (!raw) {
    genFails++;
    continue;
  }
  if (bank.has(puzzleSignature(raw.given, raw.constraints))) reseeds++;

  const p = dailyPuzzle(dateStr, bank);
  if (!p) {
    genFails++;
    continue;
  }
  if (bank.has(puzzleSignature(p.given, p.constraints))) {
    collisions++;
    if (collisions <= 5) console.log(`COLLISION: Daily ${dateStr} matches a bank puzzle`);
  }
}

console.log(`Checked ${DAYS} dailies against ${bankCount} bank puzzles.`);
console.log(`Raw collisions needing reseed: ${reseeds}`);
if (genFails) console.log(`Generation failures: ${genFails}`);
if (collisions > 0) {
  console.log(`FAIL: ${collisions} Daily/bank collisions after reseed.`);
  process.exit(1);
}
console.log("OK: no Daily is identical to any leveled puzzle.");
