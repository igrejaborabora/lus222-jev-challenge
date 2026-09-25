import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gravarVoo, iniciarReproducao, reproduzir } from './voo-gravado.mjs';
import { mulberry32 } from '../public/src/decisao.js';

/** JEV de mentira, determinístico: segue a rota, foge ao que estiver em conflito, latência 250–450 ms. */
function jevFalso() {
  let n = 0;
  return async (estado) => {
    n += 1;
    const candidatas = Object.entries(estado.manobras);
    const seguras = candidatas.filter(([, x]) => x.separacao !== 'conflito');
    const melhor = (seguras.find(([, x]) => x.rota === 'aproxima') ?? seguras.find(([k]) => k === 'manter') ?? seguras[0] ?? candidatas[0])[0];
    const probs = Object.fromEntries(candidatas.map(([k]) => [k, k === melhor ? 0.9 : 0.1 / (candidatas.length - 1)]));
    return {
      answers: { manobra: { choice: melhor, probabilities: probs }, potencia: { choice: estado.voo.velocidade === 'lenta' ? 'mais' : 'manter', probabilities: { mais: 0.1, manter: 0.8, menos: 0.1 } } },
      confidence: { manobra: 0.8 },
      latencia_ms: 250 + ((n * 37) % 200),
      usage: { inputTokens: 2600 },
    };
  };
}

describe('voos gravados', () => {
  it('reproduz o voo gravado exactamente, seja qual for o ritmo dos frames', async () => {
    const aplicacoes = [];
    const gravacao = await gravarVoo({ semente: 11, duracaoS: 60, perguntar: jevFalso(), aoPasso: (m, d) => aplicacoes.push({ a: d.a, xM: m.voo.xM, zM: m.voo.zM, altitudeM: m.voo.altitudeM }) });
    assert.ok(gravacao.decisoes.length > 100, `${gravacao.decisoes.length} decisões`);
    assert.ok(gravacao.decisoes.every((d, i) => d.a > d.k && (i === 0 || d.k >= gravacao.decisoes[i - 1].a)), 'leitura antes da aplicação, sem sobreposição');

    const correr = (rnd) => {
      let m = iniciarReproducao(gravacao);
      let cursor = { i: 0, lido: false };
      const vistas = [];
      while (cursor.i < gravacao.decisoes.length && !m.resultado) {
        const r = reproduzir(m, gravacao, cursor, 0.004 + rnd() * 0.3);
        m = r.m; cursor = r.cursor;
        for (const e of r.eventos) if (e.tipo === 'aplicacao') vistas.push({ a: e.decisao.a, xM: e.voo.xM, zM: e.voo.zM, altitudeM: e.voo.altitudeM });
      }
      return { m, vistas };
    };
    const a = correr(mulberry32(1));
    const b = correr(mulberry32(2));
    assert.equal(a.vistas.length, gravacao.decisoes.length);
    assert.deepEqual(a.vistas, aplicacoes, 'cada aplicação bate com o gravador, passo a passo');
    assert.deepEqual(a.vistas, b.vistas);
  });

  it('a leitura mostra o estado do passo em que o JEV o leu', async () => {
    const gravacao = await gravarVoo({ semente: 5, duracaoS: 5, perguntar: jevFalso() });
    const r = reproduzir(iniciarReproducao(gravacao), gravacao, { i: 0, lido: false }, 2);
    const leitura = r.eventos.find((e) => e.tipo === 'leitura');
    assert.equal(leitura.decisao.k, 0);
    assert.equal(leitura.estado.momento, 'piloto');
  });
});
