/* ============================================================
   TECHNOVATION '26 · fx.js — scroll-driven 3D star-tunnel
   The background is a perspective field of circuit-white motes.
   SCROLLING DRIVES IT: scroll down and you fly FORWARD through the
   tunnel (motes stream outward past you); scroll up and you reverse.
   Scroll speed stretches everything into a hyperspace warp + fires a
   chromatic glitch. Stop scrolling and it eases back to near-still —
   so the motion is caused by the scroll, not an ambient loop.

   Pure Canvas 2D, no library. Fixed behind content (#fx-bg, z-index 0).
   Honours prefers-reduced-motion; pauses when the tab is hidden.
   ============================================================ */
(function () {
  "use strict";

  var canvas = document.getElementById("fx-bg");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var WHITE = [228, 235, 245], STEEL = [150, 170, 196], CYAN = [150, 205, 232];
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- projection constants ---------- */
  var NEAR = 0.16, FAR = 3.4, FOCAL = 0.82, SPREAD = 1.32;
  var Z_PER_PX = 0.0016;      // how much a pixel of scroll flies you forward
  var AMBIENT = 0.045;        // tiny idle creep so it's never fully dead

  /* ---------- sizing ---------- */
  var W = 0, H = 0, dpr = 1, cx = 0, cy = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2; cy = H / 2;
    seed();
  }

  /* ---------- the field ---------- */
  var S = [];
  function makeStar(z) {
    return { x: rand(-SPREAD, SPREAD), y: rand(-SPREAD, SPREAD), z: z, px: null, py: null,
             node: Math.random() < 0.12 };
  }
  function seed() {
    S.length = 0;
    var n = clamp(Math.round(W * H / 13000), 60, 170);
    for (var i = 0; i < n; i++) S.push(makeStar(rand(NEAR, FAR)));
  }

  /* ---------- pointer parallax (shifts the vanishing point) ---------- */
  var mx = 0, my = 0, tmx = 0, tmy = 0;
  window.addEventListener("pointermove", function (e) {
    tmx = (e.clientX / window.innerWidth - 0.5);
    tmy = (e.clientY / window.innerHeight - 0.5);
  }, { passive: true });

  /* ---------- scroll tracking ---------- */
  var lastScroll = window.scrollY || window.pageYOffset || 0;
  var travel = 0;     // smoothed forward speed (z units / frame)
  var warp = 0;       // 0..1 visual warp intensity
  var roll = 0;       // subtle camera roll from scroll velocity
  var glitch = 0;

  /* ---------- update ---------- */
  function update(dt) {
    var sy = window.scrollY || window.pageYOffset || 0;
    var raw = sy - lastScroll; lastScroll = sy;

    // scroll → forward travel through the tunnel (clamped so jumps don't teleport)
    var want = reduce ? 0 : clamp(raw * Z_PER_PX, -0.55, 0.55);
    travel += (want - travel) * 0.18;
    var ambient = reduce ? 0 : AMBIENT * dt;
    var step = travel + ambient;

    warp += (clamp(Math.abs(raw) / 42, 0, 1) - warp) * 0.2;
    roll += ((reduce ? 0 : clamp(raw / 600, -0.05, 0.05)) - roll) * 0.1;

    if (!reduce && Math.abs(raw) > 28) glitch = Math.min(1, glitch + Math.abs(raw) / 150);
    glitch = Math.max(0, glitch - dt * 2.4);

    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;

    for (var i = 0; i < S.length; i++) {
      var s = S[i];
      s.z -= step;
      if (s.z < NEAR) { s.z += (FAR - NEAR); s.x = rand(-SPREAD, SPREAD); s.y = rand(-SPREAD, SPREAD); s.px = null; }
      else if (s.z > FAR) { s.z -= (FAR - NEAR); s.x = rand(-SPREAD, SPREAD); s.y = rand(-SPREAD, SPREAD); s.px = null; }
    }
  }

  /* ---------- glitch pass (raw-pixel space) ---------- */
  function glitchPass(amt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var Wd = canvas.width;
    var bands = 2 + (amt * 4) | 0;
    for (var i = 0; i < bands; i++) {
      var bh = rand(6, 24) * dpr, by = rand(0, H - 24) * dpr, dx = (Math.random() - 0.5) * amt * 70 * dpr;
      ctx.globalAlpha = 0.6;
      ctx.drawImage(canvas, 0, by, Wd, bh, dx, by, Wd, bh);
    }
    ctx.globalCompositeOperation = "lighter";
    var lines = 1 + (amt * 3) | 0;
    for (var k = 0; k < lines; k++) {
      ctx.fillStyle = rgba(CYAN, 0.05 + 0.08 * amt);
      ctx.fillRect(0, rand(0, H) * dpr, Wd, rand(1, 2) * dpr);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- render ---------- */
  function render(time) {
    ctx.clearRect(0, 0, W, H);

    // vanishing point drifts a touch with the pointer
    var vx = cx + mx * 60, vy = cy + my * 50;

    ctx.save();
    if (roll) { ctx.translate(cx, cy); ctx.rotate(roll); ctx.translate(-cx, -cy); }

    for (var i = 0; i < S.length; i++) {
      var s = S[i];
      var scale = FOCAL / s.z;
      var sx = vx + s.x * scale * cx;
      var sy = vy + s.y * scale * cy;

      // depth → size & brightness (near = big & bright)
      var depth = 1 - (s.z - NEAR) / (FAR - NEAR);     // 0 far … 1 near
      var r = clamp(scale * 1.5, 0.35, 4.2);
      var col = s.node ? WHITE : STEEL;
      var a = clamp((0.12 + depth * 0.7) * (1 + warp * 0.9), 0, 1);

      if (s.px != null && (warp > 0.03 || Math.abs(sx - s.px) + Math.abs(sy - s.py) > 1.2)) {
        // hyperspace streak from previous projected position
        ctx.strokeStyle = rgba(col, a);
        ctx.lineWidth = r;
        ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(sx, sy); ctx.stroke();
      } else {
        ctx.fillStyle = rgba(col, a);
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.2832); ctx.fill();
      }

      // brightest near nodes get a tiny circuit cross
      if (s.node && depth > 0.55) {
        ctx.fillStyle = rgba(WHITE, a * 0.5);
        ctx.fillRect(sx - 0.5, sy - r * 2.2, 1, r * 1.2);
        ctx.fillRect(sx - r * 2.2, sy - 0.5, r * 1.2, 1);
      }

      s.px = sx; s.py = sy;
    }
    ctx.restore();

    // tunnel vignette — darkens edges toward the vanishing point
    var vg = ctx.createRadialGradient(vx, vy, Math.min(W, H) * 0.05, vx, vy, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    if (glitch > 0.01 && !reduce) glitchPass(glitch);
  }

  /* ---------- loop ---------- */
  var last = performance.now(), running = true;
  function frame(now) {
    if (!running) return;
    var dt = Math.min((now - last) / 1000, 0.05); last = now;
    update(dt); render(now);
    requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running) { last = performance.now(); lastScroll = window.scrollY || window.pageYOffset || 0; requestAnimationFrame(frame); }
  });
  window.addEventListener("resize", resize);

  resize();
  requestAnimationFrame(frame);
})();
