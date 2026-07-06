(() => {
  "use strict";

  const EMPTY = -1;
  const CIRCLE = 0; // blue circle
  const TRIANGLE = 1; // red triangle
  const DIFFS = ["easy", "medium", "hard", "expert"];
  const PROFILE_KEY = "duoforma-profile-v1";
  const STORE_KEY = "duoforma-progress-v1"; // legacy — migrated into profile
  const THEME_KEY = "duoforma-theme-v1";
  const MODE_KEY = "duoforma-mode-v1"; // last selected mode/difficulty
  const DAILY_KEY = "duoforma-daily-v1"; // legacy — migrated into profile
  const CHECKPOINT_KEY = "duoforma-checkpoint-v1"; // legacy — migrated into profile
  const PROFILE_NAME_MAX = 24;

  const ADJECTIVES = [
    "Lazy", "Swift", "Bold", "Calm", "Clever", "Daring", "Eager", "Fuzzy", "Gentle", "Happy",
    "Jolly", "Keen", "Lucky", "Merry", "Noble", "Peppy", "Quick", "Rusty", "Silly", "Tiny",
    "Witty", "Zesty", "Brave", "Cosmic", "Dizzy", "Feisty", "Giddy", "Hasty", "Icy", "Jazzy",
  ];
  const NOUNS = [
    "Monkey", "Fox", "Owl", "Bear", "Wolf", "Hawk", "Lynx", "Panda", "Tiger", "Eagle",
    "Badger", "Falcon", "Gecko", "Heron", "Koala", "Lemur", "Moose", "Otter", "Raven", "Shark",
    "Sloth", "Viper", "Walrus", "Yak", "Zebra", "Crane", "Dingo", "Finch", "Goose", "Ibex",
  ];
  const ERROR_DELAY = 1000; // ms of inactivity before rule violations are highlighted
  const HINT_COOLDOWN = 10000; // ms before Hint can be used again

  // Daily puzzle: everyone gets the same procedurally generated board each day.
  // Day #1 is the epoch below; difficulty rotates through the week for variety.
  const DAILY_EPOCH = "2025-01-01";
  const DAILY_TIER_LABELS = ["Easy", "Medium", "Hard"];
  // Indexed by day of week (0 = Sunday). Values are generator tiers (0/1/2).
  const DAILY_ROTATION = [1, 0, 1, 1, 2, 2, 1];

  // Board dimensions are derived per level (6x6 for easy/medium/hard, 8x8 for
  // expert). N/CELLS/HALF/LINES are rebuilt whenever the size changes.
  let N = 6;
  let CELLS = N * N;
  let HALF = N / 2; // required count of each shape per row/column
  let LINES = [];
  let builtSize = 0; // board size the DOM shell was last built for

  function buildLines(n) {
    const lines = [];
    for (let r = 0; r < n; r++) {
      const row = [];
      for (let c = 0; c < n; c++) row.push(r * n + c);
      lines.push(row);
    }
    for (let c = 0; c < n; c++) {
      const col = [];
      for (let r = 0; r < n; r++) col.push(r * n + c);
      lines.push(col);
    }
    return lines;
  }

  function setBoardSize(n) {
    N = n;
    CELLS = n * n;
    HALF = n / 2;
    LINES = buildLines(n);
  }
  setBoardSize(6);

  const el = {
    board: document.getElementById("board"),
    banner: document.getElementById("banner"),
    timer: document.getElementById("timer"),
    levelLabel: document.getElementById("levelLabel"),
    levelDone: document.getElementById("levelDone"),
    dailyDiff: document.getElementById("dailyDiff"),
    dailyStreak: document.getElementById("dailyStreak"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    levelBtn: document.getElementById("levelBtn"),
    progressText: document.getElementById("progressText"),
    undoBtn: document.getElementById("undoBtn"),
    clearBtn: document.getElementById("clearBtn"),
    hintBtn: document.getElementById("hintBtn"),
    checkBtn: document.getElementById("checkBtn"),
    checkpointBtn: document.getElementById("checkpointBtn"),
    restoreBtn: document.getElementById("restoreBtn"),
    randomBtn: document.getElementById("randomBtn"),
    levelModal: document.getElementById("levelModal"),
    levelGrid: document.getElementById("levelGrid"),
    modalTitle: document.getElementById("modalTitle"),
    closeModal: document.getElementById("closeModal"),
    helpBtn: document.getElementById("helpBtn"),
    validateBtn: document.getElementById("validateBtn"),
    themeBtn: document.getElementById("themeBtn"),
    helpModal: document.getElementById("helpModal"),
    closeHelp: document.getElementById("closeHelp"),
    winModal: document.getElementById("winModal"),
    winStats: document.getElementById("winStats"),
    winNext: document.getElementById("winNext"),
    winClose: document.getElementById("winClose"),
    winShare: document.getElementById("winShare"),
    winShareLabel: document.getElementById("winShareLabel"),
    winShareCard: document.getElementById("winShareCard"),
    statsBtn: document.getElementById("statsBtn"),
    statsModal: document.getElementById("statsModal"),
    closeStats: document.getElementById("closeStats"),
    statPlayed: document.getElementById("statPlayed"),
    statStreak: document.getElementById("statStreak"),
    statBest: document.getElementById("statBest"),
    statFastest: document.getElementById("statFastest"),
    statsHistory: document.getElementById("statsHistory"),
    statsShare: document.getElementById("statsShare"),
    clearModal: document.getElementById("clearModal"),
    clearCancel: document.getElementById("clearCancel"),
    clearConfirm: document.getElementById("clearConfirm"),
    hintFill: document.querySelector("#hintBtn .cd-fill"),
    hintPanel: document.getElementById("hintPanel"),
    hintText: document.getElementById("hintText"),
    hintDismiss: document.getElementById("hintDismiss"),
    profileBtn: document.getElementById("profileBtn"),
    profileName: document.getElementById("profileName"),
    profileModal: document.getElementById("profileModal"),
    closeProfile: document.getElementById("closeProfile"),
    profileNameInput: document.getElementById("profileNameInput"),
    profileRandomize: document.getElementById("profileRandomize"),
    profileSave: document.getElementById("profileSave"),
  };

  let LEVELS = null;
  const state = {
    diff: "easy",
    index: 0,
    daily: false, // true when the Daily puzzle is loaded
    dailyOffset: 0, // 0 = today, -1 = yesterday, ... (archive)
    dailyMeta: null, // { dateStr, number, tier, label }
    level: null,
    grid: new Int8Array(CELLS).fill(EMPTY),
    locked: new Array(CELLS).fill(false),
    cellEls: [],
    consEls: [],
    history: [],
    hintsUsed: 0,
    startTime: 0,
    elapsed: 0,
    timerId: null,
    won: false,
    bannerTimer: null,
    errorTimer: null,
    hintCdTimer: null,
    hintMode: false,
    hintResume: false,
    validate: localStorage.getItem("duoforma-validate-v1") !== "0",
  };

  // ---------- profile & persistence ----------
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function generateProfileName() {
    const adj = ADJECTIVES[(Math.random() * ADJECTIVES.length) | 0];
    const noun = NOUNS[(Math.random() * NOUNS.length) | 0];
    return adj + noun;
  }

  function defaultProgress() {
    const p = {};
    for (const d of DIFFS) p[d] = { solved: [], last: 0 };
    return p;
  }

  function normalizeProgress(p) {
    if (!p || typeof p !== "object") p = {};
    for (const d of DIFFS) {
      if (!p[d] || !Array.isArray(p[d].solved)) p[d] = { solved: [], last: 0 };
    }
    return p;
  }

  function normalizeDaily(d) {
    if (!d || typeof d !== "object") d = {};
    if (!d.results || typeof d.results !== "object") d.results = {};
    return d;
  }

  function normalizeCheckpoints(c) {
    if (!c || typeof c !== "object") c = {};
    return c;
  }

  function readLegacyJson(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function migrateLegacyProfile() {
    return {
      name: generateProfileName(),
      createdAt: todayStr(),
      progress: normalizeProgress(readLegacyJson(STORE_KEY)),
      daily: normalizeDaily(readLegacyJson(DAILY_KEY)),
      checkpoints: normalizeCheckpoints(readLegacyJson(CHECKPOINT_KEY)),
    };
  }

  function loadProfile() {
    let p = null;
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) p = JSON.parse(raw);
    } catch (e) {}
    if (!p || typeof p !== "object" || typeof p.name !== "string" || !p.name.trim()) {
      p = migrateLegacyProfile();
      saveProfile(p);
      return p;
    }
    p.name = p.name.trim();
    p.progress = normalizeProgress(p.progress);
    p.daily = normalizeDaily(p.daily);
    p.checkpoints = normalizeCheckpoints(p.checkpoints);
    if (!p.createdAt) p.createdAt = todayStr();
    return p;
  }

  let profile = loadProfile();
  let progress = profile.progress;
  let dailyData = profile.daily;
  let checkpoints = profile.checkpoints;

  function saveProfile(p) {
    const data = p || profile;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function saveProgress() {
    saveProfile();
  }

  function solvedSet(diff) {
    return new Set(progress[diff].solved);
  }

  function updateProfileUI() {
    if (!el.profileName) return;
    el.profileName.textContent = profile.name;
    if (el.profileBtn) el.profileBtn.title = profile.name;
  }

  function openProfileModal() {
    el.profileNameInput.value = profile.name;
    el.profileModal.hidden = false;
    el.profileNameInput.focus();
    el.profileNameInput.select();
  }

  function sanitizeProfileName(name) {
    return name.trim().slice(0, PROFILE_NAME_MAX);
  }

  function saveProfileName(name) {
    const clean = sanitizeProfileName(name);
    if (!clean) {
      showBanner("Name can't be empty.", "bad");
      return;
    }
    profile.name = clean;
    saveProfile();
    updateProfileUI();
    el.profileModal.hidden = true;
    showBanner("Name saved.", "good");
  }

  // ---------- checkpoints ----------
  function saveCheckpoints() {
    saveProfile();
  }
  function puzzleKey() {
    if (!state.level) return null;
    return state.level.id;
  }
  function hasCheckpoint() {
    const key = puzzleKey();
    return !!(key && checkpoints[key]);
  }
  function updateCheckpointUI() {
    const saved = hasCheckpoint();
    el.restoreBtn.disabled = !saved || state.won;
    el.checkpointBtn.classList.toggle("has-checkpoint", saved);
    el.checkpointBtn.disabled = state.won;
  }
  function saveCheckpoint() {
    if (state.hintMode) exitHintMode();
    if (state.won || !state.level) return;
    const key = puzzleKey();
    if (!key) return;
    checkpoints[key] = {
      grid: Array.from(state.grid),
      elapsed: state.elapsed,
      hintsUsed: state.hintsUsed,
    };
    saveCheckpoints();
    updateCheckpointUI();
    showBanner("Checkpoint saved.", "good");
  }
  function restoreCheckpoint() {
    if (state.hintMode) exitHintMode();
    if (state.won || !state.level) return;
    const key = puzzleKey();
    const cp = checkpoints[key];
    if (!cp) return;
    state.grid = Int8Array.from(cp.grid);
    state.history = [];
    state.hintsUsed = cp.hintsUsed || 0;
    state.elapsed = cp.elapsed || 0;
    state.startTime = Date.now() - state.elapsed;
    el.timer.textContent = formatTime(state.elapsed);
    if (state.elapsed > 0) ensureTimer();
    render();
    showBanner("Restored checkpoint.", "good");
  }

  // ---------- daily: persistence ----------
  // dailyData.results maps "YYYY-MM-DD" -> { time: ms, hints: n, tier: t }.
  function saveDaily() {
    saveProfile();
  }

  // ---------- daily: date helpers ----------
  function isDaily() {
    return state.daily;
  }
  function midnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  function dateToStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function parseDateStr(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function dayNumber(dateStr) {
    const epochMs = midnight(parseDateStr(DAILY_EPOCH)).getTime();
    const ms = midnight(parseDateStr(dateStr)).getTime();
    return Math.round((ms - epochMs) / 86400000) + 1; // day #1 == epoch
  }
  function dateStrForOffset(offset) {
    const t = midnight(new Date());
    t.setDate(t.getDate() + offset);
    return dateToStr(t);
  }
  function dailyTierFor(dateStr) {
    return DAILY_ROTATION[parseDateStr(dateStr).getDay()];
  }
  function weekdayLabel(dateStr) {
    return parseDateStr(dateStr).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  // ---------- daily: puzzle generation (deterministic, cached) ----------
  // A puzzle's "identity" is its starting board: the given clues plus the set
  // of constraint badges. Two puzzles with the same signature are the exact
  // same thing to solve. Order-independent so bank/daily encodings compare
  // equal regardless of how constraints were listed.
  function puzzleSignature(given, constraints) {
    const cons = constraints
      .map((c) => Math.min(c[0], c[1]) + "," + Math.max(c[0], c[1]) + "," + c[2])
      .sort()
      .join("|");
    return given + "#" + cons;
  }

  // Signatures of every puzzle in the fixed level bank, built once. Used to
  // guarantee a Daily is never an exact duplicate of a leveled puzzle.
  let bankSignatures = null;
  function getBankSignatures() {
    if (bankSignatures) return bankSignatures;
    bankSignatures = new Set();
    if (LEVELS) {
      for (const diff of Object.keys(LEVELS)) {
        for (const lv of LEVELS[diff]) {
          bankSignatures.add(puzzleSignature(lv.given, lv.constraints));
        }
      }
    }
    return bankSignatures;
  }

  const dailyCache = {};
  function getDailyPuzzle(dateStr) {
    if (dailyCache[dateStr]) return dailyCache[dateStr];
    if (!window.DuoformaGen) return null;
    const tier = dailyTierFor(dateStr);
    const bank = getBankSignatures();
    // Deterministically re-seed if a generated board ever matches a bank
    // puzzle, so the Daily is never identical to a leveled one. This salted
    // fallback is virtually never needed (verified across years of dailies),
    // but it makes the "always different" guarantee airtight.
    let p = null;
    for (let attempt = 0; attempt < 50; attempt++) {
      const seed = "duoforma-daily-" + dateStr + (attempt ? "-v" + attempt : "");
      const cand = window.DuoformaGen.generate(seed, tier);
      if (!cand) break;
      p = cand;
      if (!bank.has(puzzleSignature(cand.given, cand.constraints))) break;
    }
    if (!p) return null;
    const level = {
      id: "daily-" + dateStr,
      given: p.given,
      solution: p.solution,
      constraints: p.constraints,
    };
    dailyCache[dateStr] = level;
    return level;
  }

  // ---------- daily: streak stats ----------
  function computeDailyStats() {
    const results = dailyData.results;
    const dates = Object.keys(results);
    const played = dates.length;
    let fastest = Infinity;
    // Streaks only count dailies solved on their own live day. Archived
    // (previous-day) plays are practice: playable and shareable, but they
    // never build or restore a streak. Legacy results (no `live` field) are
    // grandfathered in as live so existing streaks aren't wiped.
    const dayNums = new Set();
    for (const ds of dates) {
      if (results[ds].live !== false) dayNums.add(dayNumber(ds));
      const t = results[ds].time;
      if (typeof t === "number" && t < fastest) fastest = t;
    }
    // best streak: longest run of consecutive day numbers
    let best = 0;
    for (const n of dayNums) {
      if (dayNums.has(n - 1)) continue; // not a run start
      let len = 1;
      while (dayNums.has(n + len)) len++;
      if (len > best) best = len;
    }
    // current streak: consecutive days ending today (or yesterday, grace period)
    const today = dayNumber(dateStrForOffset(0));
    let cur = 0;
    let anchor = dayNums.has(today) ? today : dayNums.has(today - 1) ? today - 1 : null;
    if (anchor != null) {
      cur = 1;
      while (dayNums.has(anchor - cur)) cur++;
    }
    return { played, best, current: cur, fastest: fastest === Infinity ? null : fastest };
  }

  // ---------- init ----------
  async function init() {
    updateProfileUI();
    applyTheme(localStorage.getItem(THEME_KEY) === "dark");
    try {
      const res = await fetch("levels.json");
      LEVELS = await res.json();
    } catch (e) {
      el.board.innerHTML =
        '<p style="padding:20px;color:#b91c1c">Could not load levels.json. Please serve this folder over HTTP (see README).</p>';
      return;
    }
    wireEvents();
    applyValidateUI();
    // A shared link (?daily or ?daily=YYYY-MM-DD) always opens on the Daily
    // tab, deep-linking to the specific day when one is given.
    const deepLink = window.DuoformaGen ? parseDailyDeepLink() : null;
    if (deepLink) {
      localStorage.setItem(MODE_KEY, "daily");
      loadDaily(deepLink.dateStr ? offsetForDateStr(deepLink.dateStr) : 0);
      window.addEventListener("resize", positionConstraints);
      return;
    }
    let mode = localStorage.getItem(MODE_KEY);
    // New visitors land on the Daily puzzle to showcase it; the ★ Daily tab
    // stays available for everyone. Fall back to easy if the generator is
    // unavailable (e.g. opened without puzzle-gen.js).
    if (!mode) mode = window.DuoformaGen ? "daily" : "easy";
    if (mode === "daily" && !window.DuoformaGen) mode = "easy";
    selectDiff(mode);
    window.addEventListener("resize", positionConstraints);
  }

  function clampIndex(i) {
    const max = LEVELS[state.diff].length - 1;
    return Math.max(0, Math.min(max, i));
  }

  // ---------- board DOM ----------
  function buildBoardShell() {
    el.board.innerHTML = "";
    el.board.dataset.n = N;
    el.board.style.setProperty("--n", N);
    state.cellEls = [];
    state.consEls = [];
    for (let i = 0; i < CELLS; i++) {
      const c = document.createElement("div");
      c.className = "cell";
      c.dataset.i = i;
      el.board.appendChild(c);
      state.cellEls.push(c);
    }
    builtSize = N;
  }

  // ---------- load a level ----------
  // Apply the current state.level to the board (shared by bank + daily modes).
  function applyLevelToBoard() {
    const n = Math.round(Math.sqrt(state.level.given.length));
    if (n !== builtSize) {
      setBoardSize(n);
      buildBoardShell();
    }

    state.grid = new Int8Array(CELLS).fill(EMPTY);
    state.locked = new Array(CELLS).fill(false);
    state.history = [];
    state.hintsUsed = 0;
    state.won = false;

    const given = state.level.given;
    for (let i = 0; i < CELLS; i++) {
      if (given[i] !== ".") {
        state.grid[i] = Number(given[i]);
        state.locked[i] = true;
      }
    }

    resetTimer();
    resetHintCooldown();
    resetHintMode();
    renderConstraints();
    render();
    updateStatus();
    hideBanner();
    updateCheckpointUI();
  }

  function loadLevel(index) {
    state.daily = false;
    state.index = clampIndex(index);
    state.level = LEVELS[state.diff][state.index];
    progress[state.diff].last = state.index;
    saveProgress();
    applyLevelToBoard();
  }

  // Load the daily puzzle for the given archive offset (0 = today).
  function loadDaily(offset) {
    if (offset > 0) offset = 0; // never load a future day
    const earliest = 1 - dayNumber(dateStrForOffset(0)); // offset that reaches day #1
    if (offset < earliest) offset = earliest;
    const dateStr = dateStrForOffset(offset);
    const level = getDailyPuzzle(dateStr);
    if (!level) {
      showBanner("Daily puzzle unavailable.", "bad");
      return;
    }
    state.daily = true;
    state.dailyOffset = offset;
    state.diff = "daily";
    state.level = level;
    state.dailyMeta = {
      dateStr,
      number: dayNumber(dateStr),
      tier: dailyTierFor(dateStr),
      label: DAILY_TIER_LABELS[dailyTierFor(dateStr)],
    };
    applyLevelToBoard();
  }

  function shiftDaily(delta) {
    loadDaily(state.dailyOffset + delta);
  }

  // Archive offset (0 = today, negative = past) that reaches the given date.
  function offsetForDateStr(dateStr) {
    return dayNumber(dateStr) - dayNumber(dateStrForOffset(0));
  }

  // Jump straight to a specific day's daily (used by the archive list and by
  // shared deep-links). Records the choice so a reload stays on the daily tab.
  function loadDailyDate(dateStr) {
    if (!window.DuoformaGen) return;
    localStorage.setItem(MODE_KEY, "daily");
    loadDaily(offsetForDateStr(dateStr));
  }

  // Read an optional deep-link that points at the daily tab. Supports
  //   ?daily            -> today's daily
  //   ?daily=YYYY-MM-DD -> a specific (past) daily
  function parseDailyDeepLink() {
    try {
      const params = new URLSearchParams(location.search);
      if (!params.has("daily")) return null;
      const val = params.get("daily");
      if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) return { dateStr: val };
      return { dateStr: null }; // today
    } catch (e) {
      return null;
    }
  }

  function resetHintMode() {
    state.hintMode = false;
    state.hintResume = false;
    if (el.hintPanel) el.hintPanel.hidden = true;
    clearHintHighlights();
  }

  // ---------- constraints ----------
  function renderConstraints() {
    state.consEls.forEach((n) => n.remove());
    state.consEls = [];
    for (const [a, b, t] of state.level.constraints) {
      const node = document.createElement("div");
      node.className = "cons";
      node.textContent = t === 0 ? "=" : "×";
      node.dataset.a = a;
      node.dataset.b = b;
      node.dataset.t = t;
      el.board.appendChild(node);
      state.consEls.push(node);
    }
    requestAnimationFrame(positionConstraints);
  }

  function positionConstraints() {
    if (!state.consEls.length) return;
    const boardRect = el.board.getBoundingClientRect();
    for (const node of state.consEls) {
      const a = Number(node.dataset.a);
      const b = Number(node.dataset.b);
      const ra = state.cellEls[a].getBoundingClientRect();
      const rb = state.cellEls[b].getBoundingClientRect();
      const cx = Math.round((ra.left + ra.right + rb.left + rb.right) / 4 - boardRect.left);
      const cy = Math.round((ra.top + ra.bottom + rb.top + rb.bottom) / 4 - boardRect.top);
      node.style.left = cx + "px";
      node.style.top = cy + "px";
    }
  }

  // ---------- render ----------
  function render() {
    for (let i = 0; i < CELLS; i++) {
      const cell = state.cellEls[i];
      cell.classList.toggle("given", state.locked[i]);
      cell.innerHTML = "";
      const v = state.grid[i];
      if (v === CIRCLE) {
        const s = document.createElement("div");
        s.className = "shape circle";
        cell.appendChild(s);
      } else if (v === TRIANGLE) {
        const s = document.createElement("div");
        s.className = "shape triangle";
        cell.appendChild(s);
      }
    }
    refreshErrorDisplay();
  }

  // ---------- interaction ----------
  function cycle(i, backward) {
    if (state.hintMode) { exitHintMode(); return; } // a board tap dismisses the hint
    if (state.locked[i] || state.won) return;
    const cur = state.grid[i];
    let next;
    if (!backward) next = cur === EMPTY ? CIRCLE : cur === CIRCLE ? TRIANGLE : EMPTY;
    else next = cur === EMPTY ? TRIANGLE : cur === TRIANGLE ? CIRCLE : EMPTY;
    state.history.push({ i, prev: cur });
    state.grid[i] = next;
    ensureTimer();
    render();
    checkWin();
  }

  function undo() {
    if (state.hintMode) exitHintMode();
    if (!state.history.length || state.won) return;
    const last = state.history.pop();
    state.grid[last.i] = last.prev;
    render();
  }

  function hasUserPlaced() {
    for (let i = 0; i < CELLS; i++) if (!state.locked[i] && state.grid[i] !== EMPTY) return true;
    return false;
  }

  // Ask before wiping the board; skip the prompt when there's nothing to clear.
  function requestClear() {
    if (state.hintMode) exitHintMode();
    if (state.won || !hasUserPlaced()) return;
    el.clearModal.hidden = false;
  }

  function clearBoard() {
    if (state.won) return;
    for (let i = 0; i < CELLS; i++) if (!state.locked[i]) state.grid[i] = EMPTY;
    state.history = [];
    render();
  }

  // ---------- evaluation / errors ----------
  // Detects rule violations without touching the DOM. Returns offending cell
  // indices and the indices of violated constraint badges.
  function computeErrors() {
    const errCells = new Set();
    const badCons = new Set();
    for (const line of LINES) {
      const counts = [0, 0];
      for (const i of line) if (state.grid[i] !== EMPTY) counts[state.grid[i]]++;
      if (counts[0] > HALF || counts[1] > HALF) {
        const over = counts[0] > HALF ? 0 : 1;
        for (const i of line) if (state.grid[i] === over) errCells.add(i);
      }
      for (let k = 0; k <= N - 3; k++) {
        const a = state.grid[line[k]];
        if (a !== EMPTY && a === state.grid[line[k + 1]] && a === state.grid[line[k + 2]]) {
          errCells.add(line[k]);
          errCells.add(line[k + 1]);
          errCells.add(line[k + 2]);
        }
      }
    }
    state.consEls.forEach((node, idx) => {
      const a = Number(node.dataset.a);
      const b = Number(node.dataset.b);
      const t = Number(node.dataset.t);
      const va = state.grid[a];
      const vb = state.grid[b];
      if (va !== EMPTY && vb !== EMPTY && ((t === 0 && va !== vb) || (t === 1 && va === vb))) {
        badCons.add(idx);
        errCells.add(a);
        errCells.add(b);
      }
    });
    return { errCells, badCons };
  }

  function hasErrors(errs) {
    return errs.errCells.size > 0 || errs.badCons.size > 0;
  }

  function applyErrorStyles(errs) {
    state.consEls.forEach((node, idx) => node.classList.toggle("bad", errs.badCons.has(idx)));
    for (let i = 0; i < CELLS; i++) state.cellEls[i].classList.toggle("error", errs.errCells.has(i));
  }

  function clearErrorStyles() {
    state.consEls.forEach((node) => node.classList.remove("bad"));
    for (let i = 0; i < CELLS; i++) state.cellEls[i].classList.remove("error");
  }

  function cancelErrorDisplay() {
    if (state.errorTimer) clearTimeout(state.errorTimer);
    state.errorTimer = null;
  }

  // Violations are only highlighted after ERROR_DELAY ms with no further edits.
  // Any change hides current highlights and restarts the timer; clearing all
  // errors removes the highlight immediately.
  function refreshErrorDisplay() {
    cancelErrorDisplay();
    clearErrorStyles();
    if (!state.validate) return; // validation hidden (hard mode)
    if (!hasErrors(computeErrors())) return;
    state.errorTimer = setTimeout(() => {
      state.errorTimer = null;
      applyErrorStyles(computeErrors());
    }, ERROR_DELAY);
  }

  function applyValidateUI() {
    const on = state.validate;
    el.validateBtn.classList.toggle("off", !on);
    el.validateBtn.setAttribute("aria-pressed", String(!on));
    el.validateBtn.title = on ? "Hide validation (harder)" : "Show validation";
  }

  function toggleValidate() {
    state.validate = !state.validate;
    localStorage.setItem("duoforma-validate-v1", state.validate ? "1" : "0");
    applyValidateUI();
    refreshErrorDisplay();
    showBanner(state.validate ? "Validation shown" : "Validation hidden — good luck!", state.validate ? "good" : "");
  }

  // ---------- theme ----------
  function applyTheme(dark) {
    document.documentElement.classList.toggle("dark", dark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0f172a" : "#f3f4f6");
    if (el.themeBtn) el.themeBtn.title = dark ? "Switch to light mode" : "Switch to dark mode";
  }

  function toggleTheme() {
    const dark = !document.documentElement.classList.contains("dark");
    applyTheme(dark);
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  }

  function isFull() {
    for (let i = 0; i < CELLS; i++) if (state.grid[i] === EMPTY) return false;
    return true;
  }

  function checkWin() {
    if (!isFull()) return false;
    if (!hasErrors(computeErrors())) {
      onWin();
      return true;
    }
    return false;
  }

  // ---------- win ----------
  function onWin() {
    state.won = true;
    stopTimer();
    cancelErrorDisplay();
    clearErrorStyles();
    if (isDaily()) return onWinDaily();
    const set = solvedSet(state.diff);
    set.add(state.level.id);
    progress[state.diff].solved = [...set];
    saveProgress();
    updateStatus();
    const t = formatTime(state.elapsed);
    el.winStats.textContent =
      `${cap(state.diff)} · Level ${state.index + 1} · ${t}` +
      (state.hintsUsed ? ` · ${state.hintsUsed} hint${state.hintsUsed > 1 ? "s" : ""}` : " · no hints");
    const shareInfo = {
      diff: state.diff,
      index: state.index,
      time: state.elapsed,
      hints: state.hintsUsed,
    };
    el.winShareCard.textContent = buildLevelShareText(shareInfo);
    el.winShareCard.hidden = false;
    el.winShareLabel.textContent = "Share your time";
    el.winShare.hidden = false;
    el.winShare.onclick = () => shareLevel(shareInfo);
    el.winNext.textContent = "Next puzzle →";
    el.winModal.hidden = false;
    updateCheckpointUI();
  }

  function hintsLabel(n) {
    return n ? `${n} hint${n > 1 ? "s" : ""}` : "no hints";
  }

  function onWinDaily() {
    const meta = state.dailyMeta;
    // Only today's live daily builds your streak; past days are practice.
    const isLiveToday = state.dailyOffset === 0;
    // Record only the first completion so replays don't overwrite it.
    const prior = dailyData.results[meta.dateStr];
    if (!prior) {
      dailyData.results[meta.dateStr] = {
        time: state.elapsed,
        hints: state.hintsUsed,
        tier: meta.tier,
        live: isLiveToday,
      };
      saveDaily();
    }
    updateStatus();
    const result = dailyData.results[meta.dateStr];
    const stats = computeDailyStats();
    let note = "";
    if (!isLiveToday) note = " · practice — streak unaffected";
    else if (prior) note = " · (already logged — replay)";
    el.winStats.textContent =
      `Daily #${meta.number} · ${meta.label} · ${formatTime(result.time)} · ${hintsLabel(result.hints)}` +
      note;
    el.winShareCard.textContent = buildShareText(meta.dateStr, result, stats);
    el.winShareCard.hidden = false;
    el.winShareLabel.textContent = "Share your time";
    el.winShare.hidden = false;
    el.winShare.onclick = () => shareDaily(meta.dateStr);
    // In daily mode "Next" surfaces the social stats view instead of a next level.
    el.winNext.textContent = "View stats →";
    el.winModal.hidden = false;
    updateCheckpointUI();
  }

  // ---------- daily: sharing (no backend — copy/native share) ----------
  function siteUrl() {
    try {
      return location.origin && location.origin !== "null"
        ? location.origin + location.pathname
        : "https://duoforma.game";
    } catch (e) {
      return "https://duoforma.game";
    }
  }

  function buildShareText(dateStr, result, stats) {
    const num = dayNumber(dateStr);
    const label = DAILY_TIER_LABELS[dailyTierFor(dateStr)];
    const lines = [
      `Duoforma Daily #${num} ★ ${label}`,
      `⏱ ${formatTime(result.time)} · ${hintsLabel(result.hints)}`,
    ];
    if (stats && stats.current > 1) lines.push(`🔥 ${stats.current}-day streak`);
    // Deep-link straight to this day's daily so friends play the same board.
    lines.push(`Beat my time → ${siteUrl()}?daily=${dateStr}`);
    return lines.join("\n");
  }

  function buildLevelShareText(info) {
    const lines = [
      `Duoforma · ${cap(info.diff)} · Level ${info.index + 1}`,
      `⏱ ${formatTime(info.time)} · ${hintsLabel(info.hints)}`,
      `Beat my time → ${siteUrl()}`,
    ];
    return lines.join("\n");
  }

  async function shareLevel(info) {
    const text = buildLevelShareText(info);
    // Native share sheet on supported (mostly mobile) devices, else clipboard.
    if (navigator.share) {
      try {
        await navigator.share({ title: "Duoforma", text });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // user dismissed
      }
    }
    const ok = await copyText(text);
    showBanner(ok ? "Result copied — paste to share!" : "Couldn't copy result.", ok ? "good" : "bad");
  }

  async function shareDaily(dateStr) {
    const result = dailyData.results[dateStr];
    if (!result) {
      showBanner("Solve today's daily first!", "bad");
      return;
    }
    const text = buildShareText(dateStr, result, computeDailyStats());
    // Native share sheet on supported (mostly mobile) devices, else clipboard.
    if (navigator.share) {
      try {
        await navigator.share({ title: "Duoforma Daily", text });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // user dismissed
      }
    }
    const ok = await copyText(text);
    showBanner(ok ? "Result copied — paste to share!" : "Couldn't copy result.", ok ? "good" : "bad");
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  // ---------- daily: stats modal ----------
  function openStats() {
    const stats = computeDailyStats();
    el.statPlayed.textContent = stats.played;
    el.statStreak.textContent = stats.current;
    el.statBest.textContent = stats.best;
    el.statFastest.textContent = stats.fastest == null ? "–" : formatTime(stats.fastest);

    let html = "";
    for (let off = 0; off > -14; off--) {
      const ds = dateStrForOffset(off);
      if (dayNumber(ds) < 1) break;
      const res = dailyData.results[ds];
      const tier = dailyTierFor(ds);
      const num = dayNumber(ds);
      const right = res
        ? `<span class="hist-time">${formatTime(res.time)}</span>`
        : `<span class="hist-open">play ›</span>`;
      html +=
        `<li class="hist-row play${res ? " done" : ""}" data-date="${ds}" role="button" tabindex="0" title="Play this day">` +
        `<span class="hist-day">#${num} · ${weekdayLabel(ds)}</span>` +
        `<span class="hist-diff">${DAILY_TIER_LABELS[tier]}</span>` +
        right +
        `</li>`;
    }
    el.statsHistory.innerHTML = html;

    // Share the most recent completed daily (today if done, else latest).
    let shareDate = null;
    for (let off = 0; off > -400; off--) {
      const ds = dateStrForOffset(off);
      if (dayNumber(ds) < 1) break;
      if (dailyData.results[ds]) { shareDate = ds; break; }
    }
    el.statsShare.disabled = !shareDate;
    el.statsShare.onclick = () => shareDate && shareDaily(shareDate);

    el.statsModal.hidden = false;
  }

  // ---------- hint (teaching mode) ----------
  function shapeName(v) {
    return v === CIRCLE ? "circle" : "triangle";
  }

  // Finds the next single move that a human can deduce, together with the cells
  // that justify it and a plain-language explanation. Techniques are ordered so
  // the most instructive/simplest reasoning is offered first. Every candidate is
  // cross-checked against the known solution so we never teach a wrong move.
  function findHintDeduction() {
    const g = state.grid;
    const sol = state.level.solution;
    const solOk = (i, v) => String(v) === sol[i];

    // 0) a placed shape contradicts the unique solution
    for (let i = 0; i < CELLS; i++) {
      if (state.locked[i]) continue;
      if (g[i] !== EMPTY && String(g[i]) !== sol[i]) {
        const v = Number(sol[i]);
        return {
          cell: i, value: v, cells: [i], cons: [], type: "mistake",
          text: `This ${shapeName(g[i])} leads to a dead end — it clashes with what the other cells force. It should be a ${shapeName(v)}.`,
        };
      }
    }

    // 1) constraint badge forces the empty side
    for (let ci = 0; ci < state.level.constraints.length; ci++) {
      const [a, b, t] = state.level.constraints[ci];
      let known = -1, empty = -1;
      if (g[a] !== EMPTY && g[b] === EMPTY) { known = a; empty = b; }
      else if (g[b] !== EMPTY && g[a] === EMPTY) { known = b; empty = a; }
      if (known === -1 || state.locked[empty]) continue;
      const v = t === 0 ? g[known] : 1 - g[known];
      if (!solOk(empty, v)) continue;
      const text = t === 0
        ? `The = badge links these two cells, so they must be the same shape. Its partner is a ${shapeName(g[known])}, so this cell is a ${shapeName(v)} too.`
        : `The × badge links these two cells, so they must be different shapes. Its partner is a ${shapeName(g[known])}, so this cell must be a ${shapeName(v)}.`;
      return { cell: empty, value: v, cells: [a, b], cons: [ci], type: "constraint", text };
    }

    // 2) triple rule — no three identical in a line
    for (const line of LINES) {
      for (let k = 0; k <= N - 3; k++) {
        const p = [line[k], line[k + 1], line[k + 2]];
        const v = [g[p[0]], g[p[1]], g[p[2]]];
        // A A _  and  _ A A  (adjacent pair)
        if (v[0] !== EMPTY && v[0] === v[1] && v[2] === EMPTY && !state.locked[p[2]] && solOk(p[2], 1 - v[0]))
          return tripAdjacent(p, [p[0], p[1]], p[2], v[0]);
        if (v[1] !== EMPTY && v[1] === v[2] && v[0] === EMPTY && !state.locked[p[0]] && solOk(p[0], 1 - v[1]))
          return tripAdjacent(p, [p[1], p[2]], p[0], v[1]);
        // A _ A  (flanking pair)
        if (v[0] !== EMPTY && v[0] === v[2] && v[1] === EMPTY && !state.locked[p[1]] && solOk(p[1], 1 - v[0]))
          return {
            cell: p[1], value: 1 - v[0], cells: p.slice(), cons: [], type: "triple",
            text: `Two ${shapeName(v[0])}s sit on either side of this cell. Filling it with a ${shapeName(v[0])} would make three in a line, so it must be a ${shapeName(1 - v[0])}.`,
          };
      }
    }

    // 3) line balance — a row/column already has its full quota of one shape
    for (let li = 0; li < LINES.length; li++) {
      const line = LINES[li];
      const isRow = li < N;
      let c0 = 0, c1 = 0;
      for (const i of line) { if (g[i] === CIRCLE) c0++; else if (g[i] === TRIANGLE) c1++; }
      const full = c0 === HALF ? CIRCLE : c1 === HALF ? TRIANGLE : -1;
      if (full === -1 || c0 + c1 === line.length) continue;
      const need = 1 - full;
      const target = line.find((i) => g[i] === EMPTY && !state.locked[i] && solOk(i, need));
      if (target == null) continue;
      const filled = line.filter((i) => g[i] === full);
      return {
        cell: target, value: need, cells: filled, cons: [], type: "balance",
        text: `This ${isRow ? "row" : "column"} already holds all ${HALF} of its ${shapeName(full)}s (the maximum). Every remaining cell must be a ${shapeName(need)}, including this one.`,
      };
    }

    // 4) whole-line reasoning — look ahead across an entire row/column. Even
    // when no single pair or full quota decides a cell, balancing 3-and-3 while
    // avoiding any three-in-a-line can leave only one shape that fits. This is
    // the "nuanced" deduction: e.g. a row C,C,T,_,_,_ forces the LAST cell to a
    // triangle, because a circle there would need two triangles after it and
    // that makes three triangles in a row.
    {
      const lineHint = findLineForcedCell(solOk);
      if (lineHint) return lineHint;
    }

    // 5) fallback — a cell forced only by combining its row AND column (neither
    // line alone decides it). Rare once the techniques above are exhausted.
    const empties = [];
    for (let i = 0; i < CELLS; i++) if (!state.locked[i] && g[i] === EMPTY) empties.push(i);
    if (empties.length) {
      const i = empties[(Math.random() * empties.length) | 0];
      const v = Number(sol[i]);
      return {
        cell: i, value: v, cells: [i], cons: [], type: "deduce",
        text: `This one needs both its row and column together: balancing ${HALF} of each shape and avoiding three-in-a-line, only a ${shapeName(v)} keeps the puzzle solvable here.`,
      };
    }
    return null;

    function tripAdjacent(all, pair, target, sameVal) {
      return {
        cell: target, value: 1 - sameVal, cells: all, cons: [], type: "triple",
        text: `Two ${shapeName(sameVal)}s are already side by side here. A third in a line isn't allowed, so this next cell must be a ${shapeName(1 - sameVal)}.`,
      };
    }
  }

  // Enumerates every legal way to finish a single line (row or column) given the
  // shapes already on it. A completion is legal when it holds exactly HALF of
  // each shape, has no three identical in a row, and honours any = / × badge
  // whose BOTH endpoints lie on this line. Cross-line badges are ignored, which
  // only makes the check more conservative (it can never claim a false force).
  function lineCompletions(line) {
    const base = line.map((i) => state.grid[i]);
    const empties = [];
    for (let k = 0; k < base.length; k++) if (base[k] === EMPTY) empties.push(k);

    const posOf = new Map();
    line.forEach((gi, k) => posOf.set(gi, k));
    const inlineCons = [];
    for (const [a, b, t] of state.level.constraints) {
      if (posOf.has(a) && posOf.has(b)) inlineCons.push([posOf.get(a), posOf.get(b), t]);
    }

    const results = [];
    const arr = base.slice();
    for (let mask = 0; mask < 1 << empties.length; mask++) {
      for (let e = 0; e < empties.length; e++) arr[empties[e]] = (mask >> e) & 1;
      if (isLegalLine(arr, inlineCons)) results.push(arr.slice());
    }
    return { empties, results };
  }

  function isLegalLine(arr, cons) {
    let c0 = 0, c1 = 0;
    for (const v of arr) v === CIRCLE ? c0++ : c1++;
    if (c0 !== HALF || c1 !== HALF) return false;
    for (let k = 0; k <= arr.length - 3; k++) if (arr[k] === arr[k + 1] && arr[k] === arr[k + 2]) return false;
    for (const [a, b, t] of cons) if ((t === 0 && arr[a] !== arr[b]) || (t === 1 && arr[a] === arr[b])) return false;
    return true;
  }

  // Finds a cell that every legal completion of its row or column agrees on, and
  // explains WHY the alternative shape fails. Returns a hint descriptor or null.
  function findLineForcedCell(solOk) {
    for (let li = 0; li < LINES.length; li++) {
      const line = LINES[li];
      const isRow = li < N;
      const { empties, results } = lineCompletions(line);
      if (results.length === 0) continue;
      for (const k of empties) {
        const gi = line[k];
        if (state.locked[gi]) continue;
        const v = results[0][k];
        if (!results.every((r) => r[k] === v)) continue;
        if (!solOk(gi, v)) continue;
        const r = explainLineForce(line, k, v, isRow);
        return { cell: gi, value: v, cells: r.cells, cons: [], type: "line", text: r.text };
      }
    }
    return null;
  }

  // Builds a plain-language justification for why cell `k` of `line` must be `v`.
  // Prefers the concrete "balance then three-in-a-line" story when it applies,
  // otherwise gives an honest whole-line explanation.
  function explainLineForce(line, k, v, isRow) {
    const where = isRow ? "row" : "column";
    const vName = shapeName(v);
    const bad = 1 - v;
    const oName = shapeName(bad);
    const cur = line.map((i) => state.grid[i]);
    let curBad = 0;
    for (const x of cur) if (x === bad) curBad++;

    // Balance look-ahead: if the wrong shape here would use up this line's whole
    // quota of that shape, all remaining cells are forced to the other shape —
    // and if that produces three-in-a-line, the wrong shape is impossible.
    if (curBad === HALF - 1) {
      const sim = cur.slice();
      sim[k] = bad;
      for (let j = 0; j < sim.length; j++) if (sim[j] === EMPTY) sim[j] = v;
      for (let s = 0; s <= sim.length - 3; s++) {
        if (sim[s] === v && sim[s + 1] === v && sim[s + 2] === v) {
          return {
            cells: [line[s], line[s + 1], line[s + 2], line[k]],
            text: `This ${where} already has ${curBad} ${oName}${curBad === 1 ? "" : "s"} and needs exactly ${HALF}. Making this cell a ${oName} would complete that quota, so every other empty cell in the ${where} would have to be a ${vName} — but that puts three ${vName}s in a row. So this cell must be a ${vName}.`,
          };
        }
      }
    }

    const known = line.filter((i) => state.grid[i] !== EMPTY);
    return {
      cells: known.length ? known : [line[k]],
      text: `Work along this ${where}: to keep ${HALF} of each shape with no three alike in a line, a ${oName} here leaves no legal way to finish the ${where}. Only a ${vName} fits.`,
    };
  }

  function hint() {
    if (state.won || state.hintMode) return;
    const d = findHintDeduction();
    if (!d) {
      showBanner("Board is full — check for mistakes.", "bad");
      return;
    }
    state.history.push({ i: d.cell, prev: state.grid[d.cell] });
    state.grid[d.cell] = d.value;
    state.hintsUsed++;
    ensureTimer();
    render();
    if (checkWin()) return; // last move solved it — skip teaching panel
    enterHintMode(d);
  }

  function enterHintMode(d) {
    state.hintMode = true;
    state.hintResume = !!state.timerId; // was the clock running?
    stopTimer(); // pause while the player reads

    cancelErrorDisplay();
    clearErrorStyles();
    clearHintHighlights();
    d.cells.forEach((i) => state.cellEls[i] && state.cellEls[i].classList.add("hint-reason"));
    if (state.cellEls[d.cell]) state.cellEls[d.cell].classList.add("hint-target");
    d.cons.forEach((ci) => state.consEls[ci] && state.consEls[ci].classList.add("hint-reason-cons"));

    el.hintText.textContent = d.text;
    el.hintPanel.hidden = false;
    el.hintBtn.disabled = true; // no stacking hints while one is shown
  }

  function exitHintMode() {
    if (!state.hintMode) return;
    state.hintMode = false;
    clearHintHighlights();
    el.hintPanel.hidden = true;
    if (state.hintResume && !state.won) ensureTimer(); // resume the clock
    state.hintResume = false;
    refreshErrorDisplay();
    startHintCooldown(); // begin the cooldown once they're done reading
  }

  function clearHintHighlights() {
    for (let i = 0; i < state.cellEls.length; i++) {
      state.cellEls[i].classList.remove("hint-reason", "hint-target");
    }
    state.consEls.forEach((n) => n.classList.remove("hint-reason-cons"));
  }

  // Disable Hint for HINT_COOLDOWN ms, filling a left-to-right progress bar in
  // the button. The width transition drives the visual; the timer re-enables.
  function startHintCooldown() {
    if (!el.hintFill) return;
    el.hintBtn.disabled = true;
    el.hintBtn.classList.add("cooling");
    el.hintFill.style.transition = "none";
    el.hintFill.style.width = "0%";
    void el.hintFill.offsetWidth; // reflow so the next change animates
    el.hintFill.style.transition = `width ${HINT_COOLDOWN}ms linear`;
    el.hintFill.style.width = "100%";
    clearTimeout(state.hintCdTimer);
    state.hintCdTimer = setTimeout(resetHintCooldown, HINT_COOLDOWN);
  }

  // Disable Hint for HINT_COOLDOWN ms, filling a bottom-up progress bar in the
  // button. The width/height transition drives the visual; the timer re-enables.
  function startHintCooldown() {
    if (!el.hintFill) return;
    el.hintBtn.disabled = true;
    el.hintBtn.classList.add("cooling");
    el.hintFill.style.transition = "none";
    el.hintFill.style.width = "0%";
    void el.hintFill.offsetWidth; // reflow so the next change animates
    el.hintFill.style.transition = `width ${HINT_COOLDOWN}ms linear`;
    el.hintFill.style.width = "100%";
    clearTimeout(state.hintCdTimer);
    state.hintCdTimer = setTimeout(resetHintCooldown, HINT_COOLDOWN);
  }

  function resetHintCooldown() {
    clearTimeout(state.hintCdTimer);
    state.hintCdTimer = null;
    if (!el.hintFill) return;
    el.hintBtn.disabled = false;
    el.hintBtn.classList.remove("cooling");
    el.hintFill.style.transition = "none";
    el.hintFill.style.width = "0%";
  }

  // ---------- check ----------
  function check() {
    if (state.hintMode) exitHintMode();
    if (state.won) return;
    const errs = computeErrors();
    // The Check button reveals violations right away, bypassing the delay.
    cancelErrorDisplay();
    applyErrorStyles(errs);
    if (hasErrors(errs)) showBanner("Some cells break the rules.", "bad");
    else if (!isFull()) showBanner("So far so good — keep going!", "good");
    else checkWin();
  }

  // ---------- banner ----------
  function showBanner(text, kind) {
    el.banner.textContent = text;
    el.banner.className = "banner " + (kind || "");
    el.banner.hidden = false;
    clearTimeout(state.bannerTimer);
    state.bannerTimer = setTimeout(hideBanner, 1800);
  }
  function hideBanner() {
    el.banner.hidden = true;
  }

  // ---------- timer ----------
  function ensureTimer() {
    if (state.timerId) return;
    state.startTime = Date.now() - state.elapsed;
    state.timerId = setInterval(() => {
      state.elapsed = Date.now() - state.startTime;
      el.timer.textContent = formatTime(state.elapsed);
    }, 250);
  }
  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
      if (state.startTime) {
        state.elapsed = Date.now() - state.startTime;
        el.timer.textContent = formatTime(state.elapsed);
      }
    }
  }
  function resetTimer() {
    stopTimer();
    state.elapsed = 0;
    state.startTime = 0;
    el.timer.textContent = "0:00";
  }
  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  }

  // ---------- status / nav ----------
  function setActiveTab(mode) {
    document.querySelectorAll(".diff-tab").forEach((t) => {
      t.classList.toggle("is-active", t.dataset.diff === mode);
    });
  }

  function updateStatus() {
    if (isDaily()) return updateStatusDaily();
    el.levelLabel.textContent = "Level " + (state.index + 1);
    el.dailyDiff.hidden = true;
    el.dailyStreak.hidden = true;
    el.randomBtn.style.display = ""; // .nav-btn display beats the [hidden] attr
    el.levelBtn.title = "Pick a level";
    const set = solvedSet(state.diff);
    el.levelDone.hidden = !set.has(state.level.id);
    el.prevBtn.disabled = state.index === 0;
    el.nextBtn.disabled = state.index === LEVELS[state.diff].length - 1;
    el.progressText.textContent = `${set.size} / ${LEVELS[state.diff].length} solved`;
    setActiveTab(state.diff);
  }

  function updateStatusDaily() {
    const meta = state.dailyMeta;
    el.levelLabel.textContent = meta.dateStr === dateStrForOffset(0) ? "Today" : weekdayLabel(meta.dateStr);
    el.dailyDiff.textContent = meta.label;
    el.dailyDiff.hidden = false;
    el.randomBtn.style.display = "none";
    el.levelBtn.title = "Daily stats";
    const done = !!dailyData.results[meta.dateStr];
    el.levelDone.hidden = !done;
    el.prevBtn.disabled = meta.number <= 1; // can't go before day #1
    el.nextBtn.disabled = state.dailyOffset >= 0; // can't go past today
    el.progressText.textContent = `Daily #${meta.number}`;
    const stats = computeDailyStats();
    if (stats.current > 0) {
      el.dailyStreak.textContent = `🔥 ${stats.current}-day streak`;
      el.dailyStreak.hidden = false;
    } else {
      el.dailyStreak.hidden = true;
    }
    setActiveTab("daily");
  }

  function selectDiff(diff) {
    localStorage.setItem(MODE_KEY, diff);
    if (diff === "daily") {
      loadDaily(0);
      return;
    }
    state.daily = false;
    state.diff = diff;
    loadLevel(clampIndex(progress[diff].last || 0));
  }

  // ---------- level picker ----------
  function openLevelModal() {
    el.modalTitle.textContent = cap(state.diff) + " — pick a level";
    const set = solvedSet(state.diff);
    const total = LEVELS[state.diff].length;
    let html = "";
    for (let i = 0; i < total; i++) {
      const id = LEVELS[state.diff][i].id;
      const cls = "level-cell" + (set.has(id) ? " solved" : "") + (i === state.index ? " current" : "");
      html += `<button class="${cls}" data-i="${i}">${i + 1}</button>`;
    }
    el.levelGrid.innerHTML = html;
    el.levelModal.hidden = false;
    const cur = el.levelGrid.querySelector(".current");
    if (cur) cur.scrollIntoView({ block: "center" });
  }

  // ---------- events ----------
  function wireEvents() {
    // Touch: tap = forward, long-press = backward. Track to suppress the
    // synthetic click that follows a long-press, and to ignore scroll drags.
    const touch = { id: null, i: -1, x: 0, y: 0, timer: null, longFired: false, suppressClick: false };
    const clearLong = () => {
      if (touch.timer) clearTimeout(touch.timer);
      touch.timer = null;
    };
    el.board.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        const cell = e.target.closest(".cell");
        if (!cell) return;
        const t = e.touches[0];
        touch.id = t.identifier;
        touch.i = Number(cell.dataset.i);
        touch.x = t.clientX;
        touch.y = t.clientY;
        touch.longFired = false;
        clearLong();
        touch.timer = setTimeout(() => {
          touch.longFired = true;
          touch.suppressClick = true;
          cycle(touch.i, true);
          if (navigator.vibrate) navigator.vibrate(12);
        }, 420);
      },
      { passive: true }
    );
    el.board.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches[0];
        if (!t) return;
        if (Math.abs(t.clientX - touch.x) > 10 || Math.abs(t.clientY - touch.y) > 10) clearLong();
      },
      { passive: true }
    );
    el.board.addEventListener("touchend", () => clearLong(), { passive: true });
    el.board.addEventListener("touchcancel", () => clearLong(), { passive: true });

    el.board.addEventListener("click", (e) => {
      if (touch.suppressClick) {
        touch.suppressClick = false;
        return;
      }
      const cell = e.target.closest(".cell");
      if (!cell) return;
      cycle(Number(cell.dataset.i), false);
    });
    el.board.addEventListener("contextmenu", (e) => {
      const cell = e.target.closest(".cell");
      if (!cell) return;
      e.preventDefault();
      if (!("ontouchstart" in window)) cycle(Number(cell.dataset.i), true);
    });

    el.prevBtn.addEventListener("click", () => (isDaily() ? shiftDaily(-1) : loadLevel(state.index - 1)));
    el.nextBtn.addEventListener("click", () => (isDaily() ? shiftDaily(1) : loadLevel(state.index + 1)));
    el.undoBtn.addEventListener("click", undo);
    el.clearBtn.addEventListener("click", requestClear);
    el.hintBtn.addEventListener("click", hint);
    el.checkBtn.addEventListener("click", check);
    el.checkpointBtn.addEventListener("click", saveCheckpoint);
    el.restoreBtn.addEventListener("click", restoreCheckpoint);
    el.randomBtn.addEventListener("click", () => loadLevel((Math.random() * LEVELS[state.diff].length) | 0));

    document.querySelectorAll(".diff-tab").forEach((tab) => {
      tab.addEventListener("click", () => selectDiff(tab.dataset.diff));
    });

    el.profileBtn.addEventListener("click", openProfileModal);
    el.closeProfile.addEventListener("click", () => (el.profileModal.hidden = true));
    el.profileSave.addEventListener("click", () => saveProfileName(el.profileNameInput.value));
    el.profileRandomize.addEventListener("click", () => {
      el.profileNameInput.value = generateProfileName();
      el.profileNameInput.focus();
    });
    el.profileNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveProfileName(el.profileNameInput.value);
    });

    el.statsBtn.addEventListener("click", openStats);
    el.closeStats.addEventListener("click", () => (el.statsModal.hidden = true));
    el.dailyStreak.addEventListener("click", openStats);

    // Tap a row in "Recent dailies" to replay that day's puzzle.
    const playHistoryRow = (row) => {
      if (!row || !row.dataset.date) return;
      el.statsModal.hidden = true;
      loadDailyDate(row.dataset.date);
    };
    el.statsHistory.addEventListener("click", (e) =>
      playHistoryRow(e.target.closest(".hist-row"))
    );
    el.statsHistory.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const row = e.target.closest(".hist-row");
      if (!row) return;
      e.preventDefault();
      playHistoryRow(row);
    });

    el.levelBtn.addEventListener("click", () => (isDaily() ? openStats() : openLevelModal()));
    el.closeModal.addEventListener("click", () => (el.levelModal.hidden = true));
    el.levelGrid.addEventListener("click", (e) => {
      const b = e.target.closest(".level-cell");
      if (!b) return;
      el.levelModal.hidden = true;
      loadLevel(Number(b.dataset.i));
    });

    el.validateBtn.addEventListener("click", toggleValidate);
    el.themeBtn.addEventListener("click", toggleTheme);
    el.helpBtn.addEventListener("click", () => (el.helpModal.hidden = false));
    el.closeHelp.addEventListener("click", () => (el.helpModal.hidden = true));

    el.clearCancel.addEventListener("click", () => (el.clearModal.hidden = true));
    el.clearConfirm.addEventListener("click", () => {
      el.clearModal.hidden = true;
      clearBoard();
    });

    el.hintDismiss.addEventListener("click", exitHintMode);

    el.winNext.addEventListener("click", () => {
      el.winModal.hidden = true;
      if (isDaily()) {
        openStats();
      } else if (state.index < LEVELS[state.diff].length - 1) {
        loadLevel(state.index + 1);
      }
    });
    el.winClose.addEventListener("click", () => (el.winModal.hidden = true));

    [el.levelModal, el.helpModal, el.winModal, el.clearModal, el.statsModal, el.profileModal].forEach((m) => {
      m.addEventListener("click", (e) => {
        if (e.target === m) m.hidden = true;
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") isDaily() ? shiftDaily(-1) : loadLevel(state.index - 1);
      else if (e.key === "ArrowRight") isDaily() ? shiftDaily(1) : loadLevel(state.index + 1);
      else if (e.key.toLowerCase() === "z" && (e.metaKey || e.ctrlKey)) undo();
      else if (e.key === "Escape") {
        if (state.hintMode) exitHintMode();
        el.levelModal.hidden = true;
        el.helpModal.hidden = true;
        el.winModal.hidden = true;
        el.clearModal.hidden = true;
        el.statsModal.hidden = true;
        el.profileModal.hidden = true;
      }
    });
  }

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  init();
})();
