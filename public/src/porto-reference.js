import { alturaTerreno, distanciaAoRio } from './relevo.js';

/** Costa extraída do próprio relevo procedural, limitada a 121 amostras. */
export function amostrarCosta(perfil, pistas = []) {
  if (perfil?.agua !== 'costa') return [];
  const pontos = [];
  for (let z = 145000; z <= 163000; z += 150) {
    let terra = perfil.costaX - perfil.recorteM - 500;
    let mar = perfil.costaX + perfil.recorteM + 500;
    for (let i = 0; i < 15; i++) {
      const x = (terra + mar) / 2;
      if (alturaTerreno(perfil, x, z, pistas) > 0) terra = x; else mar = x;
    }
    const x = (terra + mar) / 2;
    pontos.push({ x, y: 0.15, z, aberta: !perfil.rio || distanciaAoRio(perfil.rio, x, z) > 450 });
  }
  return pontos;
}

/** Margens do Douro, limitadas a 200 secções por lado; sem alterar o terreno. */
export function amostrarMargens(perfil, pistas = []) {
  if (!perfil?.rio) return [];
  const margens = [[], []];
  const pts = perfil.rio.pontos;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const passos = Math.ceil(len / 100);
    for (let j = 0; j < passos; j++) {
      const x = a[0] + dx * j / passos, z = a[1] + dz * j / passos;
      for (const [k, lado] of [-1, 1].entries()) {
        const nx = dz / len * lado, nz = -dx / len * lado;
        let lo = 50, hi = 430;
        if (alturaTerreno(perfil, x + nx * hi, z + nz * hi, pistas) < 2) {
          margens[k].push(null); continue;
        }
        for (let n = 0; n < 12; n++) {
          const d = (lo + hi) / 2;
          if (alturaTerreno(perfil, x + nx * d, z + nz * d, pistas) < 2) lo = d; else hi = d;
        }
        const distancia = (lo + hi) / 2;
        margens[k].push({ x: x + nx * distancia, y: 2.3, z: z + nz * distancia, nx, nz });
      }
    }
  }
  return margens;
}
