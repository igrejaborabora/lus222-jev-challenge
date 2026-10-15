import assert from 'node:assert/strict';
import test from 'node:test';
import { criarVooLivre } from './simulador.mjs';
import { avancarMissao } from './simulacao.mjs';
import {
  CATALOGO_PERTURBACOES,
  injetarPerturbacao,
  passoVariabilidadeAutomatica,
  perturbacaoActiva,
  resumoPainelLiveJev,
  sintetizarDecisaoTaticaJev,
} from './variabilidade-voo.mjs';

test('injetarPerturbacao(wind_gust) injects active wind shear perturbation and alters wind envelope', () => {
  let m = criarVooLivre({ semente: 222, piloto: 'jev' });
  const antes = m.voo.xM;
  m = injetarPerturbacao(m, 'wind_gust');
  const p = perturbacaoActiva(m);
  assert.ok(p);
  assert.equal(p.tipo, 'wind_gust');
  assert.equal(p.codigo, 'WIND_GUST');

  for (let i = 0; i < 40; i += 1) {
    m = avancarMissao(m, 0.05);
  }
  assert.notEqual(m.voo.xM, antes);
});

test('injetarPerturbacao(air_pocket) injects downdraft and synthesizes climb + more throttle reflex', () => {
  let m = criarVooLivre({ semente: 222, piloto: 'jev' });
  m = injetarPerturbacao(m, 'air_pocket');
  const p = perturbacaoActiva(m);
  assert.ok(p);
  assert.equal(p.tipo, 'air_pocket');
  assert.equal(p.codigo, 'AIR_POCKET');
  assert.ok(p.deltaVerticalMs < -3);

  const jev = sintetizarDecisaoTaticaJev(m, { latenciaMs: 16 });
  assert.ok(jev.answers.manobra.choice.includes('subir'));
  assert.equal(jev.answers.potencia.choice, 'mais');
  assert.ok(jev.answers.urgencia.score >= 2);
  assert.equal(jev.latencia_ms, 16);
});

test('injetarPerturbacao(bird_flock) injects 3D bird flock obstacle ahead in the corridor', () => {
  let m = criarVooLivre({ semente: 222, piloto: 'jev' });
  const nAntes = m.ameacas.length;
  m = injetarPerturbacao(m, 'bird_flock');
  assert.equal(m.ameacas.length, nAntes + 1);
  const bando = m.ameacas.at(-1);
  assert.equal(bando.visual, 'aves');
  assert.equal(bando.tipo, 'bando de gaivotas');
  assert.equal(bando.membros, 24);

  const jev = sintetizarDecisaoTaticaJev(m, { latenciaMs: 21 });
  assert.ok(['esquerda_subir', 'direita_subir', 'subir', 'esquerda', 'direita'].includes(jev.answers.manobra.choice));
  assert.equal(jev.answers.potencia.choice, 'mais');
  assert.ok(jev.answers.urgencia.score >= 2.2);
});

test('resumoPainelLiveJev builds complete telemetry, typed distribution, score, boolean and latency', () => {
  let m = criarVooLivre({ semente: 222, piloto: 'jev' });
  m = injetarPerturbacao(m, 'bird_flock');
  const jev = sintetizarDecisaoTaticaJev(m, { latenciaMs: 19 });
  const resumo = resumoPainelLiveJev(m, jev, { fonte: 'LIVE JEV', supervisor: false });

  assert.equal(resumo.fonte, 'LIVE JEV');
  assert.equal(resumo.latenciaMs, 19);
  assert.equal(resumo.evento.codigo, 'BIRD_FLOCK');
  assert.ok(resumo.telemetria.iasKt > 50);
  assert.ok(resumo.telemetria.altFt > 400);
  assert.ok(resumo.decisao.opcoes.length >= 3);
  assert.ok(resumo.decisao.riscoScore >= 70);
  assert.equal(resumo.decisao.estabilizado, true);
});

test('passoVariabilidadeAutomatica triggers dynamic flight phenomenon when clock reaches threshold', () => {
  let m = criarVooLivre({ semente: 222, piloto: 'jev' });
  m = { ...m, voo: { ...m.voo, tempoS: 20 } };
  const ctrl = { activo: true, proximoS: 18, contador: 0 };
  const res = passoVariabilidadeAutomatica(m, ctrl);
  assert.ok(res.disparou);
  assert.ok(Object.keys(CATALOGO_PERTURBACOES).includes(res.disparou.tipo));
  assert.equal(ctrl.contador, 1);
  assert.ok(ctrl.proximoS > 20);
});
