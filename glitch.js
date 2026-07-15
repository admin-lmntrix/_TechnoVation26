/* ============================================================
   TECHNOVATION '26 · glitch.js — screen + text glitch fx
   Aggressive digital "interference": bright RGB channel-split +
   slice tearing on headings/brand text, plus full-screen scanline
   bars, cyan/magenta displacement slices, and brief whole-screen
   RGB-split flashes. Fires on an ambient timer and harder on fast
   scroll. Fully disabled for prefers-reduced-motion.
   ============================================================ */
(function () {
  "use strict";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!document.body || typeof document.body.animate !== "function") return;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var veil = document.createElement("div");
  veil.id = "glitch-veil";
  veil.setAttribute("aria-hidden", "true");
  document.body.appendChild(veil);

  /* text elements that can glitch */
  var SELECT = "h1,h2,h3,.eyebrow,.crumb,.bigname,.titanic,.symp-title,.sub,.brand";

  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 4 && r.height > 4;
  }
  function pool() { return Array.prototype.filter.call(document.querySelectorAll(SELECT), inView); }

  function glitchEl(el, dur) {
    el.style.setProperty("--gdur", dur + "ms");
    el.classList.remove("glitch-rgb");
    void el.offsetWidth;
    el.classList.add("glitch-rgb");
    setTimeout(function () {
      el.classList.remove("glitch-rgb");
      el.style.removeProperty("--gdur");
    }, dur + 40);
  }

  /* a sliced interference band that snaps across the screen */
  function bar(intensity) {
    var b = document.createElement("div");
    b.className = "gbar";
    var h = rand(6, 54);
    b.style.top = rand(0, window.innerHeight - h) + "px";
    b.style.height = h + "px";
    var kind = Math.random();
    if (kind < 0.36) b.style.background = "repeating-linear-gradient(0deg,rgba(235,245,255,.20) 0 1px,transparent 1px 3px)";
    else if (kind < 0.66) b.style.background = "rgba(0,240,255," + (0.12 + 0.24 * intensity) + ")";
    else b.style.background = "rgba(255,45,120," + (0.12 + 0.22 * intensity) + ")";
    if (Math.random() < 0.14) b.style.background = "rgba(245,250,255," + (0.12 + 0.2 * intensity) + ")"; // hard white block
    veil.appendChild(b);

    var dx = (Math.random() - 0.5) * 90 * intensity;
    b.animate(
      [
        { opacity: 0, transform: "translateX(0)" },
        { opacity: 1, transform: "translateX(" + dx + "px)", offset: 0.16 },
        { opacity: 0.9, transform: "translateX(" + (-dx * 0.7) + "px)", offset: 0.55 },
        { opacity: 0, transform: "translateX(0)" }
      ],
      { duration: rand(70, 240), easing: "steps(3,end)" }
    ).onfinish = function () { b.remove(); };
  }

  /* whole-screen RGB-split flash — cyan shoves one way, magenta the other */
  function fullFlash(intensity) {
    [["rgba(0,240,255,", 1], ["rgba(255,45,120,", -1]].forEach(function (pair) {
      var f = document.createElement("div");
      f.className = "gflash";
      f.style.background = pair[0] + (0.06 + 0.11 * intensity) + ")";
      veil.appendChild(f);
      var dx = pair[1] * rand(6, 18) * intensity;
      f.animate(
        [
          { opacity: 0, transform: "translateX(0)" },
          { opacity: 1, transform: "translateX(" + dx + "px)", offset: 0.3 },
          { opacity: 0, transform: "translateX(" + dx + "px)" }
        ],
        { duration: rand(70, 150), easing: "steps(2,end)" }
      ).onfinish = function () { f.remove(); };
    });
  }

  /* a glitch burst */
  function burst(intensity) {
    var p = pool();
    var nEl = 1 + (Math.random() * Math.min(4, p.length)) | 0;
    for (var i = 0; i < nEl && p.length; i++) {
      var el = p.splice((Math.random() * p.length) | 0, 1)[0];
      glitchEl(el, rand(160, 420));
    }
    var nb = 3 + (intensity * 6) | 0;
    for (var k = 0; k < nb; k++) bar(intensity);
    if (intensity > 0.6 && Math.random() < 0.6) fullFlash(intensity);
  }

  /* ambient loop — more frequent now */
  (function loop() {
    if (!document.hidden) burst(0.6 + Math.random() * 0.35);
    setTimeout(loop, rand(1800, 5000));
  })();

  /* fast scroll → punchier glitch */
  var lastY = window.scrollY || 0, cool = 0;
  window.addEventListener("scroll", function () {
    var y = window.scrollY || 0, d = Math.abs(y - lastY); lastY = y;
    var now = performance.now();
    if (d > 45 && now > cool) { cool = now + 200; burst(clamp(d / 130, 0.6, 1)); }
  }, { passive: true });
})();
