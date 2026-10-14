import * as THREE from 'three';

/** Moldura 3D presa à câmara; sete peças simples, sem vidro/transparências. */
export function criarMolduraCockpit(camera) {
  const grupo = new THREE.Group();
  grupo.name = 'cockpit-windshield-frame';
  grupo.visible = false;
  const material = new THREE.MeshBasicMaterial({ color: 0x1b252a, depthTest: false, depthWrite: false, fog: false });
  const coaming = new THREE.MeshBasicMaterial({ color: 0x131a1f, depthTest: false, depthWrite: false, fog: false });
  const borda = new THREE.MeshBasicMaterial({ color: 0x5c6d75, depthTest: false, depthWrite: false, fog: false });
  const rebite = new THREE.MeshBasicMaterial({ color: 0x7b8c94, depthTest: false, depthWrite: false, fog: false });
  const ambar = new THREE.MeshBasicMaterial({ color: 0xe6b46c, depthTest: false, depthWrite: false, fog: false });
  const barra = (a, b, espessura, mat = material, profundidade = 0.06) => {
    const p = new THREE.Vector3(...a), q = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(espessura, p.distanceTo(q), profundidade), mat);
    mesh.position.copy(p).add(q).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.sub(p).normalize());
    mesh.renderOrder = 20;
    grupo.add(mesh);
    return mesh;
  };
  // Viga superior e cantos chanfrados do pára-brisas.
  barra([-1.08, 0.91, 0], [1.08, 0.91, 0], 0.095);
  barra([-1.06, 0.89, 0], [-0.88, 0.73, 0.02], 0.048);
  barra([1.06, 0.89, 0], [0.88, 0.73, 0.02], 0.048);
  // Montantes laterais e frisos internos iluminados pelo céu.
  barra([-1.06, 0.89, 0], [-0.9, -0.88, 0.12], 0.068);
  barra([-1.02, 0.86, -0.02], [-0.87, -0.82, 0.1], 0.011, borda);
  barra([1.06, 0.89, 0], [0.9, -0.88, 0.12], 0.068);
  barra([1.02, 0.86, -0.02], [0.87, -0.82, 0.1], 0.011, borda);
  // Piloto sentado à esquerda: o montante central fica à direita do eixo de mira.
  barra([0.32, 0.91, 0], [0.42, -0.88, 0.12], 0.028);
  barra([0.305, 0.86, -0.02], [0.405, -0.82, 0.1], 0.007, borda);
  // Pala anti-reflexo (glareshield) com aba chanfrada sobre o painel.
  barra([-0.95, -0.88, 0.12], [0.95, -0.88, 0.12], 0.135, coaming, 0.09);
  barra([-0.94, -0.81, 0.1], [0.94, -0.81, 0.1], 0.016, borda);
  barra([-1.02, 0.85, -0.04], [1.02, 0.85, -0.04], 0.014, borda);
  // Bússola de reserva no montante central e pega superior.
  barra([0.335, 0.64, -0.03], [0.335, 0.54, -0.03], 0.072, coaming, 0.07);
  barra([0.31, 0.59, -0.05], [0.36, 0.59, -0.05], 0.012, ambar, 0.02);
  for (const y of [-0.55, -0.15, 0.25, 0.65]) {
    barra([-0.97 - y * 0.08, y, 0.04], [-0.97 - y * 0.08, y + 0.014, 0.04], 0.014, rebite, 0.02);
    barra([0.97 + y * 0.08, y, 0.04], [0.97 + y * 0.08, y + 0.014, 0.04], 0.014, rebite, 0.02);
  }
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
