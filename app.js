/* ============================================================
   POWERSORT — interactive explainer
   Act 1: the virtual perfectly balanced binary tree (hero)
   Act 2: powersort's run stack + merge tree (playground)
   ============================================================ */
"use strict";

/* ---------- brand colors (kept in sync with style.css) ---------- */
const C = {
  darkblue: "#001C6B",
  blue: "#380FFF",
  lightblue: "#0DEDF7",
  green: "#00D600",
  lime: "#B5FF00",
  yellow: "#FFFF00",
};

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SVGNS = "http://www.w3.org/2000/svg";

/* ---------- tiny helpers ---------- */
function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  if (parent) parent.appendChild(node);
  return node;
}

const easeOutCubic = (u) => 1 - Math.pow(1 - u, 3);
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
// a "drop with a little bounce past the target"
const easeOutBack = (u) => {
  const c1 = 1.20158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
};
// a real bounce — for things that fall and get stuck
const easeOutBounce = (u) => {
  const n1 = 7.5625, d1 = 2.75;
  if (u < 1 / d1) return n1 * u * u;
  if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75;
  if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375;
  return n1 * (u -= 2.625 / d1) * u + 0.984375;
};

function sleep(ms, token) {
  if (REDUCED || ms <= 0 || (token && (token.cancelled || token.instant))) return Promise.resolve();
  return new Promise((res) => setTimeout(res, ms));
}

function tween(dur, apply, ease = easeOutCubic, token = null) {
  return new Promise((res) => {
    if (REDUCED || dur <= 16 || (token && (token.cancelled || token.instant))) { apply(1); res(); return; }
    const t0 = performance.now();
    const frame = (t) => {
      if (token && token.cancelled) { apply(1); res(); return; }
      const u = Math.min(1, (t - t0) / dur);
      apply(ease(u));
      if (u < 1) requestAnimationFrame(frame); else res();
    };
    requestAnimationFrame(frame);
  });
}

/* ============================================================
   SHARED MATH — runs, powers, node positions
   ============================================================ */

/** power of the boundary between segments r1 and r2 (start/len), array length n */
function boundaryPower(r1, r2, n) {
  const a = (r1.start + r1.len / 2) / n;
  const b = (r2.start + r2.len / 2) / n;
  let l = 0;
  while (Math.floor(a * Math.pow(2, l)) === Math.floor(b * Math.pow(2, l))) l++;
  return l;
}

/** fraction (in [0,1]) of the shallowest tree node strictly between midpoints a<b, at depth p */
function nodeFraction(r1, r2, n, p) {
  const a = (r1.start + r1.len / 2) / n;
  const m = Math.floor(a * Math.pow(2, p)) + 1;
  return m / Math.pow(2, p);
}

/** first m binary digits of f ∈ [0,1) */
function binaryBits(f, m) {
  const out = [];
  let x = f;
  for (let k = 0; k < m; k++) { x *= 2; const b = x >= 1 ? 1 : 0; out.push(b); x -= b; }
  return out;
}

/** build a "descending staircase of ascending runs" from run lengths */
function arrayFromRunLengths(lens) {
  const values = [];
  const suffix = [];
  let s = 0;
  for (let k = lens.length - 1; k >= 0; k--) { suffix[k] = s; s += lens[k]; }
  lens.forEach((len, k) => {
    for (let v = 0; v < len; v++) values.push(suffix[k] + 1 + v);
  });
  return values;
}

/** all (fraction, level) nodes of the virtual balanced tree down to maxLevel */
function virtualNodes(maxLevel) {
  const nodes = [];
  for (let l = 1; l <= maxLevel; l++) {
    const denom = Math.pow(2, l);
    for (let k = 1; k < denom; k += 2) nodes.push({ frac: k / denom, level: l });
  }
  return nodes;
}

/* ============================================================
   ACT 1 — HERO: the tree drops in (recreates the brand GIF)
   ============================================================ */

const HERO = (() => {
  const svg = document.getElementById("heroSvg");
  const caption = document.getElementById("heroCaption");
  const replayBtn = document.getElementById("heroReplay");

  // exact example from the showcase GIF: 10 runs, n = 50
  const RUN_LENS = [7, 3, 1, 1, 6, 16, 6, 1, 3, 6];
  const values = arrayFromRunLengths(RUN_LENS);
  const n = values.length;
  const runs = [];
  { let s = 0; for (const len of RUN_LENS) { runs.push({ start: s, len }); s += len; } }

  // geometry (viewBox 1520 x 700)
  const W = 1520, padX = 42, plotW = W - 2 * padX;
  const xAt = (i) => padX + (i / n) * plotW;
  const RUN_Y = 18, RUN_H = 42;
  const CHIP_Y = 70;
  const TREE_TOP = 128, BASE_Y = 596, LEVELS = 5;
  const levelY = (l) => TREE_TOP + (l - 1) * ((BASE_Y - 110 - TREE_TOP) / (LEVELS - 1));
  const barW = (l) => 17 - (l - 1) * 2.6;

  let token = { cancelled: true };
  let started = false;

  function buildStatic() {
    svg.innerHTML = "";
    const gRuns = el("g", { id: "hRuns" }, svg);
    const gBand = el("g", { id: "hBand" }, svg);
    const gTree = el("g", { id: "hTree" }, svg);
    const gRuler = el("g", { id: "hRuler" }, svg);
    const gChips = el("g", { id: "hChips" }, svg);

    // --- run boxes with values ---
    const runEls = runs.map((r, ri) => {
      const g = el("g", { opacity: 0 }, gRuns);
      const x0 = xAt(r.start) + 2.5, x1 = xAt(r.start + r.len) - 2.5;
      el("rect", { x: x0, y: RUN_Y, width: x1 - x0, height: RUN_H, rx: 8, class: "svg-run-box" }, g);
      for (let k = 0; k < r.len; k++) {
        el("text", {
          x: xAt(r.start + k + 0.5), y: RUN_Y + RUN_H / 2 + 5.5,
          "text-anchor": "middle", "font-size": 15.5, class: "svg-run-num",
          text: values[r.start + k],
        }, g);
      }
      return g;
    });

    // --- ruler ---
    el("line", { x1: padX, y1: BASE_Y + 14, x2: padX + plotW, y2: BASE_Y + 14, class: "svg-ruler" }, gRuler);
    for (let i = 0; i <= n; i++) {
      el("line", { x1: xAt(i), y1: BASE_Y + 7, x2: xAt(i), y2: BASE_Y + 21, class: "svg-ruler", "stroke-width": 1.6 }, gRuler);
    }

    // --- tree bars (hidden above the canvas, ready to drop) ---
    const nodes = virtualNodes(LEVELS).map((nd) => {
      const x = padX + nd.frac * plotW;
      const top = levelY(nd.level);
      const g = el("g", {}, gTree);
      const h = BASE_Y - top;
      const drop = el("g", { transform: `translate(0 ${-(BASE_Y + 60)})` }, g);
      el("rect", {
        x: x - barW(nd.level) / 2, y: top, width: barW(nd.level), height: h,
        rx: barW(nd.level) / 2, class: "svg-bar",
      }, drop);
      const digit = el("text", {
        x, y: top - 10, "text-anchor": "middle", "font-size": 21,
        fill: C.lightblue, class: "svg-power-digit", opacity: 0, text: nd.level,
      }, g);
      return { ...nd, x, top, g, drop, digit, rect: drop.firstChild };
    });

    // --- edges parent -> child (drawn later) ---
    const edges = [];
    for (const nd of nodes) {
      if (nd.level === 1) continue;
      const k = Math.round(nd.frac * Math.pow(2, nd.level));
      const pk = ((k - 1) / 2) % 2 === 1 ? (k - 1) / 2 : (k + 1) / 2;
      // reduce parent numerator to its own level
      let num = pk, lev = nd.level - 1;
      while (num % 2 === 0) { num /= 2; lev -= 1; }
      const parent = nodes.find((o) => o.level === lev && Math.round(o.frac * Math.pow(2, lev)) === num);
      if (!parent) continue;
      const line = el("line", {
        x1: parent.x, y1: parent.top, x2: nd.x, y2: nd.top,
        class: "svg-edge", opacity: 0,
      }, gTree);
      edges.push({ line, childLevel: nd.level, len: Math.hypot(nd.x - parent.x, nd.top - parent.top) });
    }

    return { gRuns, gBand, gTree, gRuler, gChips, runEls, nodes, edges };
  }

  async function playIntro(S, tk) {
    // 1 · runs appear
    caption.textContent = "scan once → chop the input into sorted runs";
    for (const g of S.runEls) {
      if (tk.cancelled) return;
      tween(360, (u) => g.setAttribute("opacity", u), easeOutCubic, tk);
      await sleep(95, tk);
    }
    await sleep(500, tk);
    if (tk.cancelled) return;

    // 2 · bars drop level by level
    caption.textContent = "node powers of a (virtual) perfectly balanced binary tree";
    for (let l = 1; l <= LEVELS; l++) {
      if (tk.cancelled) return;
      const lvlNodes = S.nodes.filter((nd) => nd.level === l);
      const lvlEdges = S.edges.filter((e) => e.childLevel === l);
      for (const e of lvlEdges) {
        e.line.setAttribute("stroke-dasharray", e.len);
        e.line.setAttribute("stroke-dashoffset", e.len);
        e.line.setAttribute("opacity", 1);
        tween(420, (u) => e.line.setAttribute("stroke-dashoffset", e.len * (1 - u)), easeOutCubic, tk);
      }
      const drops = lvlNodes.map((nd, idx) =>
        (async () => {
          await sleep(idx * 55, tk);
          const from = -(BASE_Y + 60);
          await tween(650, (u) => {
            nd.drop.setAttribute("transform", `translate(0 ${from * (1 - u)})`);
          }, easeOutBack, tk);
          tween(220, (u) => nd.digit.setAttribute("opacity", u), easeOutCubic, tk);
        })()
      );
      await Promise.all(drops);
      await sleep(140, tk);
    }
    await sleep(650, tk);
  }

  /** the half-open interval (a, b] as an SVG group: open paren, line, closing bracket */
  function makeInterval(xa, xb) {
    const g = el("g", { opacity: 0 });
    el("line", {
      x1: xa + 13, y1: 0, x2: xb - 3, y2: 0,
      stroke: C.lime, "stroke-width": 5, "stroke-linecap": "round",
    }, g);
    el("path", {
      d: `M ${xa + 14} -12 Q ${xa - 1} 0 ${xa + 14} 12`,
      stroke: C.lime, "stroke-width": 4, fill: "none", "stroke-linecap": "round",
    }, g);
    el("path", {
      d: `M ${xb - 11} -12 L ${xb} -12 L ${xb} 12 L ${xb - 11} 12`,
      stroke: C.lime, "stroke-width": 4, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round",
    }, g);
    return g;
  }

  /** binary readout of the two midpoints, shared prefix in lime, first differing bit in yellow */
  function makeBinaryReadout(fa, fb, p, gParent) {
    const m = Math.min(12, Math.max(p + 3, 8));
    const bitsA = binaryBits(fa, m), bitsB = binaryBits(fb, m);
    const FS = 23, CW = FS * 0.602; // IBM Plex Mono advance ≈ 0.6em
    const label = ["a = 0.", "b = 0."];
    const totalChars = label[0].length + m;
    const x0 = 760 - (totalChars * CW) / 2;
    const g = el("g", { opacity: 0 }, gParent);
    [bitsA, bitsB].forEach((bits, row) => {
      const t = el("text", {
        x: x0, y: 652 + row * 32, "font-size": FS,
        class: "svg-binary", fill: C.lightblue,
      }, g);
      const lab = document.createElementNS(SVGNS, "tspan");
      lab.textContent = label[row]; t.appendChild(lab);
      bits.forEach((b, i) => {
        const ts = document.createElementNS(SVGNS, "tspan");
        ts.textContent = b;
        const k = i + 1; // 1-based bit index
        if (k < p) { ts.setAttribute("fill", C.lime); ts.setAttribute("font-weight", 700); }
        else if (k === p) { ts.setAttribute("fill", C.yellow); ts.setAttribute("font-weight", 700); }
        else { ts.setAttribute("fill", C.lightblue); ts.setAttribute("opacity", 0.45); }
        t.appendChild(ts);
      });
      t.appendChild(document.createTextNode("\u2026"));
    });
    el("text", {
      x: x0 + (totalChars + 1.6) * CW, y: 652 + 16, "font-size": FS,
      class: "svg-binary", fill: C.yellow, "font-weight": 700,
      text: `→ p = ${p}`,
    }, g);
    return g;
  }

  async function playBoundaries(S, tk) {
    caption.textContent = "each boundary's midpoint interval (a, b] drops until it lands on the tallest pole in its way — that depth is the power";
    for (let b = 0; b < runs.length - 1; b++) {
      if (tk.cancelled) return;
      const L = runs[b], R = runs[b + 1];
      const p = boundaryPower(L, R, n);
      const fa = (L.start + L.len / 2) / n;
      const fb = (R.start + R.len / 2) / n;
      const fNode = nodeFraction(L, R, n, p);
      const xa = padX + fa * plotW, xb = padX + fb * plotW;

      // background band + midpoint markers on the ruler
      const band = el("rect", {
        x: xa, y: TREE_TOP - 34, width: xb - xa, height: BASE_Y + 20 - (TREE_TOP - 34),
        fill: C.blue, opacity: 0,
      }, S.gBand);
      const edgeA = el("line", { x1: xa, y1: TREE_TOP - 34, x2: xa, y2: BASE_Y + 20, stroke: C.lime, "stroke-width": 1.6, "stroke-dasharray": "5 6", opacity: 0 }, S.gBand);
      const edgeB = el("line", { x1: xb, y1: TREE_TOP - 34, x2: xb, y2: BASE_Y + 20, stroke: C.lime, "stroke-width": 1.6, "stroke-dasharray": "5 6", opacity: 0 }, S.gBand);
      const mkA = el("circle", { cx: xa, cy: BASE_Y + 14, r: 7, fill: C.lime, opacity: 0 }, S.gBand);
      const mkB = el("circle", { cx: xb, cy: BASE_Y + 14, r: 7, fill: C.lime, opacity: 0 }, S.gBand);
      const gBin = makeBinaryReadout(fa, fb, p, S.gBand);
      tween(240, (u) => {
        band.setAttribute("opacity", 0.30 * u);
        edgeA.setAttribute("opacity", 0.85 * u); edgeB.setAttribute("opacity", 0.85 * u);
        mkA.setAttribute("opacity", u); mkB.setAttribute("opacity", u);
        gBin.setAttribute("opacity", u);
      }, easeOutCubic, tk);
      await sleep(340, tk);
      if (tk.cancelled) { band.remove(); edgeA.remove(); edgeB.remove(); mkA.remove(); mkB.remove(); gBin.remove(); return; }

      // the half-open interval (a, b] drops until it lands on the tallest pole inside it
      const gInt = makeInterval(xa, xb);
      S.gBand.appendChild(gInt);
      const yStart = TREE_TOP - 22;
      const yLand = levelY(p) - 2; // the line itself rests on the pole (the (—] end markers wrap around it)
      gInt.setAttribute("transform", `translate(0 ${yStart})`);
      await tween(220, (u) => gInt.setAttribute("opacity", u), easeOutCubic, tk);
      await sleep(160, tk);
      await tween(760, (u) => {
        gInt.setAttribute("transform", `translate(0 ${yStart + (yLand - yStart) * u})`);
      }, easeOutBounce, tk);

      // it's stuck — flash the pole it landed on
      const node = S.nodes.find((nd) => nd.level === p && Math.abs(nd.frac - fNode) < 1e-9);
      if (node) {
        node.rect.classList.add("flash");
        node.digit.setAttribute("fill", C.yellow);
        node.digit.setAttribute("font-size", 27);
      }
      // chip with the boundary's power between the two run boxes
      const bx = xAt(R.start);
      const chip = el("g", { opacity: 0 }, S.gChips);
      el("rect", { x: bx - 14, y: CHIP_Y, width: 28, height: 30, rx: 7, fill: C.lime }, chip);
      el("text", {
        x: bx, y: CHIP_Y + 21.5, "text-anchor": "middle", "font-size": 19,
        "font-weight": 700, fill: C.darkblue, class: "svg-power-digit", text: p,
      }, chip);
      await tween(240, (u) => chip.setAttribute("opacity", u), easeOutCubic, tk);
      await sleep(560, tk);

      if (node) {
        node.rect.classList.remove("flash");
        node.digit.setAttribute("fill", C.lightblue);
        node.digit.setAttribute("font-size", 21);
      }
      tween(260, (u) => {
        band.setAttribute("opacity", 0.30 * (1 - u));
        edgeA.setAttribute("opacity", 0.85 * (1 - u)); edgeB.setAttribute("opacity", 0.85 * (1 - u));
        mkA.setAttribute("opacity", 1 - u); mkB.setAttribute("opacity", 1 - u);
        gBin.setAttribute("opacity", 1 - u); gInt.setAttribute("opacity", 1 - u);
      }, easeOutCubic, tk).then(() => { band.remove(); edgeA.remove(); edgeB.remove(); mkA.remove(); mkB.remove(); gBin.remove(); gInt.remove(); });
      await sleep(120, tk);
    }
    if (tk.cancelled) return;
    caption.textContent = "boundary powers decide the merge order — that's all of Powersort's policy ↓";
  }

  async function run() {
    token.cancelled = true;
    token = { cancelled: false };
    const tk = token;
    const S = buildStatic();
    await sleep(250, tk);
    await playIntro(S, tk);
    if (tk.cancelled) return;
    await playBoundaries(S, tk);
  }

  replayBtn.addEventListener("click", run);

  // start when scrolled into view (once)
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !started) {
      started = true;
      run();
      io.disconnect();
    }
  }, { threshold: 0.35 });
  io.observe(svg);

  return { run };
})();

/* ============================================================
   POWERSORT ENGINE — simulate and record events
   ============================================================ */

function runLabel(idx) {
  const L = "abcdefghijklmnopqrstuvwxyz";
  return idx < 26 ? L[idx] : L[idx % 26] + Math.floor(idx / 26);
}

function displayLabel(label) {
  if (label.length <= 4) return label;
  return label[0] + "\u2026" + label[label.length - 1];
}

/**
 * Simulates powersort on values[] using maximal weakly-increasing runs
 * (like the talk slides; real implementations also reverse descending runs).
 * Returns { events, maxPower, boundaries }.
 */
function simulatePowersort(values) {
  const n = values.length;
  const work = values.map((v, i) => ({ v, id: i }));
  const events = [];
  const stack = []; // {start, len, power, label, nodeId}
  let runCount = 0, nodeCount = 0, mergeCount = 0, maxPower = 1, mergeCost = 0;
  const boundaries = [];

  function extendRun(i) {
    let j = i + 1;
    while (j < n && work[j].v >= work[j - 1].v) j++;
    return j;
  }

  function segSnap(s) {
    return { start: s.start, len: s.len, power: s.power, label: s.label, nodeId: s.nodeId };
  }

  function mergeTop(finale) {
    const B = stack.pop(), A = stack.pop();
    const left = work.slice(A.start, A.start + A.len);
    const right = work.slice(B.start, B.start + B.len);
    const merged = [];
    let x = 0, y = 0;
    while (x < left.length && y < right.length)
      merged.push(left[x].v <= right[y].v ? left[x++] : right[y++]);
    while (x < left.length) merged.push(left[x++]);
    while (y < right.length) merged.push(right[y++]);
    for (let k = 0; k < merged.length; k++) work[A.start + k] = merged[k];

    const nodeId = nodeCount++;
    const seg = {
      start: A.start, len: A.len + B.len, power: A.power,
      label: A.label + B.label, nodeId,
    };
    stack.push(seg);
    mergeCount++;
    mergeCost += seg.len; // colab: MERGE_COST += length of merged result
    events.push({
      t: "merge", finale: !!finale,
      A: segSnap(A), B: segSnap(B), seg: segSnap(seg),
      boundary: B.start, boundaryPower: B.power, nodeId,
      cost: seg.len, costSoFar: mergeCost,
      newOrder: merged.map((m) => m.id),
    });
  }

  // first run
  let i = 0;
  let j = extendRun(0);
  const firstLabel = runLabel(runCount++);
  events.push({ t: "run", start: 0, len: j, label: firstLabel, first: true });
  stack.push({ start: 0, len: j, power: 0, label: firstLabel, nodeId: null });
  events.push({ t: "push", label: firstLabel, p: 0, first: true });
  i = j;

  while (i < n) {
    j = extendRun(i);
    const label = runLabel(runCount++);
    const newRun = { start: i, len: j - i };
    events.push({ t: "run", start: i, len: j - i, label, first: false });

    const top = stack[stack.length - 1];
    const p = boundaryPower(top, newRun, n);
    maxPower = Math.max(maxPower, p);
    const fNode = nodeFraction(top, newRun, n, p);
    boundaries.push({ index: i, power: p });
    events.push({
      t: "power", p,
      aFrac: (top.start + top.len / 2) / n,
      bFrac: (newRun.start + newRun.len / 2) / n,
      nodeFrac: fNode, boundary: i,
      leftLabel: top.label, rightLabel: label,
    });

    while (p <= stack[stack.length - 1].power) mergeTop(false);

    stack.push({ start: i, len: j - i, power: p, label, nodeId: null });
    events.push({ t: "push", label, p, first: false });
    i = j;
  }

  if (stack.length >= 2) events.push({ t: "finale" });
  while (stack.length >= 2) mergeTop(true);

  events.push({ t: "done", order: work.map((w) => w.id), merges: mergeCount, runs: runCount, mergeCost });
  return { events, maxPower, boundaries, runCount };
}

/* ============================================================
   ACT 2 — PLAYGROUND
   ============================================================ */

const PLAY = (() => {
  const svg = document.getElementById("playSvg");
  const stackBox = document.getElementById("stackBox");
  const narration = document.getElementById("narration");
  const codeLines = {};
  for (let l = 1; l <= 13; l++) codeLines[l] = document.getElementById("cl" + l);

  const presetSelect = document.getElementById("presetSelect");
  const modeSelect = document.getElementById("modeSelect");
  const dataInput = document.getElementById("dataInput");
  const inputLabel = document.getElementById("inputLabel");
  const applyBtn = document.getElementById("applyBtn");
  const playBtn = document.getElementById("playBtn");
  const backBtn = document.getElementById("backBtn");
  const stepBtn = document.getElementById("stepBtn");
  const resetBtn = document.getElementById("resetBtn");
  const speedRange = document.getElementById("speedRange");

  /* ----- geometry (viewBox 1200 x 640) ----- */
  const W = 1200, padX = 34, plotW = W - 2 * padX;
  const TREE_TOP = 22, TREE_BASE = 390;
  const DIGIT_Y = 411;
  const BOX_TOP = 422, BOX_BOT = 560, BAR_BASE = 552, BAR_MAXH = 118;
  const LABEL_Y = 582, RULER_Y = 604;

  /* ----- state ----- */
  let values = [];
  let sim = null;
  let evIndex = 0;
  let playing = false, busy = false;
  let token = { cancelled: false };
  let speed = 1;
  const D = (ms) => (REDUCED ? 0 : ms / speed);

  let n = 0, xAt = () => 0, barWpx = 0, minV = 0, maxV = 1;
  let bars = [];          // by id: {rect, pos}
  let runBoxes = new Map(); // label -> {g}
  let treeNodes = new Map(); // nodeId -> {x,y}
  let digitEls = new Map();  // boundary index -> text el
  let layers = {};
  let maxLevel = 5;
  let liveBand = null;    // the currently shown midpoint-interval highlight

  /* remove the interval highlight of the previous power computation */
  function clearBand() {
    if (!liveBand) return;
    const { g, ghost, digit } = liveBand;
    liveBand = null;
    if (ghost && ghost.isConnected) { ghost.setAttribute("fill", C.lightblue); ghost.setAttribute("opacity", 0.13); }
    if (digit && digit.isConnected) digit.setAttribute("fill", C.lightblue);
    if (g && g.isConnected) {
      tween(D(200), (u) => g.setAttribute("opacity", 1 - u), easeOutCubic, token).then(() => g.remove());
    }
  }

  const levelY = (l) =>
    TREE_TOP + 8 + (Math.min(l, maxLevel) - 1) * ((TREE_BASE - 40 - TREE_TOP) / Math.max(maxLevel - 1, 1));

  function barH(v) {
    if (maxV === minV) return BAR_MAXH * 0.6;
    return 12 + ((v - minV) / (maxV - minV)) * (BAR_MAXH - 12);
  }

  function setLine(l) {
    for (const elc of Object.values(codeLines)) elc.classList.remove("active");
    if (l) codeLines[l].classList.add("active");
  }

  function say(text) { narration.textContent = text; }

  /* ----- build the static scene for the current values ----- */
  function buildScene() {
    svg.innerHTML = "";
    stackBox.innerHTML = "";
    setLine(null);
    liveBand = null;
    bars = []; runBoxes = new Map(); treeNodes = new Map(); digitEls = new Map();

    n = values.length;
    xAt = (i) => padX + (i / n) * plotW;
    barWpx = Math.max(1.5, plotW / n - Math.min(3, (plotW / n) * 0.2));
    minV = Math.min(...values); maxV = Math.max(...values);

    layers.band = el("g", {}, svg);
    layers.ghost = el("g", { id: "pGhost" }, svg);
    layers.tree = el("g", {}, svg);
    layers.digits = el("g", {}, svg);
    layers.boxes = el("g", {}, svg);
    layers.bars = el("g", {}, svg);
    layers.ruler = el("g", {}, svg);

    // faint virtual tree in the background — the "power computation" backdrop
    maxLevel = Math.max(3, Math.min(8, sim ? sim.maxPower : 5));
    for (const nd of virtualNodes(maxLevel)) {
      const x = padX + nd.frac * plotW;
      const w = Math.max(2.5, 9 - nd.level);
      el("rect", {
        x: x - w / 2, y: levelY(nd.level), width: w, height: TREE_BASE - levelY(nd.level),
        rx: w / 2, fill: C.lightblue, opacity: 0.13,
        "data-frac": nd.frac, "data-level": nd.level,
      }, layers.ghost);
    }

    // value bars
    values.forEach((v, id) => {
      const rect = el("rect", {
        x: xAt(id) + (plotW / n - barWpx) / 2, y: BAR_BASE - barH(v),
        width: barWpx, height: barH(v), rx: Math.min(3, barWpx / 2),
        class: "svg-bar",
      }, layers.bars);
      bars[id] = { rect, pos: id };
    });

    // ruler
    el("line", { x1: padX, y1: RULER_Y, x2: padX + plotW, y2: RULER_Y, class: "svg-ruler" }, layers.ruler);
    const tickStep = n > 64 ? Math.ceil(n / 64) : 1;
    for (let i = 0; i <= n; i += tickStep) {
      el("line", { x1: xAt(i), y1: RULER_Y - 6, x2: xAt(i), y2: RULER_Y + 6, class: "svg-ruler", "stroke-width": 1.4 }, layers.ruler);
    }
  }

  function barX(pos) { return xAt(pos) + (plotW / n - barWpx) / 2; }

  function addRunBox(seg, animateIn = true) {
    const g = el("g", { opacity: animateIn ? 0 : 1 }, layers.boxes);
    const x0 = xAt(seg.start) + 1.5, x1 = xAt(seg.start + seg.len) - 1.5;
    el("rect", {
      x: x0, y: BOX_TOP, width: x1 - x0, height: BOX_BOT - BOX_TOP, rx: 8,
      fill: "rgba(181,255,0,0.06)", stroke: C.lime, "stroke-width": 2,
    }, g);
    el("text", {
      x: (x0 + x1) / 2, y: LABEL_Y, "text-anchor": "middle",
      "font-size": Math.min(20, Math.max(13, (x1 - x0) / 4)),
      "font-weight": 700, fill: C.lime, class: "svg-power-digit",
      text: displayLabel(seg.label),
    }, g);
    runBoxes.set(seg.label, g);
    return g;
  }

  function leafAnchor(seg) {
    return { x: xAt(seg.start + seg.len / 2), y: BOX_TOP };
  }

  function childAnchor(seg) {
    if (seg.nodeId !== null && treeNodes.has(seg.nodeId)) return treeNodes.get(seg.nodeId);
    return leafAnchor(seg);
  }

  /* ----- stack panel helpers ----- */
  function stackAdd(label, p) {
    const div = document.createElement("div");
    div.className = "stack-entry enter";
    div.innerHTML = `<span class="lbl">${displayLabel(label)}</span><span class="pw">p = ${p}</span>`;
    div.dataset.label = label;
    stackBox.appendChild(div);
    requestAnimationFrame(() => div.classList.remove("enter"));
    return div;
  }

  function stackTopTwo() {
    const kids = stackBox.children;
    return [kids[kids.length - 2], kids[kids.length - 1]];
  }

  /* ----- event execution ----- */
  async function doEvent(ev, tk) {
    if (tk.cancelled) return;
    clearBand(); // the previous power highlight lives until the next event begins
    switch (ev.t) {
      case "run": {
        setLine(ev.first ? 4 : 7);
        say(`extend_run → run ${ev.label}: ${ev.len} element${ev.len > 1 ? "s" : ""}`);
        const g = addRunBox({ start: ev.start, len: ev.len, label: ev.label });
        await tween(D(320), (u) => g.setAttribute("opacity", u), easeOutCubic, tk);
        await sleep(D(240), tk);
        break;
      }
      case "power": {
        setLine(8);
        say(`power(${displayLabel(ev.leftLabel)}, ${ev.rightLabel}) = ${ev.p}`);
        const xa = padX + ev.aFrac * plotW, xb = padX + ev.bFrac * plotW;
        const g = el("g", { opacity: 0 }, layers.band);
        el("rect", {
          x: xa, y: TREE_TOP, width: xb - xa, height: RULER_Y - TREE_TOP,
          fill: C.blue, opacity: 0.32,
        }, g);
        el("line", { x1: xa, y1: TREE_TOP, x2: xa, y2: RULER_Y, stroke: C.lime, "stroke-width": 1.5, "stroke-dasharray": "4 5", opacity: 0.85 }, g);
        el("line", { x1: xb, y1: TREE_TOP, x2: xb, y2: RULER_Y, stroke: C.lime, "stroke-width": 1.5, "stroke-dasharray": "4 5", opacity: 0.85 }, g);
        el("circle", { cx: xa, cy: RULER_Y, r: 6, fill: C.lime }, g);
        el("circle", { cx: xb, cy: RULER_Y, r: 6, fill: C.lime }, g);
        // the half-open interval (a, b] resting on the winning ghost pole
        const yInt = levelY(ev.p) - 2; // line rests on the pole, matching the hero
        el("line", { x1: xa + 9, y1: yInt, x2: xb - 2, y2: yInt, stroke: C.lime, "stroke-width": 3.5, "stroke-linecap": "round" }, g);
        el("path", { d: `M ${xa + 10} ${yInt - 8} Q ${xa} ${yInt} ${xa + 10} ${yInt + 8}`, stroke: C.lime, "stroke-width": 3, fill: "none", "stroke-linecap": "round" }, g);
        el("path", { d: `M ${xb - 8} ${yInt - 8} L ${xb} ${yInt - 8} L ${xb} ${yInt + 8} L ${xb - 8} ${yInt + 8}`, stroke: C.lime, "stroke-width": 3, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, g);

        // highlight the ghost bar of the shallowest node in the interval
        const ghost = [...layers.ghost.children].find(
          (r) => +r.dataset.level === ev.p && Math.abs(+r.dataset.frac - ev.nodeFrac) < 1e-9
        );
        if (ghost) { ghost.setAttribute("fill", C.yellow); ghost.setAttribute("opacity", 0.95); }

        // boundary power digit
        const digit = el("text", {
          x: xAt(ev.boundary), y: DIGIT_Y, "text-anchor": "middle",
          "font-size": 19, "font-weight": 700, class: "svg-power-digit",
          fill: C.yellow, opacity: 0, text: ev.p,
        }, layers.digits);
        digitEls.set(ev.boundary, digit);
        liveBand = { g, ghost, digit }; // stays visible until the next event
        tween(D(220), (u) => g.setAttribute("opacity", u), easeOutCubic, tk);
        await tween(D(220), (u) => digit.setAttribute("opacity", u), easeOutCubic, tk);
        await sleep(D(520), tk);
        break;
      }
      case "push": {
        setLine(ev.first ? 5 : 11);
        say(`push ${ev.label} with power ${ev.p}`);
        stackAdd(ev.label, ev.p);
        await sleep(D(340), tk);
        break;
      }
      case "finale": {
        setLine(12);
        say("input exhausted — merge everything that is left, top-down");
        await sleep(D(600), tk);
        break;
      }
      case "merge": {
        setLine(ev.finale ? 13 : 10);
        if (!ev.finale) {
          say(`p \u2264 ${ev.A.power} on top of the stack → merge ${displayLabel(ev.A.label)} and ${displayLabel(ev.B.label)} (cost +${ev.cost})`);
        } else {
          say(`merge ${displayLabel(ev.A.label)} and ${displayLabel(ev.B.label)} (cost +${ev.cost})`);
        }

        // 1 · stack: heat the two bottom entries, fuse them
        const [dA, dB] = stackTopTwo();
        if (dA && dB) { dA.classList.add("hot"); dB.classList.add("hot"); }
        await sleep(D(360), tk);
        if (tk.cancelled) return;

        // 2 · grow the merge tree: node at the merged boundary
        const x = xAt(ev.boundary), y = levelY(ev.boundaryPower);
        const a1 = childAnchor(ev.A), a2 = childAnchor(ev.B);
        const g = el("g", {}, layers.tree);
        for (const a of [a1, a2]) {
          const line = el("line", { x1: x, y1: y, x2: a.x, y2: a.y, class: "svg-edge", "stroke-width": 3 }, g);
          const len = Math.hypot(a.x - x, a.y - y);
          line.setAttribute("stroke-dasharray", len);
          line.setAttribute("stroke-dashoffset", len);
          tween(D(360), (u) => line.setAttribute("stroke-dashoffset", len * (1 - u)), easeOutCubic, tk);
        }
        const dot = el("g", { opacity: 0 }, g);
        el("circle", { cx: x, cy: y, r: 12, fill: C.lightblue }, dot);
        el("text", {
          x, y: y + 5, "text-anchor": "middle", "font-size": 15, "font-weight": 700,
          fill: C.darkblue, class: "svg-power-digit", text: ev.boundaryPower,
        }, dot);
        treeNodes.set(ev.nodeId, { x, y });
        tween(D(300), (u) => dot.setAttribute("opacity", u), easeOutCubic, tk);
        const digit = digitEls.get(ev.boundary);
        if (digit) digit.setAttribute("opacity", 0.35);

        // 3 · reorder the bars of the merged span + fuse the run boxes
        const startPos = ev.A.start;
        const moves = ev.newOrder.map((id, k) => ({ bar: bars[id], to: startPos + k, fromX: 0, toX: 0 }));
        for (const m of moves) { m.fromX = barX(m.bar.pos); m.toX = barX(m.to); }
        await tween(D(560), (u) => {
          for (const m of moves) m.bar.rect.setAttribute("x", m.fromX + (m.toX - m.fromX) * u);
        }, easeInOut, tk);
        for (const m of moves) m.bar.pos = m.to;
        if (tk.cancelled) return;

        const boxA = runBoxes.get(ev.A.label), boxB = runBoxes.get(ev.B.label);
        const fused = addRunBox(ev.seg, false);
        fused.setAttribute("opacity", 0);
        await tween(D(260), (u) => {
          fused.setAttribute("opacity", u);
          if (boxA) boxA.setAttribute("opacity", 1 - u);
          if (boxB) boxB.setAttribute("opacity", 1 - u);
        }, easeOutCubic, tk);
        if (boxA) { boxA.remove(); runBoxes.delete(ev.A.label); }
        if (boxB) { boxB.remove(); runBoxes.delete(ev.B.label); }

        // 4 · stack: replace the two hot entries with the fused one
        if (dA && dB) {
          dA.remove(); dB.remove();
          const fusedEntry = stackAdd(ev.seg.label, ev.seg.power);
          fusedEntry.classList.add("hot");
          setTimeout(() => fusedEntry.classList.remove("hot"), D(420));
        }
        await sleep(D(220), tk);
        break;
      }
      case "done": {
        setLine(null);
        say(`sorted ✔ — ${ev.runs} runs, ${ev.merges} merges, merge cost ${ev.mergeCost}`);
        const rects = bars.map((b) => b.rect);
        // sweep the "sorted" green across the array, then fade back
        await tween(D(700), (u) => {
          const upto = Math.floor(u * rects.length);
          for (let k = 0; k < upto; k++) {
            const r = bars.find((b) => b.pos === k);
            if (r) r.rect.style.fill = C.green;
          }
        }, easeInOut, tk);
        for (const r of rects) r.style.fill = C.green;
        setTimeout(() => { if (!tk.cancelled) rects.forEach((r) => { r.style.fill = ""; }); }, Math.max(400, D(1800)));
        break;
      }
    }
  }

  /* ----- player ----- */
  function atEnd() { return !sim || evIndex >= sim.events.length; }

  function updateButtons() {
    playBtn.textContent = playing ? "❚❚ pause" : (atEnd() ? "▶ play again" : "▶ play");
    stepBtn.disabled = playing;
    backBtn.disabled = playing || evIndex === 0;
  }

  /* rebuild the scene to the state right after the first k events (instantly) */
  async function rebuildTo(k) {
    token.cancelled = true;
    token = { cancelled: false, instant: true };
    const tk = token;
    playing = false; busy = true;
    buildScene();
    for (let x = 0; x < k && !tk.cancelled; x++) await doEvent(sim.events[x], tk);
    if (tk.cancelled) { busy = false; return; }
    evIndex = k;
    token = { cancelled: false };
    busy = false;
    if (k === 0) say("Press play to run Powersort.");
    updateButtons();
  }

  async function stepBack() {
    if (busy || playing || !sim || evIndex === 0) return;
    await rebuildTo(evIndex - 1);
  }

  async function playLoop() {
    if (playing) { playing = false; updateButtons(); return; }
    if (atEnd()) reset(false);
    playing = true; updateButtons();
    while (playing && !atEnd()) {
      if (busy) { await new Promise((r) => setTimeout(r, 30)); continue; }
      busy = true;
      const tk = token;
      await doEvent(sim.events[evIndex++], tk);
      busy = false;
      if (tk.cancelled) break;
      await sleep(D(130), token);
    }
    playing = false; updateButtons();
  }

  async function stepOnce() {
    if (busy || playing) return;
    if (atEnd()) { reset(false); }
    busy = true;
    await doEvent(sim.events[evIndex++], token);
    busy = false;
    updateButtons();
  }

  function reset(sayIt = true) {
    token.cancelled = true;
    token = { cancelled: false };
    playing = false; busy = false; evIndex = 0;
    buildScene();
    updateButtons();
    if (sayIt) say("Press play to run Powersort.");
  }

  /* ----- input handling ----- */
  function parseNums(text) {
    return text.split(/[,;\s]+/).filter(Boolean).map(Number).filter((x) => Number.isFinite(x));
  }

  function loadFromInput() {
    const nums = parseNums(dataInput.value);
    let vals;
    if (modeSelect.value === "runs") {
      const lens = nums.map((x) => Math.max(1, Math.round(x))).slice(0, 24);
      if (!lens.length) { say("⚠ enter at least one run length"); return; }
      let total = lens.reduce((a, b) => a + b, 0);
      while (total > 220 && lens.length > 1) { total -= lens.pop(); }
      vals = arrayFromRunLengths(lens);
    } else {
      vals = nums.slice(0, 220);
      if (vals.length < 2) { say("⚠ enter at least two values"); return; }
    }
    values = vals;
    sim = simulatePowersort(values);
    reset(false);
    say(`loaded n = ${values.length} → ${sim.runCount} runs. Press play.`);
  }

  const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

  function applyPreset(name) {
    switch (name) {
      case "slides": modeSelect.value = "runs"; dataInput.value = "5, 3, 3, 14, 1, 2"; break;
      case "hero": modeSelect.value = "runs"; dataInput.value = "7, 3, 1, 1, 6, 16, 6, 1, 3, 6"; break;
      case "colab": modeSelect.value = "runs"; dataInput.value = "9, 16, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7"; break;
      case "fewruns": modeSelect.value = "runs"; dataInput.value = "12, 20, 8, 24"; break;
      case "manyruns": {
        modeSelect.value = "runs";
        dataInput.value = Array.from({ length: 16 }, () => randInt(1, 6)).join(", ");
        break;
      }
      case "random": {
        modeSelect.value = "values";
        const a = Array.from({ length: 48 }, (_, i) => i + 1);
        for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; }
        dataInput.value = a.join(", ");
        break;
      }
      case "organ": {
        modeSelect.value = "values";
        const up = Array.from({ length: 24 }, (_, i) => i + 1);
        const down = Array.from({ length: 23 }, (_, i) => 23 - i);
        dataInput.value = up.concat(down).join(", ");
        break;
      }
      case "sorted": {
        modeSelect.value = "values";
        dataInput.value = Array.from({ length: 40 }, (_, i) => i + 1).join(", ");
        break;
      }
    }
    syncModeLabel();
    loadFromInput();
  }

  function syncModeLabel() {
    inputLabel.textContent = modeSelect.value === "runs"
      ? "run lengths (comma-separated)"
      : "array values (comma-separated)";
  }

  /* ----- wiring ----- */
  applyBtn.addEventListener("click", loadFromInput);
  dataInput.addEventListener("keydown", (e) => { if (e.key === "Enter") loadFromInput(); });
  presetSelect.addEventListener("change", () => applyPreset(presetSelect.value));
  modeSelect.addEventListener("change", syncModeLabel);
  playBtn.addEventListener("click", playLoop);
  backBtn.addEventListener("click", stepBack);
  stepBtn.addEventListener("click", stepOnce);
  resetBtn.addEventListener("click", () => reset());
  speedRange.addEventListener("input", () => { speed = +speedRange.value; });

  // initial load: the talk example
  applyPreset("slides");
  presetSelect.value = "slides";

  return {};
})();
