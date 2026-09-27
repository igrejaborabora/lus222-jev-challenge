const finiteRect = r => r && [r.left, r.top, r.width, r.height].every(Number.isFinite) && r.width > 1 && r.height > 1;
const clamp = (value, lo, hi, fallback = lo) => Number.isFinite(value) ? Math.max(lo, Math.min(hi, value)) : fallback;

/** CSS pixels → orthographic shell coordinates; hidden tabs have no geometry. */
export function medirCockpitShell(host) {
  const bounds = host.getBoundingClientRect();
  if (!finiteRect(bounds)) return null;
  const visible = rect => finiteRect(rect) && rect.left < bounds.left + bounds.width && rect.left + rect.width > bounds.left
    && rect.top < bounds.top + bounds.height && rect.top + rect.height > bounds.top;
  const centre = rect => ({ x: rect.left - bounds.left + rect.width / 2 - bounds.width / 2,
    y: bounds.height / 2 - (rect.top - bounds.top + rect.height / 2) });
  const screens = [...host.querySelectorAll('[data-cp-screen]')].flatMap(el => {
    const r = el.getBoundingClientRect();
    return visible(r) ? [{ ...centre(r), width: r.width, height: r.height }] : [];
  });
  const knobs = [...host.querySelectorAll('[data-cp-knob]')].flatMap(el => {
    const r = el.getBoundingClientRect();
    return visible(r) ? [{ ...centre(r), radius: Math.min(r.width, r.height) / 2, type: el.dataset.cpKnob }] : [];
  });
  return { width: bounds.width, height: bounds.height, screens, knobs };
}

/** Decorative Three.js frame; DOM instruments remain authoritative and interactive. */
export async function criarCockpitShell(host) {
  if (!host?.append || !host?.querySelectorAll) throw new TypeError('A cockpit host is required.');
  const THREE = await import('three');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    throw new Error('Cockpit 3D is unavailable.');
  }
  const canvas = renderer.domElement;
  canvas.className = 'cp-shell-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '0' });
  renderer.setPixelRatio(Math.min(1.5, globalThis.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1500);
  camera.position.set(0, 0, 800);
  const fill = new THREE.HemisphereLight(0xc9ddf2, 0x171b24, 2.0);
  scene.add(fill);
  const key = new THREE.DirectionalLight(0xe4edf4, 3.0);
  key.position.set(-260, 420, 500);
  scene.add(key);
  const warm = new THREE.DirectionalLight(0xeaae65, 0.5);
  warm.position.set(340, -170, 280);
  scene.add(warm);

  const materials = {
    body: new THREE.MeshStandardMaterial({ color: 0x19212b, roughness: 0.68, metalness: 0.5 }),
    bevel: new THREE.MeshStandardMaterial({ color: 0x465361, roughness: 0.42, metalness: 0.66 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x080d14, roughness: 0.52, metalness: 0.4 }),
    face: new THREE.MeshStandardMaterial({ color: 0x303b48, roughness: 0.62, metalness: 0.48 }),
    screw: new THREE.MeshStandardMaterial({ color: 0x83919d, roughness: 0.38, metalness: 0.82 }),
    amber: new THREE.MeshBasicMaterial({ color: 0xe9b46e }),
    dark: new THREE.MeshBasicMaterial({ color: 0x05080c }),
  };
  let geometry = new THREE.Group();
  scene.add(geometry);
  let knobs = [];
  let signature = '';
  let visible = true;
  let disposed = false;
  let lost = false;
  let lastState = { power: 0.55, trim: 0, flaps: 0, brightness: 1, heading: 0.5, altitude: 0.5, vertical: 0.5 };

  function roundedPath(path, width, height, radius) {
    const x = -width / 2, y = -height / 2, r = Math.min(radius, width / 2, height / 2);
    path.moveTo(x + r, y);
    path.lineTo(x + width - r, y); path.quadraticCurveTo(x + width, y, x + width, y + r);
    path.lineTo(x + width, y + height - r); path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    path.lineTo(x + r, y + height); path.quadraticCurveTo(x, y + height, x, y + height - r);
    path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y);
    path.closePath();
    return path;
  }
  function plate(width, height, depth, radius, material, hole = null) {
    const shape = roundedPath(new THREE.Shape(), width, height, radius);
    if (hole) shape.holes.push(roundedPath(new THREE.Path(), hole.width, hole.height, Math.max(1, radius - 3)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, steps: 1,
      bevelSize: Math.min(1.4, depth / 2), bevelThickness: Math.min(1.4, depth / 2), curveSegments: 4 });
    return new THREE.Mesh(g, material);
  }
  function add(mesh, x, y, z, parent = geometry) {
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function box(width, height, depth, material) {
    return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  }
  function cylinder(radius, depth, material, segments = 20) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }
  function clearGeometry() {
    const resources = new Set();
    geometry.traverse(o => { if (o.geometry) resources.add(o.geometry); if (o.isInstancedMesh) o.dispose(); });
    for (const resource of resources) resource.dispose();
    scene.remove(geometry);
    geometry = new THREE.Group(); scene.add(geometry); knobs = [];
  }
  function rebuild(layout) {
    clearGeometry();
    const { width, height } = layout;
    const body = plate(Math.max(8, width - 4), Math.max(8, height - 4), 6, 14, materials.body);
    add(body, 0, 0, -12);
    // Small machined rails make the depth readable without covering display content.
    add(box(Math.max(4, width - 40), 1, 1, materials.bevel), 0, height / 2 - 7, -3);
    add(box(Math.max(4, width - 40), 1, 1, materials.rim), 0, -height / 2 + 7, -3);
    for (const x of [-width / 2 + 12, width / 2 - 12]) {
      for (const y of [-height / 2 + 12, height / 2 - 12]) {
        add(cylinder(2.7, 1.2, materials.screw, 12), x, y, -3);
        const slot = add(box(3.2, 0.7, 0.5, materials.dark), x, y, -2.3);
        slot.rotation.z = Math.PI / 4;
      }
    }
    for (const screen of layout.screens) {
      const { x, y, width: w, height: h } = screen;
      add(plate(w + 14, h + 14, 5, 9, materials.bevel, { width: w + 2, height: h + 2 }), x, y, -2);
      add(plate(w + 7, h + 7, 2, 6, materials.rim, { width: w, height: h }), x, y, 3);
      add(box(24, 1.2, 1, materials.amber), x - w / 2 + 17, y - h / 2 - 4, 4.5);
    }
    for (const knob of layout.knobs) {
      const r = Math.max(3, Math.min(30, knob.radius - 2));
      const dial = new THREE.Group();
      add(dial, knob.x, knob.y, 0);
      add(cylinder(r + 2, 2, materials.dark), 0, 0, 0, dial);
      add(new THREE.Mesh(new THREE.TorusGeometry(r + 1.2, 0.65, 6, 32), materials.bevel), 0, 0, 2, dial);
      const rotor = new THREE.Group();
      dial.add(rotor);
      add(cylinder(r * 0.84, 8, materials.rim, 16), 0, 0, 5, rotor);
      add(cylinder(r * 0.78, 2, materials.face, 20), 0, 0, 10, rotor);
      const ridges = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 2.5, 5), materials.bevel, 16);
      const ridge = new THREE.Object3D();
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8;
        ridge.position.set(Math.sin(angle) * r * 0.82, Math.cos(angle) * r * 0.82, 6);
        ridge.rotation.z = -angle; ridge.updateMatrix(); ridges.setMatrixAt(i, ridge.matrix);
      }
      rotor.add(ridges);
      add(box(1.6, r * 0.36, 1, materials.amber), 0, r * 0.42, 11.5, rotor);
      knobs.push({ rotor, type: knob.type });
    }
  }

  function resize() {
    if (disposed || lost) return;
    const layout = medirCockpitShell(host);
    if (!layout) return;
    const next = JSON.stringify(layout);
    if (signature === next) return;
    signature = next;
    renderer.setPixelRatio(Math.min(1.5, globalThis.devicePixelRatio || 1));
    renderer.setSize(Math.ceil(layout.width), Math.ceil(layout.height), false);
    camera.left = -layout.width / 2; camera.right = layout.width / 2;
    camera.top = layout.height / 2; camera.bottom = -layout.height / 2;
    camera.updateProjectionMatrix();
    rebuild(layout);
    render(lastState);
  }
  function render(state = {}) {
    if (disposed || lost) return;
    lastState = { ...lastState, ...state };
    if (!visible || !signature) return;
    const { power, trim, flaps, brightness, heading, altitude, vertical } = lastState;
    const values = { power: clamp(power, 0, 1, 0.55), throttle: clamp(power, 0, 1, 0.55),
      trim: (clamp(trim, -1, 1, 0) + 1) / 2, flaps: clamp(flaps, 0, 1), brightness: clamp(brightness, 0, 1, 1),
      heading: clamp(heading, 0, 1, 0.5), altitude: clamp(altitude, 0, 1, 0.5), vertical: clamp(vertical, 0, 1, 0.5) };
    for (const { rotor, type } of knobs) rotor.rotation.z = (0.5 - (values[type] ?? 0.5)) * Math.PI * 1.5;
    renderer.toneMappingExposure = 0.75 + values.brightness * 0.45;
    materials.amber.color.setRGB(0.55 + values.brightness * 0.35, 0.28 + values.brightness * 0.2, 0.1 + values.brightness * 0.08);
    renderer.render(scene, camera);
  }
  function setVisible(value) {
    if (disposed) return;
    visible = Boolean(value);
    canvas.hidden = !visible || lost;
    canvas.style.display = canvas.hidden ? 'none' : 'block';
    if (visible && !lost) { resize(); render(lastState); }
  }
  function onLost(event) { event.preventDefault(); lost = true; canvas.hidden = true; canvas.style.display = 'none'; host.dataset.shell = 'css'; }
  function onRestored() { lost = false; signature = ''; canvas.hidden = !visible; canvas.style.display = visible ? 'block' : 'none'; resize(); host.dataset.shell = '3d'; }
  function dispose() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    clearGeometry();
    for (const material of Object.values(materials)) material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  try {
    host.prepend(canvas);
    resize();
  } catch (error) {
    dispose();
    throw error;
  }
  return { resize, render, setVisible, dispose };
}
