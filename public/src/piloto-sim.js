/**
 * Actuação do simulador, igual para o piloto humano e para o JEV: os mesmos
 * «botões» que o JEV escolhe a ~3 Hz são as teclas do humano. É comando de
 * intenção, como num fly-by-wire: esquerda/direita pedem 25° de pranchamento,
 * subir/descer pedem 4 m/s e a potência mexe no acelerador por incrementos.
 * Sem ordem nova, o avião nivela e mantém a altitude.
 */
export const LATERAIS = Object.freeze(['esquerda', 'nivelar', 'direita']);
export const VERTICAIS = Object.freeze(['subir', 'manter', 'descer']);
export const POTENCIAS = Object.freeze(['mais', 'manter', 'menos']);
/** O JEV reconfirma a ~3 Hz; sem ordem durante este tempo, o avião estabiliza. */
export const RETENCAO_JEV_S = 0.6;
/** O humano segura a ordem enquanto carrega; ao largar estabiliza depressa. */
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
  };
}

/**
 * Teclas carregadas (KeyboardEvent.code) → ordem do humano. Setas ou WASD
 * para pranchamento e subida; E/Shift mais potência, Q/Control menos.
 */
export function ordemDeTeclas(teclas) {
  const t = teclas instanceof Set ? teclas : new Set(teclas ?? []);
  const esquerda = t.has('ArrowLeft') || t.has('KeyA');
  const direita = t.has('ArrowRight') || t.has('KeyD');
  const subir = t.has('ArrowUp') || t.has('KeyW');
  const descer = t.has('ArrowDown') || t.has('KeyS');
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
  if (piloto && tempoS < piloto.ateS) return { lateral: piloto.lateral, vertical: piloto.vertical, potencia: piloto.potencia, fonte: piloto.fonte };
  return { lateral: 'nivelar', vertical: 'manter', potencia: 'manter', fonte: 'estabilizador' };
}
