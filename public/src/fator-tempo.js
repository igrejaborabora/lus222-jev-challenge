// Ameaça a este tempo do contacto (ou menos) suspende o relógio simulado
// enquanto o JEV avalia.
export const IMINENTE_S = 15;
// Tecto de velocidade enquanto se lê uma ameaça (balões, aves, tráfego, relevo).
export const TECTO_LEITURA = 2;

/** O evento traz algum obstáculo a IMINENTE_S segundos do contacto ou menos? */
export function ameacaIminente(evento) {
  return Boolean(evento?.obstaculos?.some((o) => o.segundos_ate_ao_contacto <= IMINENTE_S));
}

/**
 * Factor do relógio simulado por frame, por esta ordem: à espera do JEV com
 * ameaça iminente, parado (0); à espera sem ela, 1×; a ler uma ameaça, a
 * velocidade escolhida até 2×; de resto, a velocidade escolhida.
 */
export function fatorTempo({ espera, ameacaIminente: iminente, leitura, velocidade }) {
  if (espera) return iminente ? 0 : 1;
  if (leitura) return Math.min(velocidade, TECTO_LEITURA);
  return velocidade;
}
