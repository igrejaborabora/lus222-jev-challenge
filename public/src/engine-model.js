/** Twin-engine teaching model. Values are illustrative, not LUS-222 certified data.
 * Each engine owns half the existing total thrust and fuel-flow law. Matching
 * commands preserve the original nominal totals exactly; failures are explicit.
 * No RPM, oil pressure or temperature is inferred from throttle position.
 */
export const MODELO_MOTORES = 'bimotor-ilustrativo-1';
export const AUTORIDADE_LEME_RAD_S = 0.025;
const GUINADA_ASSIMETRICA_RAD_S = 0.035;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const numero = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function novosComandosMotores() {
  return { esquerdo: { falha: false, acelerador: null }, direito: { falha: false, acelerador: null } };
}

export function normalizarComandosMotores(comandos = {}) {
  const motor = (c) => ({ falha: c?.falha === true,
    acelerador: Number.isFinite(c?.acelerador) ? clamp(c.acelerador, 0, 1) : null });
  return { esquerdo: motor(comandos?.esquerdo), direito: motor(comandos?.direito) };
}

/** Positive heading/rudder turns right; a failed left engine therefore yaws left.
 * Yaw is a bounded teaching response to unequal thrust, not a rigid-body model.
 * lemeCompensacao is the airborne feed-forward rudder needed by this model.
 */
export function calcularMotores(voo = {}, controlos = {}, perfil = {}, acelerador = voo.acelerador) {
  const comandos = normalizarComandosMotores(controlos.motores);
  const comum = clamp(numero(acelerador, 0.55), 0, 1);
  const fuel = Math.max(0, numero(voo.combustivelKg));
  const empuxoMaxN = Math.max(0, numero(perfil.empuxoMaxN));
  const altitude = Math.max(0, numero(voo.altitudeM));
  const densidade = Math.max(0.55, 1 - altitude / 13000);
  const motor = (comando) => {
    const pedido = comando.acelerador ?? comum;
    const estado = comando.falha ? 'falha' : fuel <= 0 ? 'sem_combustivel' : 'operacional';
    const potencia = estado === 'operacional' ? pedido : 0;
    return { estado, acelerador: pedido, potencia,
      empuxoN: (empuxoMaxN * potencia * densidade) / 2,
      consumoKgS: estado === 'operacional' ? (0.026 + 0.115 * potencia) / 2 : 0 };
  };
  const esquerdo = motor(comandos.esquerdo), direito = motor(comandos.direito);
  const guinadaRadS = empuxoMaxN > 0
    ? (esquerdo.empuxoN - direito.empuxoN) / empuxoMaxN * GUINADA_ASSIMETRICA_RAD_S : 0;
  return { modelo: MODELO_MOTORES, empuxoMaxN, esquerdo, direito,
    potenciaTotal: (esquerdo.potencia + direito.potencia) / 2,
    empuxoTotalN: esquerdo.empuxoN + direito.empuxoN,
    consumoTotalKgS: esquerdo.consumoKgS + direito.consumoKgS,
    guinadaRadS, lemeCompensacao: clamp(-guinadaRadS / AUTORIDADE_LEME_RAD_S, -1, 1) };
}
