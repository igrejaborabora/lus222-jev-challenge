import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarVooLivre } from './simulador.mjs';
import { actuacaoDeManobra, darOrdem, manobraDeActuacao, ordemDeTeclas, RETENCAO_HUMANO_S } from './piloto-sim.mjs';
import { alvoSimultaneas, planearAmeaca } from './diretor.mjs';
import { distanciaM, nascerAmeacas, passoAmeacas, raioEfectivoM } from './ameacas.mjs';
import { alturaChaoM, avancarMissao, escolhaDoSupervisor, preverActuacao } from '../public/src/simulacao.js';
import { mulberry32 } from '../public/src/decisao.js';

/** Voo sem director, com uma ordem segurada durante `segundos` (como o humano a carregar). */
function segurar(m, ordem, segundos) {
  let s = m;
  for (let t = 0; t < segundos * 10; t++) {
    s = { ...s, piloto: darOrdem(s.piloto, ordem, s.voo.tempoS, RETENCAO_HUMANO_S) };
    s = avancarMissao(s, 0.1);
  }
  return s;
}
const semDiretor = () => ({ ...criarVooLivre(222), diretor: null });

describe('actuação', () => {
  it('manobras e eixos convertem-se nos dois sentidos', () => {
    for (const m of ['manter', 'esquerda', 'direita', 'subir', 'descer', 'esquerda_subir', 'direita_subir']) {
      assert.equal(manobraDeActuacao(actuacaoDeManobra(m)), m);
    }
  });

  it('teclas: setas ou WASD, e potência com E/Shift e Q/Ctrl', () => {
    assert.deepEqual(ordemDeTeclas(['ArrowLeft', 'KeyW', 'ShiftLeft']), { lateral: 'esquerda', vertical: 'subir', potencia: 'mais' });
    assert.deepEqual(ordemDeTeclas(['KeyA', 'KeyD']), { lateral: 'nivelar', vertical: 'manter', potencia: 'manter' });
  });
});

describe('lei de comando', () => {
  it('esquerda e direita viram para o lado pedido e, ao largar, o avião nivela', () => {
    const inicio = semDiretor();
    const esq = segurar(inicio, { lateral: 'esquerda' }, 10);
    const dir = segurar(inicio, { lateral: 'direita' }, 10);
    assert.ok(esq.voo.rumoRad < inicio.voo.rumoRad - 0.3, 'esquerda baixa o rumo');
    assert.ok(dir.voo.rumoRad > inicio.voo.rumoRad + 0.3, 'direita sobe o rumo');
    const largado = avancarMissao(esq, 4);
    assert.ok(Math.abs(largado.voo.bankRad) < 0.02, `nivelou: ${largado.voo.bankRad}`);
  });

  it('subir ganha altitude e, ao largar, mantém-na', () => {
    const subiu = segurar(semDiretor(), { vertical: 'subir', potencia: 'mais' }, 10);
    assert.ok(subiu.voo.altitudeM > 480 + 20, `subiu para ${subiu.voo.altitudeM}`);
    const depois = avancarMissao(subiu, 20);
    assert.ok(Math.abs(depois.voo.altitudeM - subiu.voo.altitudeM) < 8, `manteve ${subiu.voo.altitudeM} → ${depois.voo.altitudeM}`);
  });

  it('mais potência abre o acelerador e acelera', () => {
    const m = segurar(semDiretor(), { potencia: 'mais' }, 2);
    assert.ok(m.voo.acelerador > 0.9);
    const depois = avancarMissao(m, 10);
    assert.ok(depois.voo.velocidadeMs > 90);
  });
});

describe('supervisor', () => {
  it('GPWS: perto do chão a descer, sobe', () => {
    const m = semDiretor();
    const chao = alturaChaoM(m, m.voo.xM, m.voo.zM);
    const baixo = { ...m, voo: { ...m.voo, altitudeM: chao + 45, velocidadeVerticalMs: -3, altitudeAlvoM: chao + 45 } };
    const depois = avancarMissao(baixo, 0.1);
    assert.equal(depois.piloto.supervisor?.motivo, 'terreno');
    assert.equal(depois.piloto.supervisor?.vertical, 'subir');
  });

  it('TCAS: tráfego de frente sem reacção do piloto é evitado', () => {
    const m = semDiretor();
    const [trafego] = nascerAmeacas([{ id: 'frente', tipo: 'avião ligeiro', visual: 'trafego', relativo: { frenteM: 3000, lateralM: 0 }, velocidade: { rumoRelRad: Math.PI, ms: 60 }, raioProtecaoM: 150 }], m.voo);
    let s = { ...m, ameacas: [trafego] };
    assert.ok(preverActuacao(s, actuacaoDeManobra('manter')).margemM < 0, 'manter dá conflito');
    assert.ok(preverActuacao(s, actuacaoDeManobra('direita')).margemM > 0, 'direita tem folga');
    let interveio = false;
    for (let i = 0; i < 60 && !s.resultado; i++) {
      s = avancarMissao(s, 1);
      if (s.piloto.supervisor?.motivo === 'separacao') interveio = true;
    }
    assert.equal(s.resultado, null);
    assert.ok(interveio, 'o supervisor tomou a manobra');
    const registo = s.separacoes.find((r) => r.origem === 'frente');
    assert.ok(registo.minimaM >= registo.limiteM, JSON.stringify(registo));
  });
});

describe('escolha do supervisor', () => {
  it('não troca folga ao terreno por separação, a menos que não haja alternativa', () => {
    const previsoes = [
      { c: 'direita', margemM: 20, aglMinM: 100 },
      { c: 'manter', margemM: -40, aglMinM: 100 },
      { c: 'descer', margemM: 60, aglMinM: 68 },
    ];
    // A 100 m do chão, descer dava mais separação mas aproximava-se do terreno.
    assert.equal(escolhaDoSupervisor(previsoes).c, 'direita');
    // Se nenhuma mantém a folga, fica a de maior margem.
    assert.equal(escolhaDoSupervisor(previsoes.map((p) => ({ ...p, aglMinM: 70 }))).c, 'descer');
    // Com tudo seguro, a de maior margem; no empate, a primeira da lista.
    assert.equal(escolhaDoSupervisor([{ c: 'a', margemM: 5, aglMinM: 400 }, { c: 'b', margemM: 5, aglMinM: 400 }]).c, 'a');
  });
});

describe('director', () => {
  it('aponta as ameaças a um encontro quase em rota', () => {
    const m = semDiretor();
    for (const tipo of ['cruzado', 'baloes', 'aves']) {
      const [a] = nascerAmeacas([planearAmeaca(m, mulberry32(3), tipo, 1)], m.voo, { semente: m.semente });
      let ameacas = [a];
      let minimo = Infinity;
      // Avião a direito, sem piloto nem supervisor: só cinemática.
      for (let t = 0.1; t < 60; t += 0.1) {
        ameacas = passoAmeacas(ameacas, 0.1, { vento: m.ambiente.ventoMs, tempoS: t });
        const v = { ...m.voo, xM: m.voo.xM + (Math.sin(m.voo.rumoRad) * 88 + 5) * t, zM: m.voo.zM + (Math.cos(m.voo.rumoRad) * 88 - 4) * t };
        minimo = Math.min(minimo, distanciaM(v, ameacas[0]) - raioEfectivoM(ameacas[0]));
      }
      assert.ok(minimo < 200, `${tipo}: passa a ${Math.round(minimo)} m do perímetro`);
    }
  });

  it('é determinístico pela semente e respeita o número de ameaças em simultâneo', () => {
    const correr = (semente) => {
      let m = criarVooLivre(semente);
      let maximo = 0;
      for (let i = 0; i < 240 && !m.resultado; i++) {
        m = avancarMissao(m, 1);
        maximo = Math.max(maximo, m.ameacas.length - alvoSimultaneas(m.voo.tempoS));
      }
      return { m, maximo };
    };
    const a = correr(7);
    const b = correr(7);
    assert.deepEqual(a.m.ameacas.map((x) => [x.id, x.tipo, Math.round(x.xM)]), b.m.ameacas.map((x) => [x.id, x.tipo, Math.round(x.xM)]));
    assert.ok(a.maximo <= 0, 'nunca acima do alvo');
    assert.ok(a.m.diretor.lancadas >= 5);
    assert.equal(a.m.resultado, null, 'o supervisor segura o voo sem piloto');
  });
});

describe('circuito', () => {
  it('passar a menos de 900 m do ponto activo avança para o seguinte', () => {
    const m = semDiretor();
    const perto = { ...m, voo: { ...m.voo, xM: -6600, zM: 151400, rumoRad: 0 } };
    const depois = avancarMissao(perto, 1);
    assert.equal(depois.destinoId, 'ponte');
    assert.equal(depois.pontosPassados[0].id, 'foz');
  });
});
