/* APEX Vision — maquette 3D d'un virage posée sur le marqueur (vue d'en haut).
 * Piste texturée, vibreurs rouge/blanc, dégagement vert, bac à gravier, barrières,
 * tribune avec public, arbres, panneaux de distance, et tirets de trajectoire
 * façon jeu vidéo (vert = pleine charge, rouge = freinage, jaune = corde).
 * La moto suit la trajectoire, synchronisée avec le HUD.
 */
(function () {
  "use strict";

  var THREE = AFRAME.THREE;
  var R = 0.5;                       // rayon du virage (axe de la piste)
  var L1 = 0.95;                     // longueur de la ligne droite
  var L2 = Math.PI * R / 2;          // longueur de l'arc
  var L3 = 0.65;                     // longueur de la sortie
  var U_BRAKE = 0.5;                 // début du freinage sur la ligne droite
  var HALF = 0.13;                   // demi-largeur de la piste
  var PHASE_COL = { approach: "#3affc4", brake: "#ff3b30", apex: "#ffd60a", exit: "#3affc4" };

  function lerp(a, b, k) { return a + (b - a) * k; }
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
  function easeInOut(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }

  /* ---------- Textures dessinées en code (pas de fichier à charger) ---------- */
  var texCache = {};
  function canvasTex(key, size, draw) {
    if (texCache[key]) return texCache[key];
    var cv = document.createElement("canvas");
    cv.width = cv.height = size;
    draw(cv.getContext("2d"), size);
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return (texCache[key] = t);
  }
  function noise(g, n, s, base, spread, alpha) {
    for (var i = 0; i < n; i++) {
      var v = base + (Math.random() - 0.5) * spread;
      g.fillStyle = "rgba(" + v + "," + v + "," + (v + 3) + "," + alpha + ")";
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }
  function asphaltTex() {
    return canvasTex("asphalt", 256, function (g, s) {
      g.fillStyle = "#3b3e44"; g.fillRect(0, 0, s, s);
      noise(g, 9000, s, 62, 40, 0.55);
      g.fillStyle = "rgba(20,20,22,.25)";                       // traces de gomme au centre
      g.fillRect(0, s * 0.38, s, s * 0.24);
    });
  }
  function grassTex() {
    return canvasTex("grass", 256, function (g, s) {
      for (var i = 0; i < 8; i++) {                             // bandes de tonte
        g.fillStyle = i % 2 ? "#3a6b2f" : "#437a36";
        g.fillRect(0, i * s / 8, s, s / 8);
      }
      for (var k = 0; k < 6000; k++) {
        g.fillStyle = "rgba(" + (40 + Math.random() * 40) + "," + (90 + Math.random() * 60) + ",40,.35)";
        g.fillRect(Math.random() * s, Math.random() * s, 1, 2);
      }
    });
  }
  function gravelTex() {
    return canvasTex("gravel", 128, function (g, s) {
      g.fillStyle = "#b8975e"; g.fillRect(0, 0, s, s);
      for (var i = 0; i < 4000; i++) {
        var v = 130 + Math.random() * 80;
        g.fillStyle = "rgb(" + v + "," + (v - 22) + "," + (v - 65) + ")";
        g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
      }
    });
  }
  function crowdTex() {
    return canvasTex("crowd", 256, function (g, s) {
      g.fillStyle = "#2a2f38"; g.fillRect(0, 0, s, s);
      var cols = ["#e63946", "#f1faee", "#ffd60a", "#1d70b8", "#ff7b00", "#2ec4b6", "#111", "#c1121f"];
      for (var y = 2; y < s; y += 6) for (var x = 1; x < s; x += 4) {
        if (Math.random() < 0.12) continue;                      // places vides
        g.fillStyle = cols[(Math.random() * cols.length) | 0];
        g.fillRect(x + Math.random(), y, 3, 4);
        g.fillStyle = "#e0b48f"; g.fillRect(x + 0.5, y - 2, 2, 2); // têtes
      }
    });
  }
  function adTex() {
    return canvasTex("ads", 256, function (g, s) {
      var c = ["#d4ff3a", "#0b0d10", "#e63946", "#1d70b8"];
      for (var i = 0; i < 4; i++) {
        g.fillStyle = c[i]; g.fillRect(i * s / 4, 0, s / 4, s);
        g.fillStyle = i === 1 ? "#d4ff3a" : "#fff";
        g.font = "bold 34px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
        g.save(); g.translate(i * s / 4 + s / 8, s / 2); g.scale(0.5, 3);
        g.fillText(["APEX", "APEX", "GP", "MOTO"][i], 0, 0); g.restore();
      }
    });
  }

  AFRAME.registerComponent("corner-model", {
    schema: { corner: { type: "string", default: "v1" } },

    /* Point de l'axe de la piste à l'abscisse u, direction, et normale vers l'intérieur du virage */
    path: function (u) {
      var s = this.s;
      if (u <= L1) return { x: s * R, z: L1 - u, dx: 0, dz: -1, ix: -s, iz: 0 };
      if (u <= L1 + L2) {
        var a = (u - L1) / R, ca = Math.cos(a), sa = Math.sin(a);
        return { x: s * R * ca, z: -R * sa, dx: -s * sa, dz: -ca, ix: -s * ca, iz: sa };
      }
      var e = u - L1 - L2;
      return { x: -s * e, z: -R, dx: -s, dz: 0, ix: 0, iz: 1 };
    },
    at: function (u, off) {
      var p = this.path(u);
      return { x: p.x + p.ix * off, z: p.z + p.iz * off, p: p };
    },
    /* Trajectoire idéale : extérieur → corde → extérieur (décalage positif = intérieur) */
    line: function (u) {
      if (u <= L1 || u >= L1 + L2) return -0.075;
      return -0.075 + 0.165 * Math.sin(Math.PI * (u - L1) / L2);
    },

    /* Bande qui suit la piste entre deux décalages, découpée en n segments */
    ribbon: function (u0, u1, n, d0, d1, y, opts) {
      opts = opts || {};
      var pos = [], uv = [], col = [], self = this;
      var tmp = new THREE.Color();
      for (var i = 0; i < n; i++) {
        var ua = lerp(u0, u1, i / n), ub = lerp(u0, u1, (i + 1) / n);
        var A0 = self.at(ua, d0), A1 = self.at(ua, d1), B0 = self.at(ub, d0), B1 = self.at(ub, d1);
        var q = [A0, A1, B1, A0, B1, B0], qv = [[ua, 0], [ua, 1], [ub, 1], [ua, 0], [ub, 1], [ub, 0]];
        for (var j = 0; j < 6; j++) {
          pos.push(q[j].x, y, q[j].z);
          uv.push(qv[j][0] * (opts.uScale || 1), qv[j][1] * (opts.vScale || 1));
          if (opts.colors) { tmp.set(opts.colors[i % opts.colors.length]); col.push(tmp.r, tmp.g, tmp.b); }
        }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      if (opts.colors) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    },
    mesh: function (geo, mat) {
      mat.side = THREE.DoubleSide;
      var m = new THREE.Mesh(geo, mat);
      this.group.add(m);
      return m;
    },

    buildScene: function () {
      var self = this, s = this.s, END = L1 + L2 + L3;
      var G = this.group = new THREE.Group();
      var lam = function (o) { return new THREE.MeshLambertMaterial(o); };

      // Herbe
      var gt = grassTex().clone(); gt.needsUpdate = true; gt.repeat.set(5, 5);
      var ground = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.0), lam({ map: gt }));
      ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 0.15);
      G.add(ground);

      // Bac à gravier à l'extérieur du virage + dégagement vert/blanc façon F1
      self.mesh(self.ribbon(L1 - 0.15, L1 + L2 + 0.2, 40, -0.175, -0.36, 0.001, { uScale: 6, vScale: 1.5 }), lam({ map: gravelTex() }));
      self.mesh(self.ribbon(-0.1, END, 70, -HALF, -0.175, 0.0015, { colors: ["#2e9e6a", "#2e9e6a", "#2e9e6a", "#f2f2f2"] }), lam({ vertexColors: true }));
      self.mesh(self.ribbon(L1 - 0.05, L1 + L2 + 0.05, 30, HALF + 0.025, HALF + 0.07, 0.0015, { colors: ["#2e9e6a"] }), lam({ vertexColors: true }));

      // Asphalte
      self.mesh(self.ribbon(-0.1, END, 60, -HALF, HALF, 0.002, { uScale: 4 }), lam({ map: asphaltTex() }));
      // Lignes blanches de bord de piste
      self.mesh(self.ribbon(-0.1, END, 60, -HALF + 0.004, -HALF + 0.01, 0.0025), lam({ color: "#f4f4f4" }));
      self.mesh(self.ribbon(-0.1, END, 60, HALF - 0.01, HALF - 0.004, 0.0025), lam({ color: "#f4f4f4" }));

      // Vibreurs rouge/blanc : intérieur du virage, extérieur à l'entrée et à la sortie
      var kerb = ["#d62d20", "#f7f7f7"];
      self.mesh(self.ribbon(L1 - 0.05, L1 + L2 + 0.05, 26, HALF, HALF + 0.025, 0.004, { colors: kerb }), lam({ vertexColors: true }));
      self.mesh(self.ribbon(L1 - 0.22, L1 + 0.12, 14, -HALF - 0.022, -HALF, 0.004, { colors: kerb }), lam({ vertexColors: true }));
      self.mesh(self.ribbon(L1 + L2 - 0.08, L1 + L2 + 0.3, 16, -HALF - 0.022, -HALF, 0.004, { colors: kerb }), lam({ vertexColors: true }));

      // Ligne de freinage
      self.mesh(self.ribbon(U_BRAKE - 0.006, U_BRAKE + 0.006, 1, -HALF + 0.01, HALF - 0.01, 0.0035), lam({ color: "#ffffff" }));

      // Tirets de trajectoire (un maillage par phase pour pouvoir les mettre en valeur)
      var ranges = { approach: [0.02, U_BRAKE], brake: [U_BRAKE, L1], apex: [L1, L1 + L2], exit: [L1 + L2, END - 0.03] };
      self.chev = {};
      Object.keys(ranges).forEach(function (ph) {
        var r = ranges[ph], pos = [], step = 0.042;
        for (var u = r[0] + step / 2; u < r[1]; u += step) {
          var o = self.line(u), w = ph === "brake" ? 0.014 : 0.01;
          var g = self.ribbon(u - 0.013, u + 0.013, 1, o - w, o + w, 0.005);
          pos.push.apply(pos, g.attributes.position.array);
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        self.chev[ph] = self.mesh(geo, new THREE.MeshBasicMaterial({ color: PHASE_COL[ph], transparent: true }));
      });

      // Point de corde
      var ap = self.at(L1 + L2 / 2, self.line(L1 + L2 / 2));
      var apex = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 20), new THREE.MeshBasicMaterial({ color: "#ffd60a" }));
      apex.position.set(ap.x, 0.006, ap.z); G.add(apex); self.apexDot = apex;

      // Barrières bleu/blanc derrière le gravier
      var bn = 34, bar = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.022, 0.008), lam({}), bn);
      var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
      for (var i = 0; i < bn; i++) {
        var u = lerp(L1 - 0.15, L1 + L2 + 0.25, i / (bn - 1)), b = self.at(u, -0.38);
        q.setFromAxisAngle(up, Math.atan2(-b.p.dx, -b.p.dz));
        m4.compose(new THREE.Vector3(b.x, 0.011, b.z), q, sc);
        bar.setMatrixAt(i, m4);
        bar.setColorAt(i, new THREE.Color(i % 2 ? "#1d4fd8" : "#f2f2f2"));
      }
      G.add(bar);

      // Tribune avec public, face au virage
      var tm = L1 + L2 * 0.5, tP = self.at(tm, -0.52);
      var stand = new THREE.Group();
      var crowd = lam({ map: crowdTex() }), concrete = lam({ color: "#8d939b" });
      for (var t = 0; t < 4; t++) {
        var step = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02 + t * 0.02, 0.035),
          [concrete, concrete, concrete, concrete, crowd, concrete]);
        step.position.set(0, (0.02 + t * 0.02) / 2, -t * 0.035);
        stand.add(step);
      }
      var roof = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.006, 0.17), lam({ color: "#e8e8e8" }));
      roof.position.set(0, 0.13, -0.06); stand.add(roof);
      [-0.2, 0.2].forEach(function (x) {
        var post = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.13, 0.006), concrete);
        post.position.set(x, 0.065, -0.13); stand.add(post);
      });
      stand.position.set(tP.x, 0, tP.z);
      stand.rotation.y = Math.atan2(tP.p.ix, tP.p.iz);          // la face avant (+Z) regarde la piste
      G.add(stand);

      // Arbres dans l'intérieur du virage et autour
      var leaf = lam({ color: "#2f5d2a" }), leaf2 = lam({ color: "#3d7334" }), trunk = lam({ color: "#5b4130" });
      var spots = [[0.08, 0.1], [0.18, 0.05], [0.12, 0.2], [0.24, 0.18], [0.05, 0.28], [-0.55, 0.75], [-0.62, 0.5], [0.88, 0.2], [-0.3, -0.85], [-0.3, 0.98], [0.9, 0.6]];
      spots.forEach(function (sp, k) {
        var tr = new THREE.Group(), h = 0.06 + (k % 3) * 0.015;
        var c1 = new THREE.Mesh(new THREE.ConeGeometry(0.03, h, 7), k % 2 ? leaf : leaf2); c1.position.y = 0.02 + h / 2;
        var c0 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 5), trunk); c0.position.y = 0.01;
        tr.add(c0, c1);
        // coordonnées données pour un virage à gauche, mises en miroir selon le sens
        tr.position.set(s * sp[0], 0, k < 5 ? -sp[1] : sp[1]);
        G.add(tr);
      });

      self.el.setObject3D("track", G);
    },

    init: function () {
      var c = ApexHUD.corners[this.data.corner];
      var st = ApexHUD.stats(c);
      var s = -c.dir;               // s = -1 : virage à droite, s = 1 : virage à gauche
      this.c = c; this.s = s;
      this.buildScene();

      var self = this;
      function lbl(id, u, off, y, text, color) {
        var p = self.at(u, off);
        return '<a-entity class="lbl" data-phase="' + id + '" position="' + p.x.toFixed(3) + ' ' + y + ' ' + p.z.toFixed(3) + '" rotation="-35 0 0">' +
          '<a-plane width="0.52" height="0.11" material="color: #0b0d10; opacity: 0.78; transparent: true; side: double"></a-plane>' +
          '<a-text value="' + text + '" align="center" color="' + color + '" width="1.1" position="0 0 0.003"></a-text></a-entity>';
      }
      function board(u, text, red) {
        var p = self.at(u, -0.2);
        return '<a-entity position="' + p.x.toFixed(3) + ' 0 ' + p.z.toFixed(3) + '">' +
          '<a-box width="0.006" height="0.08" depth="0.006" position="0 0.04 0" color="#9aa0a6"></a-box>' +
          '<a-plane width="0.08" height="0.055" position="0 0.1 0" material="color: ' + (red ? "#ff3b30" : "#ffffff") + '; side: double"></a-plane>' +
          '<a-text value="' + text + '" align="center" color="' + (red ? "#ffffff" : "#000000") + '" width="0.5" position="0 0.1 0.002"></a-text>' +
          '</a-entity>';
      }

      this.el.insertAdjacentHTML("beforeend",
        board(U_BRAKE, String(c.brakeAt), true) + board(0.65, "100", false) + board(0.8, "50", false) +
        lbl("approach", 0.12, 0, 0.16, c.vmax + " km/h", PHASE_COL.approach) +
        lbl("brake", 0.72, 0.3, 0.2, "FREINAGE " + c.brakeAt + " m  " + st.g + " G", "#ff8a80") +
        lbl("apex", L1 + L2 / 2, 0.3, 0.24, c.vapex + " km/h  angle " + c.lean, PHASE_COL.apex) +
        '<a-entity class="bike"><a-entity class="bike-roll">' +
        '  <a-box color="#d4ff3a" width="0.035" height="0.03" depth="0.12" position="0 0.04 0"></a-box>' +
        '  <a-box color="#111" width="0.03" height="0.02" depth="0.05" position="0 0.065 0.01"></a-box>' +
        '  <a-sphere color="#ffffff" radius="0.014" position="0 0.085 -0.01"></a-sphere>' +
        '  <a-cylinder color="#111" radius="0.022" height="0.012" rotation="0 0 90" position="0 0.022 -0.05"></a-cylinder>' +
        '  <a-cylinder color="#111" radius="0.022" height="0.012" rotation="0 0 90" position="0 0.022 0.05"></a-cylinder>' +
        '</a-entity></a-entity>');

      this.bike = this.el.querySelector(".bike");
      this.roll = this.el.querySelector(".bike-roll");
      this.lbls = this.el.querySelectorAll(".lbl");
      this.last = "";

      // Remplace la moto simplifiée par le modèle Sketchfab s'il est présent
      var roll = this.roll;
      if (window.ApexModels) ApexModels.ready.then(function (has) {
        if (!has.moto) return;
        var m = ApexModels.config.moto;
        roll.innerHTML = '<a-entity gltf-model="url(' + m.src + ')" fit-model="size: ' + m.size + '; yaw: ' + m.yaw + '"></a-entity>';
      });
    },

    tick: function (time) {
      var st = ApexHUD.state, c = this.c, s = this.s;
      var on = st.corner === c;
      var phase = on ? st.phase : "idle", k = on ? st.k : 0;
      var u = 0, lean = 0;

      if (phase === "approach") { u = lerp(0, U_BRAKE, k); }
      else if (phase === "brake") { u = lerp(U_BRAKE, L1, easeOut(k)); lean = c.lean * 0.3 * k; }
      else if (phase === "apex") { u = L1 + L2 * k; lean = lerp(c.lean * 0.3, c.lean, easeInOut(Math.min(1, k * 1.6))); }
      else if (phase === "exit") { u = L1 + L2 + (L3 - 0.05) * k; lean = lerp(c.lean, 0, easeInOut(k)); }

      var b = this.at(u, this.line(u));
      this.bike.object3D.position.set(b.x, 0.003, b.z);
      this.bike.object3D.rotation.set(0, Math.atan2(-b.p.dx, -b.p.dz), 0);
      this.roll.object3D.rotation.set(0, 0, s * lean * Math.PI / 180);

      // le point de corde pulse
      var pulse = 1 + 0.35 * Math.sin(time / 160);
      this.apexDot.scale.set(pulse, 1, pulse);

      // met en valeur les tirets et l'étiquette de la phase en cours
      if (phase !== this.last) {
        this.last = phase;
        var all = phase === "idle", chev = this.chev;
        Object.keys(chev).forEach(function (ph) { chev[ph].material.opacity = all || ph === phase ? 1 : 0.3; });
        this.lbls.forEach(function (n) {
          n.setAttribute("visible", all || n.dataset.phase === phase || (phase === "exit" && n.dataset.phase === "apex"));
        });
      }
      if (phase === "brake") this.chev.brake.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(time / 120));
    }
  });
})();
