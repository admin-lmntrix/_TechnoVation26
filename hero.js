/* ============================================================
   TECHNOVATION '26 · Hero mini-game — "TRANSMUTE"
   Greeks → Geeks: click / sweep the drifting Greek glyphs to
   detonate them into gold voxels and flip them into binary.
   Build combos; catch the rare golden laurel for a bonus.

   Pure Canvas 2D — no external library, works offline.
   Sits behind the headline (canvas z-index is below the text),
   so nothing it draws can ever cover the title.
   Degrades gracefully: honours prefers-reduced-motion, pauses
   when the tab is hidden, and stays calm with no pointer.
   ============================================================ */
(function () {
  "use strict";

  var canvas = document.getElementById("bg-canvas");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- palette (mirrors the design tokens) ---------- */
  var NAVY_HI = "#0e1c29", NAVY_LO = "#080d15";
  var MARBLE  = [224, 230, 238];
  var GOLD    = [196, 212, 230];
  var GOLD_HI = [240, 247, 252];
  var SILVER  = [170, 186, 205];
  var CYAN    = [150, 205, 232];

  /* ---------- glyphs + helpers ---------- */
  var GLYPHS = ["Α","Δ","Σ","Ω","Φ","Ψ","Π","Λ","Θ","Ξ","Γ","Σ","Η","π","φ","λ","ψ","θ","δ","σ","μ","ε"];
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function bitsOf(ch) {
    var n = ch.charCodeAt(0) & 0xFF, s = n.toString(2);
    while (s.length < 8) s = "0" + s;
    return s;
  }

  /* ---------- sizing (DPR-aware, CSS-pixel drawing space) ---------- */
  var W = 0, H = 0, dpr = 1, rect = null;
  function host() { return canvas.parentElement || canvas; }
  function resize() {
    var el = host();
    W = el.clientWidth || window.innerWidth;
    H = el.clientHeight || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rect = canvas.getBoundingClientRect();
    seedStars();
    fitMotes();
  }

  /* ---------- state ---------- */
  var motes = [], parts = [], rings = [], stars = [], trail = [], chains = [];
  var pointer = { x: -999, y: -999, px: -999, py: -999, down: false, inside: false, type: "mouse", suppress: false };
  var score = 0, combo = 1, comboUntil = 0, shimmer = 0, hinted = false, best = 0, level = 1;
  var COMBO_WINDOW = 1600, COMBO_MAX = 9, HIT_PAD = 26, MAGNET = 78;

  // hold-to-charge field-clearing blast
  var holdT = 0, charging = false, holdX = 0, holdY = 0, blast = null;
  var CHARGE = 5, HOLD_CANCEL = 24;

  var elScore = document.getElementById("g-score");
  var elCombo = document.getElementById("g-combo");
  var elBest  = document.getElementById("g-best");
  var elHint  = document.getElementById("g-hint");
  try { best = parseInt(localStorage.getItem("tvn_hi") || "0", 10) || 0; } catch (e) {}
  if (elBest) elBest.textContent = String(best);
  function saveBest() { try { localStorage.setItem("tvn_hi", String(best)); } catch (e) {} }

  /* ---------- immersion ("focus") mode ----------
     Real engagement (sweeping / transmuting while at the top of the page)
     slowly fades the nav + headline + buttons until only the game remains.
     Any scroll brings the whole page straight back. Disabled for
     prefers-reduced-motion so the chrome never vanishes unexpectedly. */
  var navEl     = document.querySelector(".nav");
  var heroInner = document.querySelector(".hero-inner");
  var hintEl    = document.querySelector(".hero .hint");
  var heroSection = (canvas.closest && canvas.closest(".hero")) || host();

  var immHint = document.createElement("div");
  immHint.textContent = "↓  scroll to bring the page back";
  immHint.setAttribute("aria-hidden", "true");
  immHint.style.cssText =
    "position:absolute;left:50%;bottom:26px;transform:translateX(-50%);" +
    "font-family:'Chakra Petch',monospace;font-size:.64rem;letter-spacing:.3em;" +
    "text-transform:uppercase;color:rgba(206,221,236,.72);pointer-events:none;" +
    "opacity:0;transition:opacity .45s ease;white-space:nowrap;z-index:4;";
  if (heroSection && heroSection.appendChild) heroSection.appendChild(immHint);

  var immersion = 0, immTarget = 0, engaged = false, engageDist = 0, lastScroll = -1e9;
  var exX = null, exY = null;
  var IN_RATE = 0.85, OUT_RATE = 5.5, ENGAGE_DIST = 230;

  /* ---------- far parallax stars ---------- */
  function seedStars() {
    stars.length = 0;
    var n = clamp(Math.round(W * H / 14000), 30, 90);
    for (var i = 0; i < n; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, z: rand(0.25, 1), r: rand(0.4, 1.3), tw: Math.random() * 6.28 });
    }
  }

  /* ---------- glyph motes ---------- */
  function targetMoteCount() { return clamp(Math.round(W * H / 42000), 12, 26); }
  function newMote(special) {
    var laurel = special === "laurel", surge = special === "surge";
    var spd = 1 + level * 0.12;            // gentle difficulty ramp with score
    var m = {
      x: rand(W * 0.06, W * 0.94),
      y: rand(H * 0.10, H * 0.92),
      vx: reduce ? 0 : rand(-9, 9) * spd,
      vy: reduce ? 0 : rand(-9, 9) * spd,
      r: (laurel || surge) ? 19 : rand(13, 20),
      ch: laurel ? "❦" : surge ? "Ω" : pick(GLYPHS),
      spin: Math.random() * 6.28,
      sp: rand(-0.5, 0.5),
      phase: Math.random() * 6.28,
      glow: 0,
      laurel: laurel,
      surge: surge,
      life: (laurel || surge) ? rand(7, 10) : 0   // specials expire if untouched
    };
    return m;
  }
  function fitMotes() {
    var want = targetMoteCount();
    while (motes.length < want) motes.push(newMote(null));
    while (motes.length > want) motes.pop();
  }
  var laurelTimer = rand(8, 14);

  /* ---------- transmute! ---------- */
  function transmute(m, chained, noRespawn) {
    var laurel = m.laurel, surge = m.surge, big = laurel || surge;
    engaged = true;                 // a transmute counts as real engagement
    var mxp = m.x, myp = m.y, mr = m.r, mch = m.ch;

    var gain = laurel ? combo * 5 : surge ? combo * 4 : combo;

    // combo logic
    var now = performance.now();
    var rose = now < comboUntil;
    combo = rose ? Math.min(combo + 1, COMBO_MAX) : 1;
    comboUntil = now + COMBO_WINDOW;

    score += gain;
    if (score > best) { best = score; if (elBest) elBest.textContent = String(best); saveBest(); }

    if (elScore) elScore.textContent = String(score);
    if (elCombo) elCombo.textContent = "x" + combo;
    if (!hinted) { hinted = true; if (elHint) { elHint.style.transition = "opacity .6s"; elHint.style.opacity = "0"; } }

    // combo flourish — floating "xN" callout once the streak builds
    if (rose && combo >= 3 && !chained) {
      parts.push({ kind: "combo", x: mxp, y: myp - mr - 6, vy: -34, text: "x" + combo, life: 0.9, age: 0 });
      rings.push({ x: mxp, y: myp, r: mr, max: 50, a: 0.5, big: false });
    }

    // shockwave ring(s)
    rings.push({ x: mxp, y: myp, r: mr, max: big ? 150 : 64, a: 0.9, big: big });
    if (big) { rings.push({ x: mxp, y: myp, r: 4, max: 240, a: 0.6, big: true }); shimmer = 1; }

    // voxel burst
    var count = big ? 26 : 15;
    var maxP = reduce ? 220 : 460;
    for (var i = 0; i < count && parts.length < maxP; i++) {
      var ang = rand(0, 6.28), spd = rand(40, big ? 240 : 170);
      var col = Math.random() < (big ? 0.85 : 0.6) ? (Math.random() < 0.5 ? GOLD : GOLD_HI) : (Math.random() < 0.5 ? MARBLE : SILVER);
      parts.push({
        kind: "vox",
        x: mxp, y: myp,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 20,
        s: rand(2, big ? 7 : 5), rot: rand(0, 6.28), vr: rand(-6, 6),
        life: rand(0.5, 1.1), age: 0, col: col
      });
    }
    // rising label (the "geek" half)
    parts.push({
      kind: "label", x: mxp, y: myp - mr, vy: -26,
      text: laurel ? "+BONUS" : surge ? "SURGE" : bitsOf(mch), life: big ? 1.5 : 1.15, age: 0,
      gold: big
    });

    // recycle the hit mote, keep the field full (skipped during a blast clear)
    var idx = motes.indexOf(m);
    if (idx > -1) motes.splice(idx, 1);
    if (!noRespawn) motes.push(newMote(null));

    // Ω surge → chain-lightning to the nearest few glyphs, transmuting them too
    if (surge && !chained) {
      var pool = motes.filter(function (n) { return !n.laurel && !n.surge; })
        .sort(function (a, b) { return Math.hypot(a.x - mxp, a.y - myp) - Math.hypot(b.x - mxp, b.y - myp); })
        .slice(0, 4);
      for (var c = 0; c < pool.length; c++) {
        chains.push({ x1: mxp, y1: myp, x2: pool[c].x, y2: pool[c].y, age: 0, life: 0.32 });
        transmute(pool[c], true);
      }
    }
  }

  function fireBlast(x, y) {
    var max = Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) + 40;
    blast = { x: x, y: y, r: 0, max: max, speed: max / 0.55 };
    shimmer = 1;
  }

  function hitTest(x, y) {
    // nearest mote within its hit radius
    var best = null, bestD = 1e9;
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i], d = Math.hypot(m.x - x, m.y - y), R = m.r + HIT_PAD + (m.laurel ? 10 : 0);
      if (d < R && d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  /* ---------- input ---------- */
  function toLocal(e) {
    if (!rect) rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  window.addEventListener("pointermove", function (e) {
    rect = canvas.getBoundingClientRect();
    var p = toLocal(e);
    pointer.x = p.x; pointer.y = p.y; pointer.type = e.pointerType || "mouse";
    pointer.inside = p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H;
    // engagement: meaningful movement inside the hero arms focus mode
    if (pointer.inside) {
      if (exX != null) engageDist += Math.hypot(p.x - exX, p.y - exY);
      exX = p.x; exY = p.y;
      if (engageDist > ENGAGE_DIST) engaged = true;
    } else { exX = null; exY = null; }
    // moving cancels a charge — holding still is the gesture
    if (charging && Math.hypot(p.x - holdX, p.y - holdY) > HOLD_CANCEL) charging = false;
    // mouse sweep: transmute glyphs you drag through
    if (pointer.down && !pointer.suppress && pointer.type === "mouse" && pointer.inside) {
      var m = hitTest(p.x, p.y); if (m) transmute(m);
    }
  }, { passive: true });

  window.addEventListener("pointerdown", function (e) {
    // don't let the CTAs / headline links trigger the game
    pointer.suppress = !!(e.target && e.target.closest && e.target.closest("a,button"));
    pointer.down = true;
    var p = toLocal(e);
    pointer.x = p.x; pointer.y = p.y; pointer.type = e.pointerType || "mouse";
    pointer.inside = p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H;
    if (!pointer.suppress && pointer.inside) {
      var m = hitTest(p.x, p.y); if (m) transmute(m);
      // begin charging a field-clearing blast (hold still ~5s, then release)
      if (pointer.type === "mouse" && !blast) { charging = true; holdT = 0; holdX = p.x; holdY = p.y; }
    }
  }, { passive: true });

  window.addEventListener("pointerup", function () {
    pointer.down = false; pointer.suppress = false;
    if (charging) { if (holdT >= CHARGE) fireBlast(pointer.x, pointer.y); charging = false; holdT = 0; }
  });
  window.addEventListener("pointerleave", function () { pointer.inside = false; pointer.x = -999; pointer.y = -999; charging = false; });
  window.addEventListener("scroll", function () {
    rect = canvas.getBoundingClientRect();
    lastScroll = performance.now();
    if ((window.scrollY || window.pageYOffset || 0) > 24) { engaged = false; engageDist = 0; }
  }, { passive: true });

  /* ---------- focus-mode fade ---------- */
  function applyImmersion(c) {
    if (navEl) {
      if (c < 0.005) { navEl.style.opacity = ""; navEl.style.transform = ""; navEl.style.pointerEvents = ""; }
      else {
        navEl.style.opacity = String(1 - c);
        navEl.style.transform = "translateY(" + (-c * 16) + "px)";
        navEl.style.pointerEvents = c > 0.55 ? "none" : "";
      }
    }
    if (heroInner) {
      if (c < 0.005) { heroInner.style.opacity = ""; heroInner.style.transform = ""; heroInner.style.pointerEvents = ""; }
      else {
        heroInner.style.opacity = String(1 - c);
        heroInner.style.transform = "translateY(" + (-c * 8) + "px) scale(" + (1 - c * 0.02) + ")";
        heroInner.style.pointerEvents = c > 0.35 ? "none" : "";
      }
    }
    if (hintEl) {
      if (c < 0.005) hintEl.style.opacity = "";
      else hintEl.style.opacity = String(Math.max(0, 1 - c * 1.4));
    }
    immHint.style.opacity = c > 0.45 ? String(Math.min(1, (c - 0.45) * 2) * 0.7) : "0";
  }

  /* ---------- update ---------- */
  function update(dt) {
    var now = performance.now();
    if (now > comboUntil && combo !== 1) { combo = 1; if (elCombo) elCombo.textContent = "x1"; }
    shimmer = Math.max(0, shimmer - dt * 1.4);

    // hold-to-charge timer + field-clearing blast wave
    if (charging && pointer.down) holdT += dt;
    if (blast) {
      blast.r += blast.speed * dt;
      for (var bi = motes.length - 1; bi >= 0; bi--) {
        var bm = motes[bi];
        if (Math.hypot(bm.x - blast.x, bm.y - blast.y) <= blast.r) transmute(bm, true, true);
      }
      if (blast.r >= blast.max) { blast = null; fitMotes(); }
    }

    // focus mode: engaged + at the top + not mid-scroll → fade chrome away
    if (!reduce) {
      var sy = window.scrollY || window.pageYOffset || 0;
      var atTop = sy < 28;
      immTarget = (engaged && atTop && (now - lastScroll > 600)) ? 1 : 0;
      var rate = immTarget > immersion ? IN_RATE : OUT_RATE;
      immersion += (immTarget - immersion) * Math.min(1, dt * rate);
      if (immersion < 0.0005) immersion = 0;
      applyImmersion(immersion);
    }

    // pointer trail (comet)
    if (pointer.inside && !reduce) {
      if (pointer.px > -900) {
        var moved = Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py);
        if (moved > 1.2) trail.push({ x: pointer.x, y: pointer.y, age: 0 });
      }
    }
    pointer.px = pointer.x; pointer.py = pointer.y;
    for (var t = trail.length - 1; t >= 0; t--) { trail[t].age += dt; if (trail[t].age > 0.5) trail.splice(t, 1); }
    if (trail.length > 26) trail.splice(0, trail.length - 26);

    // motes
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.spin += m.sp * dt;
      m.phase += dt * 2;

      if (!reduce) {
        m.x += m.vx * dt; m.y += m.vy * dt;
        // gentle wrap with margin
        if (m.x < -30) m.x = W + 30; else if (m.x > W + 30) m.x = -30;
        if (m.y < -30) m.y = H + 30; else if (m.y > H + 30) m.y = -30;
      }

      // magnet + glow near cursor (signals catchability)
      var glowT = 0;
      if (pointer.inside) {
        var dx = pointer.x - m.x, dy = pointer.y - m.y, d = Math.hypot(dx, dy);
        if (d < MAGNET) {
          glowT = 1 - d / MAGNET;
          if (!reduce) { var f = glowT * 26 * dt; m.x += (dx / (d || 1)) * f; m.y += (dy / (d || 1)) * f; }
        }
      }
      m.glow += (glowT - m.glow) * Math.min(1, dt * 10);

      // while charging a blast, the field is drawn in toward the cursor
      if (charging && !reduce && pointer.inside) {
        var dcx = pointer.x - m.x, dcy = pointer.y - m.y, dc = Math.hypot(dcx, dcy);
        if (dc < 170) { var pull = (1 - dc / 170) * (0.3 + (holdT / CHARGE) * 1.3) * 70 * dt; m.x += dcx / (dc || 1) * pull; m.y += dcy / (dc || 1) * pull; }
      }

      if (m.laurel || m.surge) { m.life -= dt; if (m.life <= 0) { motes.splice(i, 1); i--; motes.push(newMote(null)); } }
    }

    // occasionally promote a mote to a special — laurel (bonus) or Ω surge (chain)
    if (!reduce) {
      laurelTimer -= dt;
      var hasSpecial = false;
      for (var k = 0; k < motes.length; k++) if (motes[k].laurel || motes[k].surge) { hasSpecial = true; break; }
      if (laurelTimer <= 0 && !hasSpecial && motes.length) {
        var j = (Math.random() * motes.length) | 0;
        var ref = motes[j];
        motes[j] = newMote(Math.random() < 0.5 ? "surge" : "laurel");
        motes[j].x = ref.x; motes[j].y = ref.y;
        laurelTimer = rand(9, 16);
      }
    }

    // particles
    for (var p = parts.length - 1; p >= 0; p--) {
      var q = parts[p]; q.age += dt;
      if (q.age >= q.life) { parts.splice(p, 1); continue; }
      if (q.kind === "vox") {
        q.vy += 150 * dt;            // gravity
        q.vx *= (1 - 1.2 * dt);      // drag
        q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      } else { q.y += q.vy * dt; q.vy *= (1 - 0.6 * dt); }
    }

    // rings
    for (var r = rings.length - 1; r >= 0; r--) {
      var R = rings[r];
      R.r += (R.max - R.r) * Math.min(1, dt * 4.2);
      R.a -= dt * (R.big ? 1.1 : 1.7);
      if (R.a <= 0 || R.r > R.max - 1) rings.splice(r, 1);
    }

    // chain-lightning flickers + difficulty ramp
    for (var ch = chains.length - 1; ch >= 0; ch--) { chains[ch].age += dt; if (chains[ch].age >= chains[ch].life) chains.splice(ch, 1); }
    level = 1 + Math.min(6, Math.floor(score / 45));
  }

  /* ---------- render ---------- */
  function render(time) {
    // backdrop
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, NAVY_HI); g.addColorStop(1, NAVY_LO);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // far stars (parallax to cursor)
    var ox = pointer.inside ? (pointer.x - W / 2) : 0;
    var oy = pointer.inside ? (pointer.y - H / 2) : 0;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.55 + 0.45 * Math.sin(time * 0.002 + s.tw);
      ctx.globalAlpha = 0.25 * s.z + 0.35 * tw * s.z;
      ctx.fillStyle = rgba(s.z > 0.7 ? GOLD : MARBLE, 1);
      var sx = s.x - ox * 0.02 * s.z, sy = s.y - oy * 0.02 * s.z;
      ctx.fillRect(sx, sy, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // shockwave rings
    ctx.lineWidth = 1.4;
    for (var r = 0; r < rings.length; r++) {
      var R = rings[r];
      ctx.strokeStyle = rgba(R.big ? GOLD_HI : GOLD, clamp(R.a, 0, 1));
      ctx.beginPath(); ctx.arc(R.x, R.y, R.r, 0, 6.2832); ctx.stroke();
    }

    // voxels + labels
    for (var p = 0; p < parts.length; p++) {
      var q = parts[p], k = 1 - q.age / q.life;
      if (q.kind === "vox") {
        ctx.save();
        ctx.globalAlpha = clamp(k, 0, 1);
        ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        ctx.fillStyle = rgba(q.col, 1);
        ctx.fillRect(-q.s / 2, -q.s / 2, q.s, q.s);
        ctx.restore();
      } else if (q.kind === "combo") {
        ctx.globalAlpha = clamp(k, 0, 1);
        ctx.fillStyle = rgba(GOLD_HI, 1);
        ctx.font = "700 " + (18 + (1 - k) * 9) + "px 'Chakra Petch', monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(q.text, q.x, q.y);
      } else {
        ctx.globalAlpha = clamp(k, 0, 1) * 0.95;
        ctx.fillStyle = rgba(q.gold ? GOLD_HI : GOLD, 1);
        ctx.font = "600 " + (q.gold ? 17 : 13) + "px 'Chakra Petch', monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(q.text, q.x, q.y);
      }
    }
    ctx.globalAlpha = 1;

    // glyph motes
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var m2 = 0; m2 < motes.length; m2++) {
      var m = motes[m2];
      var pulse = 0.5 + 0.5 * Math.sin(m.phase);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(Math.sin(m.spin) * 0.18);

      if (m.laurel) {
        var lp = 0.6 + 0.4 * pulse;
        ctx.shadowColor = rgba(GOLD_HI, 0.9); ctx.shadowBlur = 26 * lp;
        ctx.fillStyle = rgba(GOLD_HI, 0.95);
        ctx.font = "700 " + (m.r * 2.2) + "px 'Cinzel', serif";
        ctx.fillText("❦", 0, 2);
        // orbiting spark
        ctx.shadowBlur = 0;
        var oa = m.spin * 2;
        ctx.fillStyle = rgba(GOLD_HI, 0.9);
        ctx.beginPath(); ctx.arc(Math.cos(oa) * (m.r + 10), Math.sin(oa) * (m.r + 10), 2, 0, 6.28); ctx.fill();
      } else if (m.surge) {
        var sp2 = 0.6 + 0.4 * pulse;
        ctx.shadowColor = rgba(CYAN, 0.9); ctx.shadowBlur = 24 * sp2;
        ctx.fillStyle = rgba([235, 244, 252], 0.96);
        ctx.font = "700 " + (m.r * 2.0) + "px 'Cinzel', serif";
        ctx.fillText("Ω", 0, 2);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = rgba(CYAN, 0.5 * sp2); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, m.r + 8 + 2 * pulse, 0, 6.28); ctx.stroke();
        ctx.strokeStyle = rgba(GOLD_HI, 0.4 * sp2); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, m.r + 14 + 3 * pulse, 0, 6.28); ctx.stroke();
      } else {
        var gl = m.glow;
        // soft gold under-glow that intensifies near the cursor
        ctx.shadowColor = rgba(GOLD, 0.35 + 0.55 * gl);
        ctx.shadowBlur = 10 + 22 * gl + 4 * pulse;
        // marble glyph, warming toward gold as it lights up
        var cr = Math.round(MARBLE[0] + (GOLD_HI[0] - MARBLE[0]) * gl);
        var cg = Math.round(MARBLE[1] + (GOLD_HI[1] - MARBLE[1]) * gl);
        var cb = Math.round(MARBLE[2] + (GOLD_HI[2] - MARBLE[2]) * gl);
        ctx.fillStyle = "rgba(" + cr + "," + cg + "," + cb + "," + (0.82 + 0.18 * gl) + ")";
        ctx.font = "600 " + (m.r * 1.9) + "px 'Cinzel', serif";
        ctx.fillText(m.ch, 0, 1);
        // catch-ring when hot
        if (gl > 0.15) {
          ctx.shadowBlur = 0;
          ctx.strokeStyle = rgba(GOLD, gl * 0.5);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, m.r + 7 + 2 * pulse, 0, 6.28); ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.shadowBlur = 0;

    // chain lightning (Ω surge → neighbours)
    for (var ci = 0; ci < chains.length; ci++) {
      var chn = chains[ci], ck = 1 - chn.age / chn.life;
      ctx.strokeStyle = rgba(GOLD_HI, ck * 0.9);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(chn.x1, chn.y1);
      var segs = 6;
      for (var sg = 1; sg < segs; sg++) {
        var tt = sg / segs;
        ctx.lineTo(chn.x1 + (chn.x2 - chn.x1) * tt + (Math.random() - 0.5) * 14,
                   chn.y1 + (chn.y2 - chn.y1) * tt + (Math.random() - 0.5) * 14);
      }
      ctx.lineTo(chn.x2, chn.y2);
      ctx.stroke();
    }
    if (pointer.inside && !reduce) {
      for (var t = 0; t < trail.length; t++) {
        var tr = trail[t], k2 = 1 - tr.age / 0.5, rr = 1 + 4 * k2;
        ctx.globalAlpha = k2 * 0.5 * (t / trail.length);
        ctx.fillStyle = rgba(GOLD, 1);
        ctx.beginPath(); ctx.arc(tr.x, tr.y, rr, 0, 6.28); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // cursor spark
    if (pointer.inside) {
      var charged = pointer.down ? 1 : 0;
      var cf = clamp((combo - 1) / 8, 0, 1);            // grows as the combo builds
      var pr = 9 + charged * 4 + cf * 5 + 1.5 * Math.sin(time * 0.012);
      var grad = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, pr * 3.4);
      grad.addColorStop(0, rgba(GOLD_HI, 0.42 + 0.2 * charged + 0.2 * cf));
      grad.addColorStop(1, rgba(GOLD_HI, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, pr * 3.4, 0, 6.28); ctx.fill();
      ctx.strokeStyle = rgba(GOLD_HI, 0.9); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, pr, 0, 6.28); ctx.stroke();
      ctx.fillStyle = rgba(GOLD_HI, 0.95);
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 1.7, 0, 6.28); ctx.fill();
    }

    // charge ring — holding to build a field-clearing blast
    if (charging && pointer.inside) {
      var cp = clamp(holdT / CHARGE, 0, 1);
      ctx.strokeStyle = rgba(GOLD, 0.22); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 24, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = rgba(cp >= 1 ? GOLD_HI : GOLD, 0.95); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 24, -Math.PI / 2, -Math.PI / 2 + cp * 6.2832); ctx.stroke();
      if (cp >= 1) {
        var fp = 0.5 + 0.5 * Math.sin(time * 0.02);
        ctx.strokeStyle = rgba(GOLD_HI, 0.45 * fp); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 30 + fp * 5, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = rgba(GOLD_HI, 0.5 + 0.5 * fp);
        ctx.font = "600 10px 'Chakra Petch', monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("RELEASE", pointer.x, pointer.y - 44);
      }
    }

    // field-clearing blast wave
    if (blast) {
      var bp = clamp(blast.r / blast.max, 0, 1);
      ctx.strokeStyle = rgba(GOLD_HI, (1 - bp) * 0.95); ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(blast.x, blast.y, blast.r, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = rgba(CYAN, (1 - bp) * 0.6); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(blast.x, blast.y, blast.r * 0.8, 0, 6.2832); ctx.stroke();
    }

    // bonus shimmer wash
    if (shimmer > 0.001) {
      ctx.fillStyle = rgba(GOLD_HI, 0.10 * shimmer);
      ctx.fillRect(0, 0, W, H);
    }

    // soft vignette to seat the headline
    var vg = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.18, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(8,13,21,0)");
    vg.addColorStop(1, "rgba(6,10,17,0.55)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  /* ---------- loop ---------- */
  var last = performance.now(), running = true;
  function frame(now) {
    if (!running) return;
    var dt = Math.min((now - last) / 1000, 0.05); last = now;
    update(dt);
    var sy = window.scrollY || window.pageYOffset || 0;
    if (sy < H + 60) render(now);   // don't paint once the hero is scrolled away
    requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });
  window.addEventListener("resize", resize);

  /* ---------- go ---------- */
  resize();
  // a few glyphs pre-lit so it reads immediately
  requestAnimationFrame(frame);
})();
