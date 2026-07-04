(() => {
  "use strict";

  const EMPTY = -1;
  const CIRCLE = 0; // blue circle
  const TRIANGLE = 1; // red triangle
  const DIFFS = ["easy", "medium", "hard", "expert"];
  const STORE_KEY = "duoforma-progress-v1";
  const THEME_KEY = "duoforma-theme-v1";
  const ERROR_DELAY = 1000; // ms of inactivity before rule violations are highlighted
  const HINT_COOLDOWN = 10000; // ms before Hint can be used again

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
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    levelBtn: document.getElementById("levelBtn"),
    progressText: document.getElementById("progressText"),
    undoBtn: document.getElementById("undoBtn"),
    clearBtn: document.getElementById("clearBtn"),
    hintBtn: document.getElementById("hintBtn"),
    checkBtn: document.getElementById("checkBtn"),
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
    clearModal: document.getElementById("clearModal"),
    clearCancel: document.getElementById("clearCancel"),
    clearConfirm: document.getElementById("clearConfirm"),
    hintFill: document.querySelector("#hintBtn .cd-fill"),
  };

  let LEVELS = null;
  const state = {
    diff: "easy",
    index: 0,
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
    validate: localStorage.getItem("duoforma-validate-v1") !== "0",
  };

  // ---------- persistence ----------
  function loadProgress() {
    let p = null;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) p = JSON.parse(raw);
    } catch (e) {}
    if (!p || typeof p !== "object") p = {};
    for (const d of DIFFS) {
      if (!p[d] || !Array.isArray(p[d].solved)) p[d] = { solved: [], last: 0 };
    }
    return p;
  }
  let progress = loadProgress();
  function saveProgress() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(progress));
    } catch (e) {}
  }
  function solvedSet(diff) {
    return new Set(progress[diff].solved);
  }

  // ---------- init ----------
  async function init() {
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
    state.diff = "easy";
    loadLevel(clampIndex(progress.easy.last || 0));
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
  function loadLevel(index) {
    state.index = clampIndex(index);
    state.level = LEVELS[state.diff][state.index];

    // adapt board to this level's size (6x6 or 8x8), rebuilding the shell if needed
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
    progress[state.diff].last = state.index;
    saveProgress();

    resetTimer();
    resetHintCooldown();
    renderConstraints();
    render();
    updateStatus();
    hideBanner();
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
    const set = solvedSet(state.diff);
    set.add(state.level.id);
    progress[state.diff].solved = [...set];
    saveProgress();
    updateStatus();
    const t = formatTime(state.elapsed);
    el.winStats.textContent =
      `${cap(state.diff)} · Level ${state.index + 1} · ${t}` +
      (state.hintsUsed ? ` · ${state.hintsUsed} hint${state.hintsUsed > 1 ? "s" : ""}` : " · no hints");
    el.winModal.hidden = false;
  }

  // ---------- hint ----------
  function hint() {
    if (state.won) return;
    const sol = state.level.solution;
    let target = -1;
    for (let i = 0; i < CELLS; i++) {
      if (state.locked[i]) continue;
      if (state.grid[i] !== EMPTY && String(state.grid[i]) !== sol[i]) {
        target = i;
        break;
      }
    }
    if (target === -1) {
      const empties = [];
      for (let i = 0; i < CELLS; i++) if (!state.locked[i] && state.grid[i] === EMPTY) empties.push(i);
      if (!empties.length) {
        showBanner("Board is full — check for mistakes.", "bad");
        return;
      }
      target = empties[(Math.random() * empties.length) | 0];
    }
    state.history.push({ i: target, prev: state.grid[target] });
    state.grid[target] = Number(sol[target]);
    state.hintsUsed++;
    ensureTimer();
    render();
    const cell = state.cellEls[target];
    cell.classList.remove("hintflash");
    void cell.offsetWidth;
    cell.classList.add("hintflash");
    startHintCooldown();
    checkWin();
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
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
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
  function updateStatus() {
    el.levelLabel.textContent = "Level " + (state.index + 1);
    const set = solvedSet(state.diff);
    el.levelDone.hidden = !set.has(state.level.id);
    el.prevBtn.disabled = state.index === 0;
    el.nextBtn.disabled = state.index === LEVELS[state.diff].length - 1;
    el.progressText.textContent = `${set.size} / ${LEVELS[state.diff].length} solved`;
    DIFFS.forEach((d) => {
      document.querySelector(`.diff-tab[data-diff="${d}"]`).classList.toggle("is-active", d === state.diff);
    });
  }

  function selectDiff(diff) {
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

    el.prevBtn.addEventListener("click", () => loadLevel(state.index - 1));
    el.nextBtn.addEventListener("click", () => loadLevel(state.index + 1));
    el.undoBtn.addEventListener("click", undo);
    el.clearBtn.addEventListener("click", requestClear);
    el.hintBtn.addEventListener("click", hint);
    el.checkBtn.addEventListener("click", check);
    el.randomBtn.addEventListener("click", () => loadLevel((Math.random() * LEVELS[state.diff].length) | 0));

    DIFFS.forEach((d) => {
      document.querySelector(`.diff-tab[data-diff="${d}"]`).addEventListener("click", () => selectDiff(d));
    });

    el.levelBtn.addEventListener("click", openLevelModal);
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

    el.winNext.addEventListener("click", () => {
      el.winModal.hidden = true;
      if (state.index < LEVELS[state.diff].length - 1) loadLevel(state.index + 1);
    });
    el.winClose.addEventListener("click", () => (el.winModal.hidden = true));

    [el.levelModal, el.helpModal, el.winModal, el.clearModal].forEach((m) => {
      m.addEventListener("click", (e) => {
        if (e.target === m) m.hidden = true;
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") loadLevel(state.index - 1);
      else if (e.key === "ArrowRight") loadLevel(state.index + 1);
      else if (e.key.toLowerCase() === "z" && (e.metaKey || e.ctrlKey)) undo();
      else if (e.key === "Escape") {
        el.levelModal.hidden = true;
        el.helpModal.hidden = true;
        el.winModal.hidden = true;
        el.clearModal.hidden = true;
      }
    });
  }

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  init();
})();
