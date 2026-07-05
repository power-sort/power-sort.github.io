/* ============================================================
   POWERSORT splash
   The three typing cursors fly onto the three lime bars of the
   logo ("sort⇡" staircase) — positions are measured at runtime
   (FLIP), so the landing is exact at any viewport size.
   ============================================================ */
(() => {
  "use strict";
  const splash = document.getElementById("splash-screen");
  if (!splash) return;
  splash.setAttribute("aria-hidden", "false");

  const logo = document.getElementById("splashLogo");
  const cursors = [...splash.querySelectorAll(".word-cursor")];

  /* The logo's three bars as fractions of its 700×700 viewBox
     (from powersort-logo-square-nobg.svg, paths 16/14/12,
     group offset −603.26978/−187.98157):
       x = (1094.6836 − 603.26978) / 700          = 0.702020
       y_top    = (576.24219 − 187.98157) / 700   = 0.554658
       y_mid    = (617.74219 − 187.98157) / 700   = 0.613944
       y_bottom = (659.24219 − 187.98157) / 700   = 0.673229
       w_top / w_mid / w_bottom = 20.3047 / 56.9609 / 93.6172 (÷700)
       h = 17.0664 / 700                          = 0.024381 */
  const BARS = [
    { fx: 0.702020, fy: 0.554658, fw: 0.029007, fh: 0.024381 }, // "adaptive" → top bar
    { fx: 0.702020, fy: 0.613944, fw: 0.081373, fh: 0.024381 }, // "stable"   → middle bar
    { fx: 0.702020, fy: 0.673229, fw: 0.133739, fh: 0.024381 }, // "sorting"  → bottom bar
  ];

  let goneAt = 0;
  const measureAndGo = () => {
    try {
      /* the logo waits at transform: translate(-50%,-50%) scale(.94) before its reveal;
         measuring that rect would pull every target ~6% toward the logo's center.
         Temporarily measure at the final scale(1). */
      const prevTransform = logo.style.transform;
      logo.style.transform = "translate(-50%, -50%)";
      const lr = logo.getBoundingClientRect();
      logo.style.transform = prevTransform;
      if (lr.width > 0) {
        cursors.forEach((c, i) => {
          const b = BARS[i];
          const cr = c.getBoundingClientRect();
          if (!b || cr.width === 0 || cr.height === 0) return;
          c.style.setProperty("--tx", ((lr.left + b.fx * lr.width) - cr.left).toFixed(2) + "px");
          c.style.setProperty("--ty", ((lr.top + b.fy * lr.height) - cr.top).toFixed(2) + "px");
          c.style.setProperty("--sx", (b.fw * lr.width / cr.width).toFixed(4));
          c.style.setProperty("--sy", (b.fh * lr.height / cr.height).toFixed(4));
        });
      }
    } catch (e) { /* measurement is best-effort */ }
    splash.classList.add("splash-go");
    goneAt = performance.now();
  };

  const fontsReady = (document.fonts && document.fonts.ready)
    ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => requestAnimationFrame(measureAndGo))
            .catch(() => measureAndGo());

  /* ---- hide logic (from the original site) ---- */
  const SPLASH_MIN_VISIBLE_MS = 3000;   // sequence: fly ends 2.35s, logo in by 2.75s
  const SPLASH_FALLBACK_TIMEOUT_MS = 4200;
  const SPLASH_POST_LOAD_DELAY_MS = 250;
  const shownAt = performance.now();

  const hideSplash = () => {
    if (splash.classList.contains("is-hidden")) return;
    splash.classList.add("is-hidden");
    splash.setAttribute("aria-hidden", "true");
    splash.removeEventListener("click", hideSplash);
    window.removeEventListener("keydown", onKeyDown);
  };
  const onKeyDown = (event) => {
    if (splash.classList.contains("is-hidden")) return;
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      hideSplash();
    }
  };
  const fallbackTimer = setTimeout(hideSplash, SPLASH_FALLBACK_TIMEOUT_MS);
  splash.addEventListener("click", hideSplash, { once: true });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("load", () => {
    clearTimeout(fallbackTimer);
    const base = goneAt || shownAt;
    const elapsedMs = performance.now() - base;
    const remainingVisibleMs = Math.max(0, SPLASH_MIN_VISIBLE_MS - elapsedMs);
    setTimeout(hideSplash, remainingVisibleMs + SPLASH_POST_LOAD_DELAY_MS);
  }, { once: true });
})();
