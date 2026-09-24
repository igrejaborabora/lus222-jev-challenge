/** Posição dos balões no mundo 1:1, relativa à pose (x espelhado, ver escala.js). */
export function posicaoVisualBaloes(voo, ameaca, pose) {
  return {
    x: pose.x - (ameaca.xM - voo.xM),
    y: pose.y + (ameaca.altitudeM - voo.altitudeM),
    z: pose.z + (ameaca.zM - voo.zM),
  };
}

// A leitura acaba quando a ameaça fica este tanto para trás (é também aí que
// a etiqueta sai: AMEACA_PASSADA_M em marcas-missao.js) ou, se o avião nunca
// a passar (volta, órbita), ao fim da passagem prevista mais esta margem.
const PASSADA_M = 60;
const MARGEM_LEITURA_S = 4;

/**
 * Ameaça no caminho que não são os balões (aves, tráfego, relevo…): a mais
 * próxima das que estão em rota, onde fica ao longo do rumo deste instante e
 * até que tempo simulado dura a leitura. Null sem ameaça em rota.
 */
export function leituraAmeaca(voo, obstaculos) {
  let o = null;
  for (const x of obstaculos ?? []) {
    const d = Number(x?.distancia_m);
    if (x?.em_rota && Number.isFinite(d) && (!o || d < Number(o.distancia_m))) o = x;
  }
  if (!o) return null;
  const distanciaM = Number(o.distancia_m);
  const contactoS = Number(o.segundos_ate_ao_contacto);
  const passagemS = Math.max((distanciaM + PASSADA_M) / Math.max(31, voo.velocidadeMs), Number.isFinite(contactoS) ? contactoS : 0);
  return { tipo: String(o.tipo ?? 'ameaça'), xM: voo.xM, zM: voo.zM, rumoRad: voo.rumoRad, distanciaM, ateS: voo.tempoS + passagemS + MARGEM_LEITURA_S };
}

/** A ameaça da leitura ainda não ficou para trás e o tempo previsto não acabou? */
export function emLeitura(leitura, voo) {
  if (!leitura || voo.tempoS >= leitura.ateS) return false;
  const avancoM = (voo.xM - leitura.xM) * Math.sin(leitura.rumoRad) + (voo.zM - leitura.zM) * Math.cos(leitura.rumoRad);
  return avancoM < leitura.distanciaM + PASSADA_M;
}

// Obstáculo no chão: nunca abaixo disto (continua a ver-se) nem acima disto.
const ALTURA_CHAO_MIN_M = 4;
const ALTURA_CHAO_MAX_M = 2000;

/**
 * Altura, acima do chão `chaoM`, de um obstáculo no chão (relevo, torre, cabo)
 * cujo topo fica `folgaPorCimaM` abaixo do avião a `altitudeM`: o número que o
 * JEV lê. Sem folga dada, fica `alturaM` (a altura do evento).
 */
export function alturaAteFolga(folgaPorCimaM, altitudeM, chaoM, alturaM) {
  const folga = folgaPorCimaM == null ? NaN : Number(folgaPorCimaM);
  if (!Number.isFinite(folga) || !Number.isFinite(altitudeM)) return alturaM;
  return Math.min(ALTURA_CHAO_MAX_M, Math.max(ALTURA_CHAO_MIN_M, altitudeM - folga - (chaoM || 0)));
}
