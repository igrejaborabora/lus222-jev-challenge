/**
 * Eixos partilhados por humano e JEV. O perfil assistido converte intenções em
 * alvos de pranchamento/razão vertical e estabiliza ao expirar a ordem.
 * No perfil manual, voo-progressivo.js integra pitchInput numa atitude
 * persistente; a expiração liberta o eixo, sem nivelar o nariz.
 */
export const LATERAIS = Object.freeze(['esquerda', 'nivelar', 'direita']);
export const VERTICAIS = Object.freeze(['subir', 'manter', 'descer']);
export const POTENCIAS = Object.freeze(['mais', 'manter', 'menos']);
/** O JEV reconfirma a ~3 Hz; sem ordem durante este tempo, o avião estabiliza. */
export const RETENCAO_JEV_S = 0.6;
/** Ao largar, o eixo humano expira depressa; o perfil determina a estabilização. */
export const RETENCAO_HUMANO_S = 0.15;

export function novoPiloto(tipo = 'humano') {
  return { tipo, lateral: 'nivelar', vertical: 'manter', potencia: 'manter', ateS: 0, fonte: tipo, supervisor: null };
}

/** Uma das 7 manobras tácticas → eixos lateral e vertical. */
export function actuacaoDeManobra(manobra) {
  const m = String(manobra ?? '');
  return {
    lateral: m.startsWith('esquerda') ? 'esquerda' : m.startsWith('direita') ? 'direita' : 'nivelar',
    vertical: m.endsWith('subir') ? 'subir' : m === 'descer' ? 'descer' : 'manter',
  };
}

/** Eixos → a manobra táctica equivalente (para a seta e o registo). */
export function manobraDeActuacao({ lateral, vertical } = {}) {
  if (lateral === 'esquerda') return vertical === 'subir' ? 'esquerda_subir' : 'esquerda';
  if (lateral === 'direita') return vertical === 'subir' ? 'direita_subir' : 'direita';
  return vertical === 'subir' ? 'subir' : vertical === 'descer' ? 'descer' : 'manter';
}

const um = (valor, lista, fallback) => (lista.includes(valor) ? valor : fallback);

/** Uma ordem do piloto vale até tempoS + retenção; eixos em falta mantêm-se. */
export function darOrdem(piloto, ordem, tempoS, retencaoS = RETENCAO_JEV_S) {
  return {
    ...piloto,
    lateral: um(ordem?.lateral, LATERAIS, piloto.lateral),
    vertical: um(ordem?.vertical, VERTICAIS, piloto.vertical),
    potencia: um(ordem?.potencia, POTENCIAS, piloto.potencia),
    ateS: tempoS + retencaoS,
    fonte: ordem?.fonte ?? piloto.fonte,
    ...Object.fromEntries(['bankInput', 'pitchInput', 'rudder', 'potenciaDelta', 'travao'].map((k) => [k, Number.isFinite(ordem?.[k]) ? Math.max(-1, Math.min(1, ordem[k])) : undefined])),
  };
}

/**
 * Teclas carregadas (KeyboardEvent.code) → ordem do humano. Setas ou WASD
 * para pranchamento e atitude (puxar ↓/S levanta, empurrar ↑/W baixa); E/Shift mais potência, Q/Control menos.
 */
export function ordemDeTeclas(teclas) {
  const t = teclas instanceof Set ? teclas : new Set(teclas ?? []);
  const esquerda = t.has('ArrowLeft') || t.has('KeyA');
  const direita = t.has('ArrowRight') || t.has('KeyD');
  const subir = t.has('ArrowDown') || t.has('KeyS');
  const descer = t.has('ArrowUp') || t.has('KeyW');
  const mais = t.has('KeyE') || t.has('ShiftLeft') || t.has('ShiftRight');
  const menos = t.has('KeyQ') || t.has('ControlLeft') || t.has('ControlRight');
  return {
    lateral: esquerda === direita ? 'nivelar' : esquerda ? 'esquerda' : 'direita',
    vertical: subir === descer ? 'manter' : subir ? 'subir' : 'descer',
    potencia: mais === menos ? 'manter' : mais ? 'mais' : 'menos',
  };
}

/** Actuação que vale agora: a do supervisor se activa, senão a do piloto, senão estabilizar. */
export function actuacaoEfectiva(piloto, tempoS) {
  const s = piloto?.supervisor;
  if (s && tempoS < s.ateS) return { lateral: s.lateral, vertical: s.vertical, potencia: s.potencia ?? 'manter', fonte: 'supervisor', motivo: s.motivo };
  if (piloto && tempoS < piloto.ateS) return { lateral: piloto.lateral, vertical: piloto.vertical, potencia: piloto.potencia, fonte: piloto.fonte, ...Object.fromEntries(['bankInput', 'pitchInput', 'rudder', 'potenciaDelta', 'travao'].filter((k) => Number.isFinite(piloto[k])).map((k) => [k, piloto[k]])) };
  return { lateral: 'nivelar', vertical: 'manter', potencia: 'manter', fonte: 'estabilizador' };
}

/** Clique vertical persistente: repetir o botão activo equivale a nivelar. */
export function seleccionarVertical(actual, pedido) {
  if (!VERTICAIS.includes(pedido) || pedido === actual) return 'manter';
  return pedido;
}

/** Intenção humana: o teclado vertical tem prioridade sobre o botão seleccionado. */
export function ordemHumana(teclas, vertical = 'manter', toque = new Map()) {
  const ordem = ordemDeTeclas(teclas);
  const temVertical = ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].some((t) => teclas.has(t));
  if (!temVertical) ordem.vertical = um(vertical, VERTICAIS, 'manter');
  for (const [eixo, valor] of toque) if (eixo === 'lateral' || eixo === 'potencia') ordem[eixo] = valor;
  return ordem;
}
