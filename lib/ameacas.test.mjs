import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpa, nascerAmeacas, passoAmeacas, raioEfectivoM } from './ameacas.mjs';
import { avancarMissao, criarMissao, proximoEvento } from '../public/src/simulacao.js';

const VOO = { xM: 0, zM: 0, altitudeM: 480, velocidadeMs: 88, velocidadeVerticalMs: 0, rumoRad: 0, tempoS: 0 };
const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≉ ${b}`);

function def(extra = {}) {
  return { id: 'trafego', tipo: 'avião ligeiro', visual: 'trafego', relativo: { frenteM: 3000, lateralM: 0 }, velocidade: { rumoRelRad: Math.PI, ms: 50 }, raioProtecaoM: 120, ...extra };
}

function avancar(ameacas, segundos, vento) {
  let a = ameacas;
  for (let t = 0; t < Math.round(segundos * 10); t++) a = passoAmeacas(a, 0.1, { vento, tempoS: (t + 1) * 0.1 });
  return a;
}

describe('nascimento das ameaças', () => {
  it('frente conta ao longo do rumo e lateral positivo fica à direita do piloto', () => {
    const [a] = nascerAmeacas([def({ relativo: { frenteM: 3000, lateralM: 500 } })], VOO);
    perto(a.zM, 3000, 1e-9, 'à frente');
    perto(a.xM, 500, 1e-9, 'à direita (+x com rumo 0)');
    perto(a.vzMs, -50, 1e-9, 'de frente');
    const [b] = nascerAmeacas([def({ relativo: { frenteM: 1000, lateralM: 500 } })], { ...VOO, rumoRad: Math.PI / 2 });
    perto(b.xM, 1000, 1e-9, 'rumo +x: à frente é +x');
    perto(b.zM, -500, 1e-9, 'rumo +x: a direita é −z');
  });

  it('ids em sequência e fases determinísticas pela semente', () => {
    const [a, b] = nascerAmeacas([def(), def({ id: 'aves', visual: 'aves' })], VOO, { semente: 222, proximoNumero: 3 });
    assert.equal(a.id, 'a3');
    assert.equal(b.id, 'a4');
    const [c] = nascerAmeacas([def()], VOO, { semente: 222 });
    assert.equal(c.comportamento.fase, a.comportamento.fase);
    const [d] = nascerAmeacas([def()], VOO, { semente: 223 });
    assert.notEqual(d.comportamento.fase, a.comportamento.fase);
  });

  it('um grupo protege-se com o perímetro mais a dispersão', () => {
    assert.equal(raioEfectivoM({ raioProtecaoM: 36, dispersaoM: 40 }), 76);
  });
});

describe('comportamentos', () => {
  it('balões derivam com o vento e sobem', () => {
    const [a] = nascerAmeacas([def({ velocidade: { rumoRelRad: 0, ms: 0 }, comportamento: { tipo: 'vento', subidaMs: 1.2 } })], VOO);
    const [b] = avancar([a], 10, { x: 6, z: -5 });
    perto(b.xM - a.xM, 60, 1e-6, 'x');
    perto(b.zM - a.zM, -50, 1e-6, 'z');
    perto(b.altitudeM - a.altitudeM, 12, 1e-6, 'subida');
  });

  it('a viragem programada roda a velocidade no intervalo marcado', () => {
    const [a] = nascerAmeacas([def({ velocidade: { rumoRelRad: 0, ms: 50 }, comportamento: { tipo: 'viragem', emS: 5, duracaoS: 4, deltaRad: -Math.PI / 2 } })], VOO);
    const antes = avancar([a], 4.9)[0];
    perto(antes.vxMs, 0, 1e-9, 'antes de emS não vira');
    const [b] = avancar([a], 12);
    perto(b.vxMs, -50, 0.5, 'virou para −x (esquerda)');
    perto(b.vzMs, 0, 0.5);
    perto(Math.hypot(b.vxMs, b.vzMs), 50, 1e-6, 'mantém a velocidade');
  });

  it('o vagueio das aves é determinístico e limitado', () => {
    const d = def({ visual: 'aves', velocidade: { rumoRelRad: Math.PI / 2, ms: 12 }, comportamento: { tipo: 'vagueio', amplitudeMs: 3 } });
    const [x] = avancar(nascerAmeacas([d], VOO, { semente: 9 }), 20);
    const [y] = avancar(nascerAmeacas([d], VOO, { semente: 9 }), 20);
    assert.deepEqual(x, y);
    assert.ok(Math.abs(x.vxMs - 12) <= 3 + 1e-9 && Math.abs(x.vzMs) <= 3 + 1e-9);
  });

  it('a célula cresce e o contacto SAR deriva com uma fracção do vento', () => {
    const [celula] = avancar(nascerAmeacas([def({ velocidade: { ms: 0 }, raioProtecaoM: 600, comportamento: { tipo: 'celula', crescimentoMs: 2 } })], VOO), 10, { x: 4, z: 0 });
    perto(celula.raioProtecaoM, 620, 1e-6, 'raio');
    perto(celula.xM, 40, 1e-6, 'deriva com o vento');
    const [balsa] = avancar(nascerAmeacas([def({ velocidade: { ms: 0 }, comportamento: { tipo: 'deriva' } })], VOO), 10, { x: 4, z: -3 });
    perto(balsa.xM, 12, 1e-6);
    perto(balsa.zM, 3000 - 9, 1e-6);
  });
});

describe('ponto de maior aproximação', () => {
  it('de frente: tempo pela velocidade de fecho e distância pelo afastamento lateral', () => {
    const [a] = nascerAmeacas([def({ relativo: { frenteM: 3000, lateralM: 100 } })], VOO);
    const c = cpa(VOO, a);
    perto(c.tcpaS, 3000 / 138, 1e-6);
    perto(c.horizontalM, 100, 1e-6);
    assert.equal(c.movimento, 'converge');
  });

  it('a cruzar: os dois chegam ao mesmo ponto', () => {
    const [a] = nascerAmeacas([def({ relativo: { frenteM: 1000, lateralM: 1000 }, velocidade: { rumoRelRad: -Math.PI / 2, ms: 88 } })], VOO);
    const c = cpa(VOO, a);
    perto(c.tcpaS, 1000 / 88, 1e-6);
    perto(c.horizontalM, 0, 1e-6);
  });

  it('a afastar: tempo zero e distância de agora', () => {
    const [a] = nascerAmeacas([def({ relativo: { frenteM: -800, lateralM: 0 }, velocidade: { rumoRelRad: Math.PI, ms: 50 } })], VOO);
    const c = cpa(VOO, a);
    assert.equal(c.tcpaS, 0);
    assert.equal(c.movimento, 'afasta');
    perto(c.distanciaCpaM, 800, 1e-6);
  });
});

describe('ameaças na missão', () => {
  const comEvento = (evento) => {
    const m = criarMissao('porto', 222);
    return { ...m, eventosPendentes: [evento, ...m.eventosPendentes] };
  };

  it('um evento só de ameaça faz nascer as ameaças no gatilho, sem pergunta ao JEV', () => {
    let m = comEvento({ id: 'teste', tipo: 'trafego', pergunta: false, gatilho: { tipo: 'tempo', valor: 2 }, ameacas: [def({ relativo: { frenteM: 4000, lateralM: 1500 } })] });
    m = avancarMissao(m, 1);
    assert.equal(m.ameacas.length, 0);
    assert.equal(proximoEvento(m), null, 'não pede decisão estratégica');
    m = avancarMissao(m, 1.5);
    assert.equal(m.ameacas.length, 1);
    assert.equal(m.ameacas[0].id, 'a1');
    assert.ok(m.eventosTratados.includes('teste'));
    assert.ok(!m.eventosPendentes.some((e) => e.id === 'teste'));
  });

  it('uma ameaça que passa com folga sai e deixa a separação mínima', () => {
    let m = comEvento({ id: 'ao_lado', tipo: 'trafego', pergunta: false, gatilho: { tipo: 'tempo', valor: 0 }, ameacas: [def({ relativo: { frenteM: 3000, lateralM: 900 } })] });
    for (let i = 0; i < 60 && !m.resultado; i++) m = avancarMissao(m, 1);
    assert.equal(m.ameacas.length, 0, 'já saiu');
    const registo = m.separacoes.find((s) => s.origem === 'trafego');
    assert.ok(registo && registo.minimaM > 700 && registo.minimaM < 1000, JSON.stringify(registo));
    assert.equal(m.resultado, null);
  });

  it('uma ameaça que atravessa o perímetro termina a missão', () => {
    let m = comEvento({ id: 'rota', tipo: 'trafego', pergunta: false, gatilho: { tipo: 'tempo', valor: 0 }, ameacas: [def({ relativo: { frenteM: 2000, lateralM: 0 } })] });
    for (let i = 0; i < 40 && !m.resultado; i++) m = avancarMissao(m, 1);
    assert.equal(m.resultado, 'separacao_perdida');
    assert.ok(m.separacoes.some((s) => s.origem === 'trafego' && s.minimaM < s.limiteM));
  });
});
