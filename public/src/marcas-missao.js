import * as THREE from 'three';
import { pontoMundo } from './escala.js';

/**
 * Marcas da missão no mundo 3D: portais de rota até ao destino activo (cor
 * pela reserva de combustível), um alfinete por destino (poste e etiqueta com
 * a distância), a seta da manobra escolhida à frente do nariz e uma etiqueta
 * com a distância em cada ameaça activa. Rota, destinos e seta vivem num grupo
 * em coordenadas ABSOLUTAS (a origem flutuante só desloca o grupo); as marcas
 * das ameaças seguem as malhas de `mundo.ameaças`, em coordenadas LOCAIS.
 *
 * Cores: branco = rota e destino activo; escuro = destinos inactivos; âmbar =
 * atenção (ameaças, reserva curta); vermelho = conflito (reserva insuficiente,
 * manobra corrigida pelo supervisor ou pelo PIC).
 */

// Portais: presos ao destino, um a cada ESPACO_PORTAIS_M; o avião passa por
// eles. A 1500 m só se via um quadrado debaixo da etiqueta; a 600 m lê-se o túnel.
const ESPACO_PORTAIS_M = 600;
// O mais próximo desvanece entre estas distâncias e some antes do nariz.
const PORTAL_SOME_M = 600;
const PORTAL_PLENO_M = 1000;
// Sem nevoeiro (o branco sobre o nevoeiro claro não se lia): o próprio portal
// desvanece nestes últimos metros antes do far do nevoeiro, onde o mundo acaba
// (no máximo 30 % do far, para ainda se ver algum com 3 km de visibilidade).
const ORLA_NEVOEIRO_M = 1500;
const ORLA_FRACCAO = 0.3;
const MAX_PORTAIS = 10;
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

// Poste do destino activo branco e firme; os inactivos em cinza, esbatidos.
const POSTE = { activo: { cor: 0xf4f6f8, opacidade: 0.9 }, inactivo: { cor: 0xa8b1ba, opacidade: 0.3 } };
// Pílulas das etiquetas: activo invertido (branco), inactivo escuro, ameaça âmbar.
const ESTILO_ETIQUETA = {
  activo: { fundo: '#f4f6f8', contorno: null, nome: '#0d1116', linha: 'rgba(13, 17, 22, 0.72)' },
  inactivo: { fundo: 'rgba(12, 15, 19, 0.8)', contorno: 'rgba(244, 246, 248, 0.32)', nome: '#f4f6f8', linha: '#cbd2d8' },
  atencao: { fundo: '#f2a23a', contorno: null, nome: '#16110a', linha: 'rgba(22, 17, 10, 0.78)' },
};
const ALTURA_POSTE_M = 420;
const RAIO_POSTE_M = 3;
// Etiquetas de destinos longe ficam nesta direcção, a esta distância: dentro
// do far da câmara (30 km), sem nevoeiro, sempre no horizonte certo.
const ETIQUETA_MAX_M = 12000;
// Tamanho da etiqueta em píxeis CSS (desenhada a 2× ou 3×, conforme o ecrã).
const ETIQUETA_PX = { largura: 176, altura: 42 };
// Folga entre o ponto e o bico, em alturas de etiqueta: no destino ~31 px, para
// o túnel dos portais (até ~1 km) passar por baixo; na ameaça ~12 px acima do anel.
const FOLGA_DESTINO = -0.75;
const FOLGA_AMEACA = -0.3;
const ECRA_ESTREITO_PX = 520;
const ESCALA_ESTREITO = 0.82;

const SETA_FRENTE_M = 55;
const SETA_LADO_M = 10;
const SETA_ALTURA_M = 5;
const COR_SETA = { jev: 0xf4f6f8, supervisor: 0xd8483f, pic: 0xd8483f };

const NOME_BALOES = 'Balões de São João';
// Ameaça mais de 60 m atrás do avião: passou, a marca sai.
const AMEACA_PASSADA_M = 60;
// Ameaça no chão (relevo) centenas de metros abaixo: a etiqueta sobe na mesma
// vertical até esta distância abaixo do avião, senão ficava fora da câmara de cauda.
const ETIQUETA_ABAIXO_MAX_M = 40;
// Com uma ameaça etiquetada, as etiquetas dos destinos recuam para não lhe disputar a leitura.
const OPACIDADE_DESTINOS_COM_AMEACA = 0.35;
const COR_ANEL = 0xf2a23a;
const ESPESSURA_ANEL_M = 1.2;

const EIXO_Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _caixa = new THREE.Box3();

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

/**
 * MAX_PORTAIS malhas com a mesma geometria e um material cada: a opacidade de
 * cada portal é a do seu material (sem remendar os shaders do three). Custa
 * uma chamada de desenho por portal visível; largarCena liberta os materiais
 * e a geometria partilhada ao percorrer a cena.
 */
function criarPortais() {
  const geo = geometriaPortal();
  const portais = new THREE.Group();
  portais.name = 'portais-rota';
  for (let i = 0; i < MAX_PORTAIS; i++) {
    const portal = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: COR_RESERVA.ok, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false,
    }));
    portal.name = `portal-${i}`;
    portal.visible = false;
    portais.add(portal);
  }
  return portais;
}

function materialPoste({ cor, opacidade }) {
  return new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: opacidade, depthWrite: false });
}

function criarEtiqueta(nome, { folga = FOLGA_DESTINO, ordem = 20 } = {}) {
  const res = Math.min(3, Math.max(2, Math.ceil(globalThis.devicePixelRatio || 1)));
  const canvas = document.createElement('canvas');
  canvas.width = ETIQUETA_PX.largura * res;
  canvas.height = ETIQUETA_PX.altura * res;
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textura, sizeAttenuation: false, fog: false, depthTest: false, depthWrite: false, transparent: true,
  }));
  // Âncora em baixo ao centro, abaixo do bico: aponta o topo do poste (ou da
  // ameaça) sem tapar o túnel de portais.
  sprite.center.set(0.5, folga);
  sprite.renderOrder = ordem;
  sprite.name = `etiqueta-${nome}`;
  return { sprite, canvas, ctx: canvas.getContext('2d'), res, textura, nome, linha: undefined, estilo: undefined };
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
    .then(() => { for (const a of alfinetes) a.etiqueta.linha = undefined; })
    .catch(() => { /* fica a letra de recurso */ });
}

/**
 * Cria as marcas para `destinos` (id, xM, zM) com os nomes de `nomes[id]`.
 * O grupo fica na cena; largarCena liberta-o com o resto.
 */
export function criarMarcas(scene, destinos, nomes = {}) {
  const grupo = new THREE.Group();
  grupo.name = 'marcas-missao';
  const materiais = { activo: materialPoste(POSTE.activo), inactivo: materialPoste(POSTE.inactivo) };
  const geoPoste = new THREE.CylinderGeometry(RAIO_POSTE_M, RAIO_POSTE_M, ALTURA_POSTE_M, 8, 1, true);
  const alfinetes = destinos.map((d) => criarAlfinete(d, nomes[d.id] ?? d.id, geoPoste, materiais.inactivo));
  const portais = criarPortais();
  const seta = criarSeta();
  grupo.add(portais, seta);
  for (const a of alfinetes) grupo.add(a.poste, a.etiqueta.sprite);
  // Marcas das ameaças: coordenadas locais, como as malhas que seguem.
  const grupoAmeacas = new THREE.Group();
  grupoAmeacas.name = 'marcas-ameacas';
  scene.add(grupo, grupoAmeacas);
  carregarFontes(alfinetes);
  return { grupo, grupoAmeacas, ameacas: new Map(), portais, alfinetes, seta, materiais, scene, reserva: null, autor: null };
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
  const cor = COR_RESERVA[reserva] ?? COR_RESERVA.ok;
  for (const portal of marcas.portais.children) portal.material.color.setHex(cor);
}

/** Presença (0–1) de um portal a `s` m do avião: entra no far do nevoeiro, sai antes do nariz. */
function presencaPortal(s, far) {
  const perto = (s - PORTAL_SOME_M) / (PORTAL_PLENO_M - PORTAL_SOME_M);
  const longe = (far - s) / Math.min(ORLA_NEVOEIRO_M, far * ORLA_FRACCAO);
  return limitar01(Math.min(perto, longe));
}

/**
 * Portais contados a partir do destino (600 m, 1200 m, …): ficam parados no
 * mundo enquanto o avião avança. Só os que estão entre PORTAL_SOME_M e o far
 * do nevoeiro ficam visíveis, cada um com a opacidade da sua presença.
 */
function actualizarPortais(marcas, pontos) {
  const portais = marcas.portais.children;
  let k = 0;
  if (pontos && pontos.length >= 2) k = colocarPortais(portais, pontos, marcas.scene.fog?.far ?? 6000);
  for (let i = k; i < portais.length; i++) portais[i].visible = false;
}

/** Posiciona os portais à vista em `portais`; devolve quantos usou. */
function colocarPortais(portais, pontos, far) {
  const a = pontos[0];
  const b = pontos[pontos.length - 1];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const total = Math.hypot(dx, dz);
  const primeiro = Math.max(1, Math.ceil((total - far) / ESPACO_PORTAIS_M));
  const ultimo = Math.floor((total - PORTAL_SOME_M) / ESPACO_PORTAIS_M);
  _q.setFromAxisAngle(EIXO_Y, Math.atan2(dx, dz));
  let k = 0;
  for (let j = ultimo; j >= primeiro && k < portais.length; j--) {
    const s = total - j * ESPACO_PORTAIS_M;
    const presenca = presencaPortal(s, far);
    if (presenca <= 0) continue;
    const t = s / total;
    const portal = portais[k++];
    portal.position.set(a.x + dx * t, alturaNaRota(pontos, t), a.z + dz * t);
    portal.quaternion.copy(_q);
    portal.material.opacity = OPACIDADE_PORTAL * presenca;
    portal.visible = true;
  }
  return k;
}

/**
 * Nome na primeira linha, a distância (`linha`) na segunda, no estilo de
 * ESTILO_ETIQUETA. Só redesenha quando o texto ou o estilo mudam.
 */
function desenharEtiqueta(e, linha, estilo) {
  if (e.linha === linha && e.estilo === estilo) return;
  e.linha = linha;
  e.estilo = estilo;
  const { ctx, canvas } = e;
  const r = e.res;
  const cores = ESTILO_ETIQUETA[estilo];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 ${13 * r}px "DM Sans", system-ui, sans-serif`;
  const larguraNome = ctx.measureText(e.nome).width;
  ctx.font = `500 ${11 * r}px "IBM Plex Mono", ui-monospace, monospace`;
  const larguraKm = ctx.measureText(linha).width;
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
  ctx.fillStyle = cores.fundo;
  ctx.fill();
  if (cores.contorno) {
    ctx.strokeStyle = cores.contorno;
    ctx.lineWidth = r;
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = cores.nome;
  ctx.font = `600 ${13 * r}px "DM Sans", system-ui, sans-serif`;
  ctx.fillText(e.nome, canvas.width / 2, 17 * r, largo - 12 * r);
  ctx.fillStyle = cores.linha;
  ctx.font = `500 ${11 * r}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.fillText(linha, canvas.width / 2, 30 * r);
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

function actualizarAlfinetes(marcas, m, comAmeaca) {
  const escala = escalaPorPixel(m.ecra);
  const opacidade = comAmeaca ? OPACIDADE_DESTINOS_COM_AMEACA : 1;
  for (const a of marcas.alfinetes) {
    const activo = a.id === m.destinoAtivoId;
    if (activo !== a.activo) {
      a.activo = activo;
      a.poste.material = activo ? marcas.materiais.activo : marcas.materiais.inactivo;
    }
    const km = m.distanciasKm?.[a.id];
    desenharEtiqueta(a.etiqueta, Number.isFinite(km) ? `${Math.round(km)} km` : '— km', activo ? 'activo' : 'inactivo');
    posicionarEtiqueta(a, m.pose);
    a.etiqueta.sprite.scale.set(ETIQUETA_PX.largura * escala, ETIQUETA_PX.altura * escala, 1);
    a.etiqueta.sprite.material.opacity = opacidade;
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

function nomeAmeaca(obj) {
  if (obj.userData.baloes) return NOME_BALOES;
  const tipo = String(obj.userData.tipo ?? obj.userData.visual ?? 'ameaça');
  return tipo.charAt(0).toUpperCase() + tipo.slice(1);
}

/** Anel do raio de protecção, virado para a câmara a cada frame. */
function criarAnel(raioM) {
  const anel = new THREE.Mesh(
    new THREE.RingGeometry(raioM - ESPESSURA_ANEL_M / 2, raioM + ESPESSURA_ANEL_M / 2, 64),
    new THREE.MeshBasicMaterial({ color: COR_ANEL, transparent: true, opacity: 0.75, depthWrite: false, fog: false, side: THREE.DoubleSide }),
  );
  anel.name = 'anel-protecao';
  anel.renderOrder = 19;
  return anel;
}

/**
 * Uma vez por ameaça: centro e topo da malha em relação à sua posição (a
 * malha pode andar, como o tráfego, ou ser reposta, como os balões).
 */
function criarMarcaAmeaca(marcas, obj, raioM) {
  obj.updateMatrixWorld(true);
  _caixa.setFromObject(obj);
  const centro = _caixa.getCenter(new THREE.Vector3()).sub(obj.position);
  const topo = Math.max(_caixa.max.y - obj.position.y, centro.y + (raioM ?? 0));
  // Por cima das etiquetas dos destinos: a ameaça tem prioridade de leitura.
  const etiqueta = criarEtiqueta(nomeAmeaca(obj), { folga: FOLGA_AMEACA, ordem: 22 });
  const anel = raioM ? criarAnel(raioM) : null;
  marcas.grupoAmeacas.add(etiqueta.sprite);
  if (anel) marcas.grupoAmeacas.add(anel);
  return { etiqueta, anel, centro, topo, libertada: false };
}

function largarMarcaAmeaca(marcas, a) {
  if (a.libertada) return;
  a.libertada = true;
  marcas.grupoAmeacas.remove(a.etiqueta.sprite);
  a.etiqueta.textura.dispose();
  a.etiqueta.sprite.material.dispose();
  if (a.anel) {
    marcas.grupoAmeacas.remove(a.anel);
    a.anel.geometry.dispose();
    a.anel.material.dispose();
  }
}

/** Posiciona etiqueta e anel; devolve false quando o avião já passou a ameaça. */
function posicionarMarcaAmeaca(a, obj, pose, escala, camera) {
  const cx = obj.position.x + a.centro.x;
  const cz = obj.position.z + a.centro.z;
  const dx = cx - pose.x;
  const dz = cz - pose.z;
  if (dx * Math.sin(pose.heading) + dz * Math.cos(pose.heading) < -AMEACA_PASSADA_M) return false;
  // Distância horizontal, como o distancia_m do evento; arredondada a 10 m.
  desenharEtiqueta(a.etiqueta, `${Math.round(Math.hypot(dx, dz) / 10) * 10} m`, 'atencao');
  a.etiqueta.sprite.position.set(cx, Math.max(obj.position.y + a.topo, pose.y - ETIQUETA_ABAIXO_MAX_M), cz);
  a.etiqueta.sprite.scale.set(ETIQUETA_PX.largura * escala, ETIQUETA_PX.altura * escala, 1);
  if (a.anel) {
    a.anel.position.set(cx, obj.position.y + a.centro.y, cz);
    if (camera) a.anel.quaternion.copy(camera.quaternion);
  }
  return true;
}

/**
 * Etiqueta «tipo / N m» (e anel de protecção, se houver raio) em cada malha de
 * `ameacas` (mundo.ameaças). Sai quando a malha sai do grupo (ameaça largada)
 * ou quando o avião a passa. Devolve se ficou alguma etiqueta à vista.
 */
function actualizarMarcasAmeacas(marcas, { ameacas, poseLocal, raioBaloesM, ecra }) {
  for (const [obj, a] of marcas.ameacas) {
    if (obj.parent === ameacas) continue;
    largarMarcaAmeaca(marcas, a);
    marcas.ameacas.delete(obj);
  }
  if (!ameacas || !poseLocal) return false;
  const escala = escalaPorPixel(ecra);
  let vistas = 0;
  for (const obj of ameacas.children) {
    let a = marcas.ameacas.get(obj);
    if (!a) {
      a = criarMarcaAmeaca(marcas, obj, obj.userData.baloes ? raioBaloesM : null);
      marcas.ameacas.set(obj, a);
    }
    if (a.libertada) continue;
    if (posicionarMarcaAmeaca(a, obj, poseLocal, escala, ecra?.camera)) vistas++;
    else largarMarcaAmeaca(marcas, a);
  }
  return vistas > 0;
}

/**
 * Por frame, depois do céu (usa o far do nevoeiro deste frame). `m` = {
 * origem, pose (absoluta, com heading), poseLocal, pontosRota, destinoAtivoId,
 * distanciasKm {id: km}, reserva 'ok'|'curta'|'insuficiente',
 * seta {lateral, vertical}|null, autor 'jev'|'supervisor'|'pic',
 * ameacas (mundo.ameaças), raioBaloesM, ecra }.
 */
export function actualizarMarcas(marcas, m) {
  marcas.grupo.position.set(-m.origem.x, 0, -m.origem.z);
  pintarPortais(marcas, m.reserva);
  actualizarPortais(marcas, m.pontosRota);
  const comAmeaca = actualizarMarcasAmeacas(marcas, m);
  actualizarAlfinetes(marcas, m, comAmeaca);
  actualizarSeta(marcas, m);
}
