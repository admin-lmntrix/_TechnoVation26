/* shared site behaviours */
(function () {
  "use strict";
  var doc = document, body = doc.body;

  /* ---- nav: scrolled state + mobile toggle ---- */
  var nav = doc.querySelector(".nav");
  function onScroll() { if (nav) nav.classList.toggle("scrolled", window.scrollY > 40); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var burger = doc.querySelector(".burger");
  if (burger) burger.addEventListener("click", function () { body.classList.toggle("menu-open"); });
  doc.querySelectorAll(".nav-links a").forEach(function (a) {
    a.addEventListener("click", function () { body.classList.remove("menu-open"); });
  });

  /* ---- scroll reveal ---- */
  var revealEls = doc.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- animated counters ---- */
  var counters = doc.querySelectorAll("[data-count]");
  if (counters.length) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target, end = parseFloat(el.getAttribute("data-count"));
        var suffix = el.getAttribute("data-suffix") || "", dur = 1500, t0 = null;
        function step(ts) {
          if (!t0) t0 = ts;
          var k = Math.min((ts - t0) / dur, 1);
          var eased = 1 - Math.pow(1 - k, 3);
          var val = end * eased;
          el.textContent = (end % 1 === 0 ? Math.round(val) : val.toFixed(1)) + suffix;
          if (k < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        cio.unobserve(el);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---- custom cursor (desktop / fine pointer only) ---- */
  if (matchMedia("(hover:hover) and (pointer:fine)").matches) {
    var ring = doc.createElement("div"), dot = doc.createElement("div");
    ring.className = "cursor-ring"; dot.className = "cursor-dot";
    body.appendChild(ring); body.appendChild(dot);
    body.classList.add("cursor-on");
    var rx = 0, ry = 0, dx = 0, dy = 0, tx = 0, ty = 0;
    window.addEventListener("mousemove", function (e) { tx = e.clientX; ty = e.clientY; });
    (function loop() {
      dx += (tx - dx) * 0.35; dy += (ty - dy) * 0.35;
      rx += (tx - rx) * 0.16; ry += (ty - ry) * 0.16;
      dot.style.transform = "translate(" + dx + "px," + dy + "px) translate(-50%,-50%)";
      ring.style.transform = "translate(" + rx + "px," + ry + "px) translate(-50%,-50%)";
      requestAnimationFrame(loop);
    })();
    var hot = "a,button,.btn,.ev-card,.pick,.chip,.rep,.feat,input,select,textarea,label";
    doc.addEventListener("mouseover", function (e) { if (e.target.closest(hot)) body.classList.add("cursor-hot"); });
    doc.addEventListener("mouseout", function (e) { if (e.target.closest(hot)) body.classList.remove("cursor-hot"); });
  }

  /* ---- magnetic buttons ---- */
  if (matchMedia("(hover:hover) and (pointer:fine)").matches) {
    doc.querySelectorAll("[data-magnetic]").forEach(function (el) {
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var mx = e.clientX - r.left - r.width / 2;
        var my = e.clientY - r.top - r.height / 2;
        el.style.transform = "translate(" + mx * 0.22 + "px," + my * 0.3 + "px)";
      });
      el.addEventListener("mouseleave", function () { el.style.transform = ""; });
    });
  }

  /* ---- footer year ---- */
  var yr = doc.getElementById("year"); if (yr) yr.textContent = new Date().getFullYear();
})();
