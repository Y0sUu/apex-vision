/* APEX Vision — modèles 3D externes (Sketchfab, format .glb)
 *
 * Dépose tes fichiers dans le dossier models/ :
 *   models/moto.glb   → remplace la moto simplifiée sur les 3 virages
 *   models/piste.glb  → plan du circuit en 3D, affiché sur le marqueur Hiro
 * Si un fichier est absent, la version simplifiée est gardée automatiquement.
 */
(function () {
  "use strict";

  // Réglages d'orientation (en degrés) si le modèle n'arrive pas dans le bon sens
  var CONFIG = {
    moto:  { src: "models/moto.glb",  size: 0.18, yaw: 180 },   // size = longueur de la moto (1 = largeur du marqueur)
    piste: { src: "models/piste.glb", size: 1.8,  yaw: 0, label: "Circuit de Silverstone" }
  };

  // Vérifie si un fichier existe sur le serveur
  function exists(url) {
    return fetch(url, { method: "HEAD", cache: "no-store" })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  /* Recadre automatiquement un modèle .glb : taille voulue, posé au sol, centré.
   * La plus grande dimension horizontale devient la longueur, orientée vers l'avant (-Z). */
  AFRAME.registerComponent("fit-model", {
    schema: { size: { default: 0.15 }, yaw: { default: 0 } },
    init: function () {
      var data = this.data;
      this.el.addEventListener("model-loaded", function (e) {
        var obj = e.detail.model, THREE = AFRAME.THREE;
        var parent = obj.parent;
        parent.remove(obj);
        obj.position.set(0, 0, 0); obj.scale.set(1, 1, 1); obj.rotation.set(0, 0, 0);
        obj.updateMatrixWorld(true);
        var size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
        var auto = size.x > size.z ? 90 : 0;                 // aligne la longueur sur l'axe Z
        obj.rotation.y = THREE.MathUtils.degToRad(auto + data.yaw);
        obj.updateMatrixWorld(true);
        var box = new THREE.Box3().setFromObject(obj);
        size = box.getSize(new THREE.Vector3());
        var c = box.getCenter(new THREE.Vector3());
        var s = data.size / Math.max(size.x, size.z);
        obj.scale.setScalar(s);
        obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
        parent.add(obj);
        obj.traverse(function (n) { if (n.isMesh) n.frustumCulled = false; });
      });
    }
  });

  window.ApexModels = {
    config: CONFIG,
    ready: Promise.all([exists(CONFIG.moto.src), exists(CONFIG.piste.src)]).then(function (r) {
      return { moto: r[0], piste: r[1] };
    })
  };
})();
