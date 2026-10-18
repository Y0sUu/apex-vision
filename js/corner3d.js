/* APEX Vision — maquette 3D d'un virage posée sur le marqueur.
 * Trajectoire peinte au sol (vert = pleine charge, rouge = freinage, jaune = corde),
 * panneaux de distance, étiquettes de vitesse, et une moto synchronisée avec le HUD.
 */
(function () {
  "use strict";

  var COL = { green: "#3affc4", red: "#ff3b30", yellow: "#d4ff3a", asphalt: "#2b2f36", grass: "#2d4a26" };
  var R = 0.5;                 // rayon de la trajectoire dans le virage
  var Z_START = 0.95, Z_BRAKE = 0.45, EXIT_LEN = 0.65;

  function lerp(a, b, k) { return a + (b - a) * k; }
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
  function easeInOut(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }

  function label(id, x, y, z, text, color) {
    return '<a-entity class="lbl" data-phase="' + id + '" position="' + x + ' ' + y + ' ' + z + '" rotation="-35 0 0">' +
      '<a-plane width="0.52" height="0.11" material="color: #0b0d10; opacity: 0.75; transparent: true; side: double"></a-plane>' +
      '<a-text value="' + text + '" align="center" color="' + color + '" width="1.1" position="0 0 0.003"></a-text></a-entity>';
  }

  function board(x, z, text, red) {
    return '<a-entity position="' + x + ' 0 ' + z + '">' +
      '<a-cylinder radius="0.004" height="0.09" position="0 0.045 0" color="#888"></a-cylinder>' +
      '<a-plane width="0.09" height="0.06" position="0 0.11 0" material="color: ' + (red ? COL.red : "#ffffff") + '; side: double"></a-plane>' +
      '<a-text value="' + text + '" align="center" color="' + (red ? "#ffffff" : "#000000") + '" width="0.55" position="0 0.11 0.002"></a-text>' +
      '</a-entity>';
  }

  AFRAME.registerComponent("corner-model", {
    schema: { corner: { type: "string", default: "v1" } },

    init: function () {
      var c = ApexHUD.corners[this.data.corner];
      var st = ApexHUD.stats(c);
      var s = -c.dir;               // s = -1 : virage à droite, s = 1 : virage à gauche
      this.c = c; this.s = s;
      var th = s > 0 ? 0 : 90;      // début de l'arc
      var xs = (s * R).toFixed(3);
      var ax = (s * R * Math.SQRT1_2).toFixed(3), az = (-R * Math.SQRT1_2).toFixed(3);

      var html =
        // herbe + piste
        '<a-plane width="1.9" height="2.0" rotation="-90 0 0" position="0 0 0.2" material="color: ' + COL.grass + '; side: double"></a-plane>' +
        '<a-plane width="0.26" height="' + Z_START + '" rotation="-90 0 0" position="' + xs + ' 0.002 ' + (Z_START / 2) + '" material="color: ' + COL.asphalt + '; side: double"></a-plane>' +
        '<a-ring radius-inner="0.37" radius-outer="0.63" theta-start="' + th + '" theta-length="90" rotation="-90 0 0" position="0 0.002 0" material="color: ' + COL.asphalt + '; side: double"></a-ring>' +
        '<a-plane width="' + EXIT_LEN + '" height="0.26" rotation="-90 0 0" position="' + (-s * EXIT_LEN / 2).toFixed(3) + ' 0.002 ' + (-R) + '" material="color: ' + COL.asphalt + '; side: double"></a-plane>' +
        // vibreur intérieur
        '<a-ring radius-inner="0.35" radius-outer="0.37" theta-start="' + th + '" theta-length="90" rotation="-90 0 0" position="0 0.004 0" material="color: #ffffff; side: double"></a-ring>' +
        // trajectoire peinte au sol
        '<a-plane class="seg" data-phase="approach" width="0.025" height="' + (Z_START - Z_BRAKE) + '" rotation="-90 0 0" position="' + xs + ' 0.008 ' + ((Z_START + Z_BRAKE) / 2) + '" material="color: ' + COL.green + '; side: double; transparent: true"></a-plane>' +
        '<a-plane class="seg" data-phase="brake" width="0.04" height="' + Z_BRAKE + '" rotation="-90 0 0" position="' + xs + ' 0.008 ' + (Z_BRAKE / 2) + '" material="color: ' + COL.red + '; side: double; transparent: true"></a-plane>' +
        '<a-ring class="seg" data-phase="apex" radius-inner="' + (R - 0.0125) + '" radius-outer="' + (R + 0.0125) + '" theta-start="' + th + '" theta-length="90" rotation="-90 0 0" position="0 0.008 0" material="color: ' + COL.yellow + '; side: double; transparent: true"></a-ring>' +
        '<a-plane class="seg" data-phase="exit" width="' + EXIT_LEN + '" height="0.025" rotation="-90 0 0" position="' + (-s * EXIT_LEN / 2).toFixed(3) + ' 0.008 ' + (-R) + '" material="color: ' + COL.green + '; side: double; transparent: true"></a-plane>' +
        // ligne de freinage + point de corde
        '<a-plane width="0.26" height="0.012" rotation="-90 0 0" position="' + xs + ' 0.01 ' + Z_BRAKE + '" material="color: #ffffff; side: double"></a-plane>' +
        '<a-sphere radius="0.025" position="' + ax + ' 0.03 ' + az + '" material="color: ' + COL.yellow + '; emissive: ' + COL.yellow + '; emissiveIntensity: 0.6"' +
        '  animation="property: scale; from: 1 1 1; to: 1.6 1.6 1.6; dur: 600; dir: alternate; loop: true"></a-sphere>' +
        // panneaux de distance (côté extérieur de la ligne droite)
        board((s * 0.68).toFixed(3), Z_BRAKE, String(c.brakeAt), true) +
        board((s * 0.68).toFixed(3), 0.3, "100", false) +
        board((s * 0.68).toFixed(3), 0.15, "50", false) +
        // étiquettes de performance
        label("approach", xs, 0.16, 0.82, c.vmax + " km/h", COL.green) +
        label("brake", (s * 0.32).toFixed(3), 0.2, 0.25, "FREINAGE " + c.brakeAt + " m  " + st.g + " G", "#ff8a80") +
        label("apex", ax, 0.24, az, c.vapex + " km/h  angle " + c.lean, COL.yellow) +
        // la moto
        '<a-entity class="bike">' +
        '  <a-entity class="bike-roll">' +
        '    <a-box color="#d4ff3a" width="0.035" height="0.03" depth="0.12" position="0 0.04 0"></a-box>' +
        '    <a-box color="#111" width="0.03" height="0.02" depth="0.05" position="0 0.065 0.01"></a-box>' +
        '    <a-sphere color="#ffffff" radius="0.014" position="0 0.085 -0.01"></a-sphere>' +
        '    <a-cylinder color="#111" radius="0.022" height="0.012" rotation="0 0 90" position="0 0.022 -0.05"></a-cylinder>' +
        '    <a-cylinder color="#111" radius="0.022" height="0.012" rotation="0 0 90" position="0 0.022 0.05"></a-cylinder>' +
        '  </a-entity>' +
        '</a-entity>';

      this.el.innerHTML = html;
      this.bike = this.el.querySelector(".bike");
      this.roll = this.el.querySelector(".bike-roll");
      this.segs = this.el.querySelectorAll(".seg");
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

    tick: function () {
      var st = ApexHUD.state, c = this.c, s = this.s;
      var on = st.corner === c;
      var phase = on ? st.phase : "idle", k = on ? st.k : 0;
      var x = s * R, z = Z_START, yaw = 0, lean = 0;

      if (phase === "approach") {
        z = lerp(Z_START, Z_BRAKE, k);
      } else if (phase === "brake") {
        z = lerp(Z_BRAKE, 0, easeOut(k)); lean = c.lean * 0.3 * k;
      } else if (phase === "apex") {
        var a = k * Math.PI / 2;
        x = s * R * Math.cos(a); z = -R * Math.sin(a);
        yaw = s * k * 90;
        lean = lerp(c.lean * 0.3, c.lean, easeInOut(Math.min(1, k * 1.6)));
      } else if (phase === "exit") {
        x = lerp(0, -s * EXIT_LEN, k); z = -R; yaw = s * 90;
        lean = lerp(c.lean, 0, easeInOut(k));
      }
      this.bike.object3D.position.set(x, 0, z);
      this.bike.object3D.rotation.set(0, yaw * Math.PI / 180, 0);
      this.roll.object3D.rotation.set(0, 0, s * lean * Math.PI / 180);

      // met en valeur la portion de trajectoire et l'étiquette de la phase en cours
      if (phase !== this.last) {
        this.last = phase;
        var all = phase === "idle";
        this.segs.forEach(function (n) {
          n.setAttribute("material", "opacity", all || n.dataset.phase === phase ? 1 : 0.35);
        });
        this.lbls.forEach(function (n) {
          n.setAttribute("visible", all || n.dataset.phase === phase || (phase === "exit" && n.dataset.phase === "apex"));
        });
      }
    }
  });
})();
