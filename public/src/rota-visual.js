import { pontoMundo } from './escala.js';
import { CONSUMO_MIN_KG_S, PERFIL, combustivelNecessarioKg } from './simulacao.js';

// Tecto da bissecção do alcance: nem com os tanques cheios, a gastar o mínimo
// de combustivelNecessarioKg (CONSUMO_MIN_KG_S, 0,09 kg/s antes da margem ×1,25)
// e à velocidade máxima (115 m/s; vale enquanto 88 m/s + vento de cauda não a
// passar), o avião iria mais longe. ≈ 2300 km; os 600 km antigos não chegavam
// aos tanques cheios.
const TECTO_ALCANCE_M = (PERFIL.combustivelMaxKg / CONSUMO_MIN_KG_S) * PERFIL.velocidadeMaxMs;

/**
 * Pontos da fita de rota (mundo), do avião ao destino; desce nos últimos
 * `descidaM` (12 km por omissão). Com o destino mais perto do que isso, a
 * descida ocupa a fita toda e começa à altitude do avião (não abaixo dele).
 * Em cima do destino não há fita a descer: fica toda à altitude do avião.
 */
export function pontosFitaRota(voo, destino, { n = 24, descidaM = 12000 } = {}) {
  const a = pontoMundo(voo.xM, voo.zM);
  const b = pontoMundo(destino.xM, destino.zM);
  const total = Math.hypot(b.x - a.x, b.z - a.z);
  const rampa = Math.min(descidaM, total);
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const falta = total * (1 - t);
    const y = !total || falta > rampa ? voo.altitudeM : 30 + (voo.altitudeM - 30) * (falta / rampa);
    // As pontas são exactamente o avião e o destino (sem −0 trocado por 0 nem erro de arredondamento).
    const { x, z } = i === 0 ? a : i === n ? b : { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    return { x, y, z };
  });
}

/**
 * Distância máxima (m) que o combustível permite na direcção do destino activo,
 * já com a reserva de combustivelNecessarioKg (×1.25 + 70 kg). Bissecção válida:
 * o combustível necessário nunca desce quando a distância cresce.
 */
export function alcanceM(missao) {
  const destino = missao.destinos.find((d) => d.id === missao.destinoId) ?? missao.destinos[1];
  const dx = destino.xM - missao.voo.xM;
  const dz = destino.zM - missao.voo.zM;
  const n = Math.hypot(dx, dz);
  // Em cima do destino não há direcção: sem este recurso o ponto nunca se afastava e o alcance saltava para 600 km.
  const ux = n ? dx / n : 0;
  const uz = n ? dz / n : 1;
  const ponto = (d) => ({ xM: missao.voo.xM + ux * d, zM: missao.voo.zM + uz * d });
  let lo = 0;
  let hi = TECTO_ALCANCE_M;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (combustivelNecessarioKg(missao, ponto(mid)) <= missao.voo.combustivelKg) lo = mid;
    else hi = mid;
  }
  return Math.round(lo);
}

const EIXO = { direita: 1, esquerda: -1, subir: 1, descer: -1 };

/**
 * Sentido da seta da manobra, nos eixos do piloto: lateral +1 = direita do
 * piloto (+xM no simulador, que o mundo espelha: com rumo 0 é −X no Three.js;
 * com rumo r é (−cos r, −sin r) em (x, z), ou seja −X local do modelo com o
 * nariz em +Z), vertical +1 = subir. Devolve null quando a ordem é manter nos
 * dois eixos.
 */
export function setaManobra(comando) {
  const lateral = EIXO[comando?.lateral] ?? 0;
  const vertical = EIXO[comando?.vertical] ?? 0;
  return lateral || vertical ? { lateral, vertical } : null;
}
