import * as THREE from 'three';

/** Moldura 3D presa à câmara; sete peças simples, sem vidro/transparências. */
export function criarMolduraCockpit(camera) {
  const grupo = new THREE.Group();
  grupo.name = 'cockpit-windshield-frame';
  grupo.visible = false;
  const material = new THREE.MeshBasicMaterial({ color: 0x202b30, depthTest: false, depthWrite: false, fog: false });
  const borda = new THREE.MeshBasicMaterial({ color: 0x536268, depthTest: false, depthWrite: false, fog: false });
  const barra = (a, b, espessura, mat = material) => {
    const p = new THREE.Vector3(...a), q = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(espessura, p.distanceTo(q), 0.06), mat);
    mesh.position.copy(p).add(q).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.sub(p).normalize());
    mesh.renderOrder = 20;
    grupo.add(mesh);
    return mesh;
  };
  barra([-1.07, 0.91, 0], [1.07, 0.91, 0], 0.09);
  barra([-1.06, 0.89, 0], [-0.9, -0.88, 0.12], 0.065);
  barra([1.06, 0.89, 0], [0.9, -0.88, 0.12], 0.065);
  // Piloto sentado à esquerda: o montante central fica à direita do eixo de mira.
  barra([0.32, 0.91, 0], [0.42, -0.88, 0.12], 0.026);
  barra([-0.93, -0.88, 0.12], [0.93, -0.88, 0.12], 0.13);
  barra([-0.94, -0.81, 0.1], [0.94, -0.81, 0.1], 0.015, borda);
  barra([-1.02, 0.85, -0.04], [1.02, 0.85, -0.04], 0.014, borda);
  camera.add(grupo);
  return grupo;
}

/** Ajusta à janela útil acima dos instrumentos sem tapar o ponto de fuga. */
export function actualizarMolduraCockpit(grupo, camera, visible) {
  grupo.visible = visible;
  if (!visible) return;
  const offset = camera.view?.enabled ? camera.view.offsetY / camera.view.fullHeight : 0;
  const alto = 2 * Math.tan(camera.fov * Math.PI / 360);
  const panel = Math.min(0.58, Math.max(0, offset / 0.4));
  const alturaUtil = 1 - panel;
  grupo.position.set(0, alto * (panel - 2 * offset), -2);
  grupo.scale.set(alto * camera.aspect, alto * alturaUtil, 1);
}
