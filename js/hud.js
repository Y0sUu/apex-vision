/* APEX Vision — « Dans la peau du pilote » (expérience spectateur)
 * Simule ce que vit un pilote MotoGP dans un virage, en boucle :
 * approche → freinage → point de corde → réaccélération.
 * Valeurs indicatives, calculées pour rester physiquement cohérentes.
 */
(function () {
  "use strict";

  // Virages du Grand Prix de France MotoGP (circuit Bugatti, Le Mans) — valeurs indicatives
  var CORNERS = {
    v1: { num: "VIRAGE 1", label: "Chicane Dunlop", dir: 1,  angle: 90, vmax: 296, vapex: 98,  gear: 2, lean: 54, brakeAt: 210 },
    v2: { num: "VIRAGE 2", label: "Le Musée",       dir: -1, angle: 75, vmax: 248, vapex: 84,  gear: 2, lean: 58, brakeAt: 150 },
    v3: { num: "VIRAGE 3", label: "Garage Vert",    dir: 1,  angle: 85, vmax: 262, vapex: 112, gear: 3, lean: 61, brakeAt: 165 }
  };

  // Durée des phases (ms)
  var P = { approach: 2600, brake: 1400, apex: 1400, exit: 1700 };
  var CYCLE = P.approach + P.brake + P.apex + P.exit;

  var root, els = {}, current = null, t0 = 0, raf = 0, chrono0 = performance.now();
  var state = { phase: "idle", k: 0, corner: null };

  // Chiffres « spectateur » dérivés des données du virage
  function stats(c) {
    var v1 = c.vmax / 3.6, v2 = c.vapex / 3.6;
    var g = (v1 * v1 - v2 * v2) / (2 * c.brakeAt * 9.81);       // décélération moyenne en G
    var time = (v1 - v2) / (g * 9.81);                           // durée du freinage en s
    return { g: g.toFixed(1).replace(".", ","), time: time.toFixed(1).replace(".", ","), mps: Math.round(v1) };
  }
  function facts(c) {
    var s = stats(c);
    return {
      approach: [c.vmax + " km/h", "Le pilote parcourt " + s.mps + " mètres chaque seconde"],
      brake:    [c.vmax + " → " + c.vapex + " km/h en " + s.time + " s", "Freinage à " + s.g + " G sur " + c.brakeAt + " m : son corps est projeté vers l'avant"],
      apex:     ["Inclinée à " + c.lean + "°", "Le genou et le coude frôlent le bitume, à " + c.vapex + " km/h"],
      exit:     ["Remise des gaz", "Progressive, pour ne pas faire glisser le pneu arrière"]
    };
  }
  function setPhase(p, k) {
    state.k = k;
    if (state.phase === p) return;
    state.phase = p;
    document.documentElement.setAttribute("data-phase", p);
    var f = facts(current)[p];
    if (f) { els.factBig.textContent = f[0]; els.factSmall.textContent = f[1]; }
    els.fact.className = "fact show f-" + p;
  }

  var TEMPLATE =
    '<svg class="visor-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M4 18 Q50 4 96 18" vector-effect="non-scaling-stroke"/>' +
    '<path d="M4 86 Q50 98 96 86" vector-effect="non-scaling-stroke"/></svg>' +
    '<div class="hud-top"><div class="brand">APEX&nbsp;VISION</div>' +
    '<div class="status" data-el="status"><span class="dot"></span><span data-el="statusText">Vise un virage du stand</span></div></div>' +
    '<div class="hud-data">' +
    '  <div class="corner-name"><div class="num" data-el="num"></div><div class="label" data-el="label"></div><div class="dir" data-el="dir"></div></div>' +
    '  <div class="brake" data-el="brakeBox"><div class="cap">POINT DE FREINAGE</div>' +
    '    <div class="val"><span data-el="dist">0</span><small>m</small></div><div class="bar"><i data-el="bar"></i></div></div>' +
    '  <div class="action" data-el="action"></div>' +
    '  <div class="fact" data-el="fact"><div class="big" data-el="factBig"></div><div class="small" data-el="factSmall"></div></div>' +
    '  <div class="gauge left"><div class="cap">VITESSE</div><div class="val" data-el="speed">0</div><div class="unit">km/h</div></div>' +
    '  <div class="gauge right"><div class="cap">RAPPORT</div><div class="val" data-el="gear">6</div><div class="unit" data-el="gearHint">cible —</div></div>' +
    '  <div class="lean"><svg viewBox="0 0 160 92">' +
    '    <path class="arc" d="M10 86 A70 70 0 0 1 150 86"/>' +
    '    <line class="target" data-el="target" x1="80" y1="4" x2="80" y2="26"/>' +
    '    <line class="needle" data-el="needle" x1="80" y1="8" x2="80" y2="24"/>' +
    '    <text class="num" x="80" y="80" text-anchor="middle"><tspan data-el="leanVal">0</tspan>°</text></svg>' +
    '    <div class="cap">ANGLE · CIBLE <span data-el="leanTarget">0</span>°</div></div>' +
    '  <div class="hud-bottom"><div><b>LE MANS</b></div><div><b data-el="chrono">0:00.000</b></div><div>TOUR <b>12</b>/27</div></div>' +
    '</div>';

  function lerp(a, b, k) { return a + (b - a) * k; }
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
  function easeInOut(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }

  function mount(container) {
    root = document.createElement("div");
    root.className = "visor";
    root.innerHTML = TEMPLATE;
    (container || document.body).appendChild(root);
    root.querySelectorAll("[data-el]").forEach(function (n) { els[n.getAttribute("data-el")] = n; });
    tickChrono();
    return api;
  }

  function show(id) {
    var c = CORNERS[id];
    if (!c) return;
    if (current !== c) {
      current = c;
      state.corner = c;
      state.phase = "";
      t0 = performance.now();
      els.num.textContent = c.num;
      els.label.textContent = c.label;
      els.dir.textContent = (c.dir > 0 ? "Droite  ↱  " : "Gauche  ↰  ") + c.angle + "°";
      els.leanTarget.textContent = c.lean;
      els.gearHint.textContent = "cible " + c.gear;
      var a = c.lean * c.dir;
      els.target.setAttribute("transform", "rotate(" + a + " 80 86)");
    }
    root.classList.add("active");
    els.status.classList.add("live");
    els.statusText.textContent = "Virage détecté";
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function hide() {
    root.classList.remove("active", "braking");
    els.status.classList.remove("live");
    els.statusText.textContent = "Vise un virage du stand";
    cancelAnimationFrame(raf); raf = 0;
    current = null;
    state.phase = "idle"; state.corner = null;
    document.documentElement.setAttribute("data-phase", "idle");
  }

  function setAction(text, cls) {
    var a = els.action;
    if (!text) { a.className = "action"; return; }
    a.textContent = text;
    a.className = "action show " + cls;
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    var c = current; if (!c) return;
    var t = (now - t0) % CYCLE;
    var speed, gear, lean, dist = 0;

    if (t < P.approach) {                                   // 1. approche
      var k = t / P.approach;
      dist = Math.round(lerp(c.brakeAt + 120, 0, k));
      speed = lerp(c.vmax - 10, c.vmax, k);
      gear = 6; lean = 0;
      els.brakeBox.style.opacity = 1;
      els.bar.style.transform = "scaleX(" + (1 - k) + ")";
      setAction(null);
      root.classList.remove("braking");
      setPhase("approach", k);
    } else if (t < P.approach + P.brake) {                  // 2. freinage
      var kb = (t - P.approach) / P.brake;
      speed = lerp(c.vmax, c.vapex, easeOut(kb));
      gear = Math.max(c.gear, 6 - Math.floor(kb * (6 - c.gear + 1)));
      lean = lerp(0, c.lean * 0.3, kb);
      els.brakeBox.style.opacity = 0;
      setAction("FREINE", "brake-now");
      root.classList.add("braking");
      setPhase("brake", kb);
    } else if (t < P.approach + P.brake + P.apex) {         // 3. point de corde
      var ka = (t - P.approach - P.brake) / P.apex;
      speed = c.vapex + Math.sin(ka * Math.PI) * 4;
      gear = c.gear;
      lean = lerp(c.lean * 0.3, c.lean, easeInOut(Math.min(1, ka * 1.6)));
      setAction("CORDE", "apex");
      root.classList.remove("braking");
      setPhase("apex", ka);
    } else {                                                // 4. réaccélération
      var ke = (t - P.approach - P.brake - P.apex) / P.exit;
      speed = lerp(c.vapex, c.vapex + 95, ke);
      gear = Math.min(6, c.gear + Math.floor(ke * 3));
      lean = lerp(c.lean, 0, easeInOut(ke));
      setAction("GAZ", "throttle");
      setPhase("exit", ke);
    }

    els.dist.textContent = dist;
    els.speed.textContent = Math.round(speed);
    els.gear.textContent = gear;
    els.leanVal.textContent = Math.round(lean);
    els.needle.setAttribute("transform", "rotate(" + (lean * c.dir).toFixed(1) + " 80 86)");
  }

  function tickChrono() {
    var ms = (performance.now() - chrono0) % 93000;       // tour d'environ 1:33
    var m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, r = Math.floor(ms % 1000);
    if (els.chrono) els.chrono.textContent = m + ":" + String(s).padStart(2, "0") + "." + String(r).padStart(3, "0");
    setTimeout(tickChrono, 47);
  }

  var api = { mount: mount, show: show, hide: hide, corners: CORNERS, state: state, stats: stats };
  window.ApexHUD = api;
})();
