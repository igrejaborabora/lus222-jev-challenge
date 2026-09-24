import * as THREE from 'three';
import { pontoMundo } from './escala.js';

/**
 * Marcas da missão no mundo 3D: portais de rota até ao destino activo (cor
 * pela reserva de combustível), um alfinete por destino (poste e etiqueta com
 * a distância) e a seta da manobra escolhida à frente do nariz. Tudo vive num
 * grupo em coordenadas ABSOLUTAS; a origem flutuante só desloca o grupo.
 */

// Portais: presos ao destino, um a cada ESPACO_PORTAIS_M; o avião passa por eles.
const ESPACO_PORTAIS_M = 1500;
// O mais próximo desvanece entre estas distâncias e some antes do nariz.
const PORTAL_SOME_M = 800;
const PORTAL_PLENO_M = 1400;
// Sem nevoeiro (o branco sobre o nevoeiro claro não se lia): o próprio portal
// desvanece nestes últimos metros antes do far do nevoeiro, onde o mundo acaba
// (no máximo 30 % do far, para ainda se ver algum com 3 km de visibilidade).
const ORLA_NEVOEIRO_M = 1500;
const ORLA_FRACCAO = 0.3;
const MAX_PORTAIS = 8;
// Vistos a 1,4–5,7 km da câmara de cauda, 60 × 36 m davam quadrados de 20–45 px
// escondidos pela etiqueta; 100 × 60 m (≈ 4,6 envergaduras) lêem-se como túnel.
const LARGURA_PORTAL_M = 100;
const ALTURA_PORTAL_M = 60;
// A 1,2 m a barra fica abaixo de um píxel a mais de 1 km; 4 m ainda se lê a 4 km.
const BARRA_M = 4;
// Contorno escuro à volta das barras: o branco lê-se também no céu claro.
const CONTORNO_M = 1.5;
const CINZA_CONTORNO = 0.04;
const OPACIDADE_PORTAL = 0.9;
const COR_RESERVA = { ok: 0xf4f6f8, curta: 0xf2a23a, insuficiente: 0xd8483f };

const COR_ACTIVO = 0xf2a23a;
const COR_INACTIVO = 0xf4f6f8;
const ALTURA_POSTE_M = 420;
const RAIO_POSTE_M = 3;
// Etiquetas de destinos longe ficam nesta direcção, a esta distância: dentro
// do far da câmara (30 km), sem nevoeiro, sempre no horizonte certo.
const ETIQUETA_MAX_M = 12000;
// Tamanho da etiqueta em píxeis CSS (desenhada a 2× ou 3×, conforme o ecrã).
const ETIQUETA_PX = { largura: 176, altura: 42 };
// O bico fica ~12 px acima do ponto: o túnel dos portais converge ali por baixo.
const FOLGA_ETIQUETA = -0.3;
const ECRA_ESTREITO_PX = 520;
const ESCALA_ESTREITO = 0.82;

const SETA_FRENTE_M = 55;
const SETA_LADO_M = 10;
const SETA_ALTURA_M = 5;
const COR_SETA = { jev: 0xf4f6f8, supervisor: 0xd8483f, pic: 0xd8483f };

const EIXO_Y = new THREE.Vector3(0, 1, 0);
const UM = new THREE.Vector3(1, 1, 1);
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

const limitar01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Junta caixas/cilindros numa só geometria (só posições: o material é Basic).
 * Com `cinzas`, cada parte leva essa cor de vértice (multiplica a do material).
 */
function fundir(geometrias, cinzas = null) {
  const partes = geometrias.map((g) => g.toNonIndexed());
  const total = partes.reduce((n, g) => n + g.attributes.position.array.length, 0);
  const pos = new Float32Array(total);
  const cor = cinzas ? new Float32Array(total) : null;
  let o = 0;
  partes.forEach((g, i) => {
    const a = g.attributes.position.array;
    pos.set(a, o);
    cor?.fill(cinzas[i], o, o + a.length);
    o += a.length;
  });
  for (const g of [...partes, ...geometrias]) g.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (cor) geo.setAttribute('color', new THREE.BufferAttribute(cor, 3));
  return geo;
}

/** Quatro barras de uma moldura w × h (espessura t, fundura 1 m) em z. */
function barras(w, h, t, z) {
  return [
    new THREE.BoxGeometry(w, t, 1).translate(0, (h - t) / 2, z),
    new THREE.BoxGeometry(w, t, 1).translate(0, -(h - t) / 2, z),
    new THREE.BoxGeometry(t, h - 2 * t, 1).translate((w - t) / 2, 0, z),
    new THREE.BoxGeometry(t, h - 2 * t, 1).translate(-(w - t) / 2, 0, z),
  ];
}

/**
 * Moldura no plano XY (normal em +Z, para o destino): o eixo da rota
 * atravessa-a. O contorno escuro fica atrás e é desenhado primeiro; o núcleo,
 * na cor da reserva, à frente (−Z, do lado do avião).
 */
function geometriaPortal() {
  const c = CONTORNO_M;
  const contorno = barras(LARGURA_PORTAL_M + 2 * c, ALTURA_PORTAL_M + 2 * c, BARRA_M + 2 * c, 0.6);
  const nucleo = barras(LARGURA_PORTAL_M, ALTURA_PORTAL_M, BARRA_M, -0.6);
  return fundir([...contorno, ...nucleo], [...contorno.map(() => CINZA_CONTORNO), ...nucleo.map(() => 1)]);
}

/** Basic com opacidade por instância (atributo `opacidade`). */
function materialPortais() {
  const m = new THREE.MeshBasicMaterial({
    color: COR_RESERVA.ok, vertexColors: true, transparent: true, opacity: OPACIDADE_PORTAL, depthWrite: false, fog: false,
  });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float opacidade;\nvarying float vOpacidade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOpacidade = opacidade;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vOpacidade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vOpacidade;');
  };
  return m;
}

function criarPortais() {
  const geo = geometriaPortal();
  const opacidade = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PORTAIS), 1);
  opacidade.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('opacidade', opacidade);
  const portais = new THREE.InstancedMesh(geo, materialPortais(), MAX_PORTAIS);
  portais.name = 'portais-rota';
  portais.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // As instâncias mudam a cada frame: a esfera envolvente calculada uma vez ficava errada.
  portais.frustumCulled = false;
  portais.count = 0;
  return portais;
}

function materialPoste(cor, opacity) {
  return new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity, depthWrite: false });
}

function criarEtiqueta(nome) {
  const res = Math.min(3, Math.max(2, Math.ceil(globalThis.devicePixelRatio || 1)));
  const canvas = document.createElement('canvas');
  canvas.width = ETIQUETA_PX.largura * res;
  canvas.height = ETIQUETA_PX.altura * res;
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textura, sizeAttenuation: false, fog: false, depthTest: false, depthWrite: false, transparent: true,
  }));
  // Âncora em baixo ao centro, um pouco abaixo do bico: aponta o topo do poste
  // sem tapar o fundo do túnel de portais.
  sprite.center.set(0.5, FOLGA_ETIQUETA);
  sprite.renderOrder = 20;
  sprite.name = `etiqueta-${nome}`;
  return { sprite, canvas, ctx: canvas.getContext('2d'), res, textura, nome, km: undefined, activo: undefined };
}

function criarAlfinete(destino, nome, geoPoste, material) {
  const base = pontoMundo(destino.xM, destino.zM);
  const poste = new THREE.Mesh(geoPoste, material);
  poste.position.set(base.x, ALTURA_POSTE_M / 2, base.z);
  poste.name = `poste-${destino.id}`;
  return { id: destino.id, base, poste, etiqueta: criarEtiqueta(nome), activo: false };
}

/** Seta ao longo de +Y, centrada na origem: haste e ponta numa só geometria. */
function criarSeta() {
  const geo = fundir([
    new THREE.CylinderGeometry(0.5, 0.5, 4.5, 10).translate(0, -1.5, 0),
    new THREE.ConeGeometry(1.7, 3, 14).translate(0, 2.25, 0),
  ]);
  const seta = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: COR_SETA.jev, transparent: true, depthTest: false, depthWrite: false, fog: false,
  }));
  seta.name = 'seta-manobra';
  seta.renderOrder = 30;
  seta.visible = false;
  return seta;
}

/** Pede as fontes da interface; quando chegam, as etiquetas redesenham-se. */
function carregarFontes(alfinetes) {
  const fontes = globalThis.document?.fonts;
  if (!fontes?.load) return;
  Promise.all([fontes.load('600 13px "DM Sans"'), fontes.load('500 11px "IBM Plex Mono"')])
    .then(() => { for (const a of alfinetes) a.etiqueta.km = undefined; })
    .catch(() => { /* fica a letra de recurso */ });
}

/**
 * Cria as marcas para `destinos` (id, xM, zM) com os nomes de `nomes[id]`.
 * O grupo fica na cena; largarCena liberta-o com o resto.
 */
export function criarMarcas(scene, destinos, nomes = {}) {
  const grupo = new THREE.Group();
  grupo.name = 'marcas-missao';
  const materiais = { activo: materialPoste(COR_ACTIVO, 0.9), inactivo: materialPoste(COR_INACTIVO, 0.45) };
  const geoPoste = new THREE.CylinderGeometry(RAIO_POSTE_M, RAIO_POSTE_M, ALTURA_POSTE_M, 8, 1, true);
  const alfinetes = destinos.map((d) => criarAlfinete(d, nomes[d.id] ?? d.id, geoPoste, materiais.inactivo));
  const portais = criarPortais();
  const seta = criarSeta();
  grupo.add(portais, seta);
  for (const a of alfinetes) grupo.add(a.poste, a.etiqueta.sprite);
  scene.add(grupo);
  carregarFontes(alfinetes);
  return { grupo, portais, alfinetes, seta, materiais, scene, reserva: null, autor: null };
}

/** Altitude da fita (pontos uniformes em t) na fracção t do avião ao destino. */
function alturaNaRota(pontos, t) {
  const i = Math.min(pontos.length - 2, Math.floor(t * (pontos.length - 1)));
  const f = t * (pontos.length - 1) - i;
  return pontos[i].y + (pontos[i + 1].y - pontos[i].y) * f;
}

function pintarPortais(marcas, reserva) {
  if (reserva === marcas.reserva) return;
  marcas.reserva = reserva;
  marcas.portais.material.color.setHex(COR_RESERVA[reserva] ?? COR_RESERVA.ok);
}

/** Opacidade de um portal a `s` m do avião: entra no far do nevoeiro, sai antes do nariz. */
function opacidadePortal(s, far) {
  const perto = (s - PORTAL_SOME_M) / (PORTAL_PLENO_M - PORTAL_SOME_M);
  const longe = (far - s) / Math.min(ORLA_NEVOEIRO_M, far * ORLA_FRACCAO);
  return limitar01(Math.min(perto, longe));
}

/**
 * Portais contados a partir do destino (1500 m, 3000 m, …): ficam parados no
 * mundo enquanto o avião avança. Só os que estão entre PORTAL_SOME_M e o far
 * do nevoeiro entram na malha.
 */
function actualizarPortais(marcas, pontos) {
  const portais = marcas.portais;
  portais.count = 0;
  if (!pontos || pontos.length < 2) return;
  const a = pontos[0];
  const b = pontos[pontos.length - 1];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const total = Math.hypot(dx, dz);
  const far = marcas.scene.fog?.far ?? 6000;
  const primeiro = Math.max(1, Math.ceil((total - far) / ESPACO_PORTAIS_M));
  const ultimo = Math.floor((total - PORTAL_SOME_M) / ESPACO_PORTAIS_M);
  _q.setFromAxisAngle(EIXO_Y, Math.atan2(dx, dz));
  const opacidade = portais.geometry.attributes.opacidade;
  let k = 0;
  for (let j = ultimo; j >= primeiro && k < MAX_PORTAIS; j--) {
    const s = total - j * ESPACO_PORTAIS_M;
    const t = s / total;
    _v.set(a.x + dx * t, alturaNaRota(pontos, t), a.z + dz * t);
    portais.setMatrixAt(k, _m4.compose(_v, _q, UM));
    opacidade.array[k] = opacidadePortal(s, far);
    k++;
  }
  portais.count = k;
  portais.instanceMatrix.needsUpdate = true;
  opacidade.needsUpdate = true;
}

/** Nome na primeira linha, «N km» na segunda; pílula âmbar no destino activo. */
function desenharEtiqueta(e, km, activo) {
  if (e.km === km && e.activo === activo) return;
  e.km = km;
  e.activo = activo;
  const { ctx, canvas } = e;
  const r = e.res;
  const distancia = Number.isFinite(km) ? `${km} km` : '— km';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 ${13 * r}px "DM Sans", system-ui, sans-serif`;
  const larguraNome = ctx.measureText(e.nome).width;
  ctx.font = `500 ${11 * r}px "IBM Plex Mono", ui-monospace, monospace`;
  const larguraKm = ctx.measureText(distancia).width;
  const bico = 6 * r;
  const alto = canvas.height - bico;
  const largo = Math.min(canvas.width - 2 * r, Math.max(larguraNome, larguraKm) + 20 * r);
  const x0 = (canvas.width - largo) / 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0, r, largo, alto - 2 * r, 6 * r);
  else ctx.rect(x0, r, largo, alto - 2 * r);
  ctx.moveTo(canvas.width / 2 - bico * 0.8, alto - r);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.lineTo(canvas.width / 2 + bico * 0.8, alto - r);
  ctx.fillStyle = activo ? '#f2a23a' : 'rgba(12, 15, 19, 0.8)';
  ctx.fill();
  if (!activo) {
    ctx.strokeStyle = 'rgba(244, 246, 248, 0.32)';
    ctx.lineWidth = r;
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = activo ? '#16110a' : '#f4f6f8';
  ctx.font = `600 ${13 * r}px "DM Sans", system-ui, sans-serif`;
  ctx.fillText(e.nome, canvas.width / 2, 17 * r, largo - 12 * r);
  ctx.fillStyle = activo ? 'rgba(22, 17, 10, 0.78)' : '#cbd2d8';
  ctx.font = `500 ${11 * r}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.fillText(distancia, canvas.width / 2, 30 * r);
  e.textura.needsUpdate = true;
}

/**
 * Unidades de escala do sprite por píxel CSS: com sizeAttenuation false, a
 * altura no ecrã é escala × P[1][1] × altura/2.
 */
function escalaPorPixel(ecra) {
  const p11 = ecra?.camera?.projectionMatrix.elements[5] || 2.246;
  const altura = ecra?.alturaPx || 800;
  const factor = (ecra?.larguraPx ?? Infinity) < ECRA_ESTREITO_PX ? ESCALA_ESTREITO : 1;
  return (2 * factor) / (p11 * altura);
}

/** No topo do poste; se o destino está longe, na mesma direcção a ETIQUETA_MAX_M. */
function posicionarEtiqueta(a, pose) {
  const dx = a.base.x - pose.x;
  const dy = ALTURA_POSTE_M - pose.y;
  const dz = a.base.z - pose.z;
  const d = Math.hypot(dx, dy, dz);
  const k = d > ETIQUETA_MAX_M ? ETIQUETA_MAX_M / d : 1;
  a.etiqueta.sprite.position.set(pose.x + dx * k, pose.y + dy * k, pose.z + dz * k);
}

function actualizarAlfinetes(marcas, m) {
  const escala = escalaPorPixel(m.ecra);
  for (const a of marcas.alfinetes) {
    const activo = a.id === m.destinoAtivoId;
    if (activo !== a.activo) {
      a.activo = activo;
      a.poste.material = activo ? marcas.materiais.activo : marcas.materiais.inactivo;
    }
    // null (não NaN) sem distância: NaN !== NaN redesenharia a etiqueta a cada frame.
    const km = m.distanciasKm?.[a.id];
    desenharEtiqueta(a.etiqueta, Number.isFinite(km) ? Math.round(km) : null, activo);
    posicionarEtiqueta(a, m.pose);
    a.etiqueta.sprite.scale.set(ETIQUETA_PX.largura * escala, ETIQUETA_PX.altura * escala, 1);
  }
}

/**
 * Seta à frente do nariz, deslocada para o lado da manobra. Eixos do piloto:
 * frente (sin h, cos h) e direita (−cos h, sin h) em (x, z) — ver escala.js.
 */
function actualizarSeta(marcas, { seta: sentido, autor, pose }) {
  const seta = marcas.seta;
  seta.visible = Boolean(sentido);
  if (!sentido) return;
  const fx = Math.sin(pose.heading);
  const fz = Math.cos(pose.heading);
  const rx = -fz;
  const rz = fx;
  _v.set(rx * sentido.lateral, sentido.vertical, rz * sentido.lateral).normalize();
  seta.quaternion.setFromUnitVectors(EIXO_Y, _v);
  seta.position.set(
    pose.x + fx * SETA_FRENTE_M + rx * sentido.lateral * SETA_LADO_M,
    pose.y + sentido.vertical * SETA_ALTURA_M,
    pose.z + fz * SETA_FRENTE_M + rz * sentido.lateral * SETA_LADO_M,
  );
  if (autor !== marcas.autor) {
    marcas.autor = autor;
    seta.material.color.setHex(COR_SETA[autor] ?? COR_SETA.jev);
  }
}

/**
 * Por frame, depois do céu (usa o far do nevoeiro deste frame). `m` = {
 * origem, pose (absoluta, com heading), pontosRota, destinoAtivoId,
 * distanciasKm {id: km}, reserva 'ok'|'curta'|'insuficiente',
 * seta {lateral, vertical}|null, autor 'jev'|'supervisor'|'pic', ecra }.
 */
export function actualizarMarcas(marcas, m) {
  marcas.grupo.position.set(-m.origem.x, 0, -m.origem.z);
  pintarPortais(marcas, m.reserva);
  actualizarPortais(marcas, m.pontosRota);
  actualizarAlfinetes(marcas, m);
  actualizarSeta(marcas, m);
}
