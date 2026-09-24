export const TAMANHO_MOSAICO_M = 2000;

export function chaveMosaico(i, j) {
  return `${i}:${j}`;
}

/** Mosaicos num disco de `raio` à volta de (x, z), do mais próximo ao mais longe. */
export function mosaicosNecessarios(x, z, { tamanho = TAMANHO_MOSAICO_M, raio = 3 } = {}) {
  const ci = Math.floor(x / tamanho);
  const cj = Math.floor(z / tamanho);
  const lista = [];
  for (let di = -raio; di <= raio; di++) {
    for (let dj = -raio; dj <= raio; dj++) {
      const d2 = di * di + dj * dj;
      if (d2 > raio * raio + 1) continue;
      lista.push({ i: ci + di, j: cj + dj, chave: chaveMosaico(ci + di, cj + dj), d2 });
    }
  }
  return lista.sort((a, b) => a.d2 - b.d2);
}

/**
 * Mosaicos que se podem manter: o disco de `raio` com mais um anel. Um mosaico
 * só se larga quando fica para lá desse anel extra (histerese). As rotas voam
 * ao longo de x ≈ 0, a fronteira entre colunas; sem isto, cada pequena
 * oscilação lateral largava e recriava colunas inteiras.
 */
export function mosaicosAManter(x, z, { tamanho = TAMANHO_MOSAICO_M, raio = 3 } = {}) {
  return mosaicosNecessarios(x, z, { tamanho, raio: raio + 1 });
}

/** Cria os necessários que faltam; remove só os existentes fora de `manter`. */
export function planearMosaicos(existentes, necessarios, manter = necessarios) {
  const quer = new Set(manter.map((m) => m.chave));
  return {
    criar: necessarios.filter((m) => !existentes.has(m.chave)),
    remover: [...existentes.keys()].filter((k) => !quer.has(k)),
  };
}
