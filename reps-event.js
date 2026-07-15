/* ============================================================
   TECHNOVATION '26 · Grid-Lock — The Rep's Event
   A slow, golden laurel-halo of particles rotating behind the hero.
   Lightweight Three.js (r128). Degrades gracefully.
   ============================================================ */
(function () {
  "use strict";

  var canvas = document.getElementById("rep-canvas");
  if (!canvas) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function hide() { canvas.style.display = "none"; }

  if (reduce || typeof THREE === "undefined") { hide(); return; }

  // WebGL capability probe
  try {
    var test = document.createElement("canvas");
    if (!(test.getContext("webgl") || test.getContext("experimental-webgl"))) { hide(); return; }
  } catch (e) { hide(); return; }

  var host = canvas.parentElement;
  var W = host.clientWidth, H = host.clientHeight;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  } catch (e) { hide(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
  camera.position.set(0, 0, 16);

  var root = new THREE.Group();
  scene.add(root);

  /* ---------- shader for glowing gold motes ---------- */
  var vert = [
    "attribute float aSize;",
    "attribute float aPhase;",
    "attribute float aGold;",
    "uniform float uTime;",
    "uniform float uPx;",
    "varying float vGold;",
    "varying float vTw;",
    "void main(){",
    "  vGold = aGold;",
    "  vec3 p = position;",
    "  float tw = 0.6 + 0.4*sin(uTime*1.6 + aPhase*6.2831);",
    "  vTw = tw;",
    "  vec4 mv = modelViewMatrix * vec4(p,1.0);",
    "  gl_Position = projectionMatrix * mv;",
    "  gl_PointSize = aSize * uPx * (90.0 / -mv.z) * (0.7 + 0.6*tw);",
    "}"
  ].join("\n");

  var frag = [
    "precision mediump float;",
    "varying float vGold;",
    "varying float vTw;",
    "void main(){",
    "  vec2 d = gl_PointCoord - vec2(0.5);",
    "  float r = length(d);",
    "  if(r > 0.5) discard;",
    "  float a = smoothstep(0.5, 0.0, r);",
    "  a = pow(a, 1.6);",
    "  vec3 marble = vec3(0.84,0.87,0.92);",
    "  vec3 gold   = vec3(0.74,0.84,0.96);",
    "  vec3 col = mix(marble, gold, clamp(vGold,0.0,1.0));",
    "  col += gold * vTw * 0.25;",
    "  gl_FragColor = vec4(col, a * (0.55 + 0.45*vTw));",
    "}"
  ].join("\n");

  function makeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPx: { value: renderer.getPixelRatio() }
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
  }

  /* ---------- build a laurel-wreath ring of points ---------- */
  function buildWreath(count, radius, tube, leaves, goldBias) {
    var pos = new Float32Array(count * 3);
    var size = new Float32Array(count);
    var phase = new Float32Array(count);
    var gold = new Float32Array(count);

    for (var i = 0; i < count; i++) {
      var t = i / count;
      var ang = t * Math.PI * 2.0;

      var leafWave = Math.pow(Math.abs(Math.sin(ang * leaves)), 0.6);
      var bristle = tube * (0.4 + 1.6 * leafWave);

      var ru = Math.random();
      var rr = bristle * Math.sqrt(ru);
      var rphi = Math.random() * Math.PI * 2.0;

      var dirx = Math.cos(ang), diry = Math.sin(ang);
      var lean = 0.5 * Math.sin(ang * leaves);
      var ox = dirx * (radius + rr * Math.cos(rphi))
             - diry * (rr * Math.cos(rphi) * lean);
      var oy = diry * (radius + rr * Math.cos(rphi))
             + dirx * (rr * Math.cos(rphi) * lean);
      var oz = rr * Math.sin(rphi) * 0.9;

      pos[i * 3] = ox;
      pos[i * 3 + 1] = oy;
      pos[i * 3 + 2] = oz;

      size[i] = 0.6 + Math.random() * 1.5 + leafWave * 0.8;
      phase[i] = Math.random();
      gold[i] = Math.min(1.0, goldBias * (0.25 + 0.9 * leafWave) + Math.random() * 0.15);
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    g.setAttribute("aGold", new THREE.BufferAttribute(gold, 1));
    return new THREE.Points(g, makeMaterial());
  }

  var wreathA = buildWreath(2600, 6.2, 1.15, 26, 0.9);
  var wreathB = buildWreath(1700, 4.6, 0.8, 22, 0.65);
  wreathB.rotation.z = Math.PI * 0.12;
  root.add(wreathA);
  root.add(wreathB);

  // inner thin halo ring (line) for a crisp gold rim
  (function () {
    var seg = 240, arr = new Float32Array(seg * 3);
    for (var i = 0; i < seg; i++) {
      var a = (i / seg) * Math.PI * 2;
      arr[i * 3] = Math.cos(a) * 3.2;
      arr[i * 3 + 1] = Math.sin(a) * 3.2;
      arr[i * 3 + 2] = 0;
    }
    var lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    var lm = new THREE.LineBasicMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.18 });
    var ring = new THREE.LineLoop(lg, lm);
    root.add(ring);
  })();

  /* ---------- drifting dust motes ---------- */
  var motes;
  (function () {
    var n = 420;
    var pos = new Float32Array(n * 3);
    var size = new Float32Array(n);
    var phase = new Float32Array(n);
    var gold = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var r = 7 + Math.random() * 9;
      var th = Math.random() * Math.PI * 2;
      var ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
      pos[i * 3 + 2] = r * Math.cos(ph);
      size[i] = 0.4 + Math.random() * 1.0;
      phase[i] = Math.random();
      gold[i] = Math.random() * 0.4;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    g.setAttribute("aGold", new THREE.BufferAttribute(gold, 1));
    motes = new THREE.Points(g, makeMaterial());
    scene.add(motes);
  })();

  /* ---------- interaction ---------- */
  var mx = 0, my = 0, tx = 0, ty = 0;
  window.addEventListener("pointermove", function (e) {
    tx = (e.clientX / window.innerWidth) * 2 - 1;
    ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* ---------- loop ---------- */
  var clock = new THREE.Clock();
  var running = true;

  function resize() {
    W = host.clientWidth; H = host.clientHeight;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", function () {
    running = !document.hidden;
    if (running) { clock.getDelta(); animate(); }
  });

  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    wreathA.material.uniforms.uTime.value = t;
    wreathB.material.uniforms.uTime.value = t;
    motes.material.uniforms.uTime.value = t;

    root.rotation.y += dt * 0.18;
    root.rotation.x = -0.42 + Math.sin(t * 0.25) * 0.06;
    wreathB.rotation.y -= dt * 0.12;

    motes.rotation.y += dt * 0.04;

    var s = 1 + Math.sin(t * 0.5) * 0.015;
    root.scale.setScalar(s);

    mx += (tx - mx) * 0.04;
    my += (ty - my) * 0.04;
    camera.position.x = mx * 2.2;
    camera.position.y = -my * 1.6;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  resize();
  animate();
})();
