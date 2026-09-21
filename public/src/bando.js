/** Meia-envergadura do LUS-222 (asa 16,8 × escala 1,35) com margem. O corredor fica livre. */
export const CORREDOR_M = 14;

/** Esfera que cobre corpo, bico e a asa batida (unidades do modelo × escala). */
const MEIA_AVE = 1.45;
const FOLGA_AVE = 1.35;

/**
 * Bando solto, determinístico, sem malhas a atravessar-se nem o corredor do LUS-222.
 * `ladoEcra` +1 é a esquerda do ecrã ( +X local na câmara atrás da cauda ).
 * `corredorX` é o eixo do voo nesse mesmo referencial.
 */
export function planoBando({ n = 16, ladoEcra = 0, corredorX = 0 } = {}) {
  const lado = ladoEcra === 0 ? 1 : ladoEcra > 0 ? 1 : -1;
  const total = Math.max(6, Math.min(20, Math.round(Number(n) || 16)));
  const aves = [];
  for (let i = 0; i < total; i++) {
    const escala = 2.05 + (i % 4) * 0.32;
    const raio = MEIA_AVE * escala;
    const ang = i * 2.399963229728653;
    const anel = 2.4 + Math.sqrt(i) * 3.8;
    let x = corredorX + lado * (CORREDOR_M + raio + 2.5 + Math.abs(Math.cos(ang)) * anel);
    let z = -6 + Math.sin(ang) * (6 + anel * 0.8);
    let y = ((i % 5) - 2) * 3.1;
    for (let k = 0; k < 12; k++) {
      let livre = true;
      for (const outra of aves) {
        const dx = x - outra.x;
        const dy = y - outra.y;
        const dz = z - outra.z;
        const dist = Math.hypot(dx, dy, dz);
        const precisa = raio + outra.raio + FOLGA_AVE;
        if (dist < precisa) {
          livre = false;
          const empurra = (precisa - dist + 0.08) / (dist || 1);
          x += (dx || lado) * empurra;
          y += (dy || (i % 2 === 0 ? 1 : -1)) * empurra * 0.5;
          z += (dz || ((i % 3) - 1 || 1)) * empurra;
        }
      }
      const minimo = corredorX + lado * (CORREDOR_M + raio);
      if (lado > 0 && x < minimo) x = minimo;
      if (lado < 0 && x > minimo) x = minimo;
      if (livre) break;
    }
    aves.push({
      x,
      y,
      z,
      escala,
      raio,
      yaw: lado * -0.35 + ((i % 5) - 2) * 0.07,
      rate: 3.8 + (i % 4) * 0.7,
      phase: i * 0.9,
      speed: 0,
    });
  }
  return aves;
}
