import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PERFIL, criarMissao, avancarMissao, aplicarDecisao, proximoEvento, estadoParaAvaliacao, pistaNecessariaM, combustivelNecessarioKg, localizarBaloes, vooInterpolado } from '../public/src/simulacao.js';
import { mulberry32 } from '../public/src/decisao.js';
import { validarRespostas } from '../public/src/contrato-jev.js';
import { posicaoVisualBaloes } from '../public/src/ameaca-visual.js';

const decisao = (acao = 'prosseguir', destino = 'planeado') => ({
  acaoMissao: { choice: acao, probabilities: { [acao]: 1 } },
  manobraVertical: { choice: 'manter', probabilities: { manter: 1 } },
  manobraLateral: { choice: 'manter', probabilities: { manter: 1 } },
  destinoPreferido: { choice: destino, probabilities: { [destino]: 1 } },
  urgencia: { score: 1 },
  riscoMeteorologico: { score: 1 },
  precisaRevisaoPIC: { probability: 0.1 },
  continuarVoo: { probability: 0.9 },
});

describe('simulação causal', () => {
  it('é determinística e consome combustível ao progredir', () => {
    const run = () => {
      let m = criarMissao('medevac', 222);
      for (let i = 0; i < 100; i++) m = avancarMissao(m, 0.1);
      return m;
    };
    const a = run();
    assert.deepEqual(a, run());
    assert.ok(a.voo.combustivelKg < criarMissao('medevac', 222).voo.combustivelKg);
    assert.ok(a.voo.distanciaPercorridaM > 0);
    assert.ok(a.voo.velocidadeMs > 0 && a.voo.altitudeM > 0);
  });

  it('muda rota e eventos possíveis quando regressa', () => {
    let m = criarMissao('carga', 222);
    const antes = m.destinoId;
    const r = aplicarDecisao(m, decisao('regressar_base', 'origem'));
    m = r.missao;
    assert.notEqual(m.destinoId, antes);
    assert.equal(m.destinoId, 'origem');
    assert.equal(m.fase, 'regresso');
    assert.equal(r.supervisor.interveio, false);
    assert.ok(!m.eventosPendentes.some((e) => e.rota === 'planeado'));
  });

  it('orbitar gasta recursos e abortar termina a missão', () => {
    let m = aplicarDecisao(criarMissao('sar', 222), decisao('orbitar')).missao;
    assert.equal(m.fase, 'orbita');
    const f = m.voo.combustivelKg;
    m = avancarMissao(m, 30);
    assert.ok(m.voo.combustivelKg < f);
    m = aplicarDecisao(m, decisao('abortar_emergencia', 'origem')).missao;
    assert.equal(m.fase, 'emergencia');
    assert.ok(m.destinoId !== 'planeado');
  });

  it('não oferece de novo um evento já tratado', () => {
    let m = criarMissao('medevac', 222);
    const e = proximoEvento(m);
    assert.ok(e);
    m = aplicarDecisao(m, decisao()).missao;
    assert.notEqual(proximoEvento(m)?.id, e.id);
  });

  it('bloqueia pista insuficiente e atribui a proteção ao supervisor', () => {
    const m = criarMissao('medevac', 222);
    const r = aplicarDecisao(m, decisao('desviar_alternativo', 'stol_proximo'));
    assert.equal(r.supervisor.interveio, true);
    assert.match(r.supervisor.motivo, /pista/i);
    assert.notEqual(r.missao.destinoId, 'stol_proximo');
  });

  it('também bloqueia prosseguir para uma pista que se tornou insuficiente', () => {
    const m = criarMissao('porto', 222);
    m.destinos = m.destinos.map((d) => d.id === 'planeado' ? { ...d, pistaM: 300 } : d);
    const r = aplicarDecisao(m, decisao());
    assert.equal(r.supervisor.fonte, 'supervisor');
    assert.match(r.supervisor.motivo, /pista/i);
    assert.notEqual(r.missao.destinoId, 'planeado');
  });

  it('avalia as alternativas com o vento do incidente que o JEV recebe', () => {
    const m = criarMissao('medevac', 222);
    const entrada = estadoParaAvaliacao(m, proximoEvento(m));
    const aplicada = aplicarDecisao(m, decisao()).missao;
    const planeado = aplicada.destinos.find((d) => d.id === 'planeado');
    const calculado = entrada.alternativas.find((d) => d.id === 'planeado');
    assert.equal(entrada.ambiente.vento_kt, 28);
    assert.equal(calculado.pista_necessaria_m, pistaNecessariaM(aplicada, planeado));
    assert.equal(calculado.combustivel_necessario_kg, combustivelNecessarioKg(aplicada, planeado));
  });

  it('envia estado físico e alternativas sem enviar a rubrica', () => {
    const m = criarMissao('carga', 222);
    const entrada = estadoParaAvaliacao(m, proximoEvento(m));
    assert.ok(entrada.voo.velocidade_ms > 0);
    assert.ok(entrada.alternativas.length > 0);
    assert.equal(entrada.tese, undefined);
    assert.equal(entrada.incidente.tese, undefined);
  });

  it('faz a aproximação ao Porto com balões e desfecho de aterragem', () => {
    let m = criarMissao('porto', 222);
    assert.equal(m.destinos.find((d) => d.id === 'planeado').pistaM, 3180);
    const vistos = [];
    while (!m.resultado) {
      const evento = proximoEvento(m);
      if (evento) {
        vistos.push(evento.id);
        const d = decisao();
        if (evento.id === 'baloes') d.manobraLateral.choice = 'direita';
        if (evento.id === 'trafego_porto') d.manobraLateral.choice = 'esquerda';
        m = aplicarDecisao(m, d).missao;
      }
      m = avancarMissao(m, 1);
    }
    assert.deepEqual(vistos, ['baloes', 'trafego_porto', 'anoitecer', 'vento_porto', 'final_porto']);
    assert.equal(m.resultado, 'chegou');
    assert.ok(m.voo.altitudeM <= 50);
    assert.ok(m.voo.combustivelKg > 0);
  });

  it('o supervisor intervém quando a trajetória sem manobra entra no perímetro', () => {
    let m = criarMissao('porto', 222);
    while (!proximoEvento(m)) m = avancarMissao(m, 1);
    m = { ...m, eventosPendentes: m.eventosPendentes.map((e) => e.id === 'baloes'
      ? { ...e, obstaculos: e.obstaculos.map((o) => ({ ...o, offset_lateral_m: 30 })) } : e) };
    const r = aplicarDecisao(m, decisao());
    assert.equal(r.supervisor.fonte, 'supervisor');
    assert.match(r.supervisor.motivo, /ameaça iminente/i);
    assert.equal(r.missao.comando.lateral, 'esquerda');
  });

  it('uma órbita que já garante separação não recebe manobra fictícia do supervisor', () => {
    let m = criarMissao('porto', 222);
    while (!proximoEvento(m)) m = avancarMissao(m, 1);
    const r = aplicarDecisao(m, decisao('orbitar'));
    assert.equal(r.supervisor.interveio, false);
    assert.equal(r.supervisor.aplicada.lateral, 'manter');
    assert.ok(r.supervisor.separacaoPrevistaM >= 36);
  });

  it('mede a passagem dos balões da gravação na trajetória, com subida e rota planeada', async () => {
    const fixture = JSON.parse(await readFile(new URL('../public/replays/porto.json', import.meta.url)));
    let m = criarMissao('porto', fixture.semente, fixture.restricoes);
    while (!proximoEvento(m)) m = avancarMissao(m, 1);
    const antes = m.voo;
    const ameaca = localizarBaloes(antes, proximoEvento(m).obstaculos[0]);
    const p = posicaoVisualBaloes(antes, ameaca, { x: 0, y: 42, z: 0 });
    assert.ok(p.z > 790 && p.z < 810, '800 m à frente ficam a 800 m no mundo (1:1)');
    assert.ok(p.x > 0, 'balões à esquerda do piloto ficam à esquerda do ecrã (+X)');
    const aplicada = aplicarDecisao(m, fixture.eventos.baloes.answers);
    assert.equal(aplicada.supervisor.interveio, false);
    assert.equal(aplicada.supervisor.aplicada.destino, 'planeado');
    m = avancarMissao(aplicada.missao, 18);
    assert.ok(m.voo.altitudeM > antes.altitudeM + 10, 'a ordem subir exige potência para ganhar altitude');
    assert.equal(m.resultado, null);
    assert.ok(m.separacoes[0].minimaM > m.separacoes[0].limiteM);
    assert.equal(m.separacoes[0].minimaM, aplicada.supervisor.separacaoPrevistaM);
    assert.ok(posicaoVisualBaloes(m.voo, ameaca, { x: 0, y: 42, z: 0 }).z < 0, 'o marcador passa pelo avião no mesmo instante que a trajetória');
  });

  it('bloqueia uma manobra JEV cuja separação prevista é insuficiente', () => {
    let m = criarMissao('porto', 222);
    while (!proximoEvento(m)) m = avancarMissao(m, 1);
    m = { ...m, eventosPendentes: m.eventosPendentes.map((e) => e.id === 'baloes'
      ? { ...e, obstaculos: e.obstaculos.map((o) => ({ ...o, offset_lateral_m: -100 })) } : e) };
    const proposta = decisao();
    proposta.manobraLateral.choice = 'esquerda';
    const r = aplicarDecisao(m, proposta);
    assert.equal(r.supervisor.fonte, 'supervisor');
    assert.match(r.supervisor.motivo, /separação prevista/i);
    assert.equal(r.supervisor.aplicada.lateral, 'direita');
    assert.ok(r.supervisor.separacaoPrevistaM >= r.missao.ameacaAtiva.raioProtecaoM);
  });

  it('termina como separação perdida caso o perímetro seja atravessado', () => {
    const m = criarMissao('porto');
    m.ameacaAtiva = { id: 'baloes', xM: m.voo.xM, zM: m.voo.zM + 1, altitudeM: m.voo.altitudeM, raioProtecaoM: 36, separacaoMinM: Infinity };
    const depois = avancarMissao(m, 0.1);
    assert.equal(depois.resultado, 'separacao_perdida');
    assert.ok(depois.separacoes[0].minimaM < 36);
  });
});

describe('contrato JEV', () => {
  it('recusa respostas incompletas ou probabilidades inválidas', () => {
    assert.equal(validarRespostas('incidente', { acaoMissao: { choice: 'prosseguir' } }).ok, false);
    const bad = decisao();
    bad.acaoMissao.probabilities.prosseguir = 1.4;
    assert.equal(validarRespostas('incidente', bad).ok, false);
  });

  it('aceita respostas tipadas completas', () => {
    assert.equal(validarRespostas('incidente', decisao()).ok, true);
    const media = decisao();
    media.urgencia.score = 1.47;
    assert.equal(validarRespostas('incidente', media).ok, true);
  });
});

describe('replays gravados', () => {
  for (const id of ['porto', 'medevac', 'carga', 'sar']) {
    it(`${id} reproduz as respostas JEV e o resultado sem rede`, async () => {
      const fixture = JSON.parse(await readFile(new URL(`../public/replays/${id}.json`, import.meta.url)));
      assert.equal(fixture.perfil, PERFIL.versao);
      assert.equal(validarRespostas('briefing', fixture.briefing.answers).ok, true);
      let m = criarMissao(id, fixture.semente, fixture.restricoes);
      const vistos = [];
      while (!m.resultado) {
        const evento = proximoEvento(m);
        if (evento) {
          vistos.push(evento.id);
          const gravada = fixture.eventos[evento.id];
          assert.ok(gravada, `evento ${evento.id} em falta`);
          assert.equal(validarRespostas('incidente', gravada.answers).ok, true);
          m = aplicarDecisao(m, gravada.answers, 'jev-replay').missao;
        }
        m = avancarMissao(m, 1);
      }
      assert.deepEqual(vistos, fixture.percurso.map((p) => p.id));
      assert.equal(m.resultado, fixture.resultado.tipo);
      assert.equal(Math.round(m.voo.tempoS), fixture.resultado.tempoS);
    });
  }
});

describe('relógio de passo fixo', () => {
  it('frames de dt variável dão o mesmo estado que passos de 1 s', () => {
    let fixo = criarMissao('porto', 222);
    for (let i = 0; i < 30; i++) fixo = avancarMissao(fixo, 1);
    let frames = criarMissao('porto', 222);
    const rnd = mulberry32(7);
    while (frames.passo < fixo.passo) frames = avancarMissao(frames, 0.004 + rnd() * 0.12, { ate: fixo.passo });
    assert.equal(frames.passo, 300);
    assert.deepEqual(frames.voo, fixo.voo);
  });

  it('ate pára no passo exacto e guarda o tempo que sobra', () => {
    const m = avancarMissao(criarMissao('medevac', 222), 1.25, { ate: 7 });
    assert.equal(m.passo, 7);
    assert.ok(Math.abs(m.acumuladorS - 0.55) < 1e-9);
    const depois = avancarMissao(m, 0);
    assert.equal(depois.passo, 12, 'a chamada seguinte consome o que sobrou');
  });

  it('parar corta antes do passo em que devolve verdadeiro', () => {
    const m = avancarMissao(criarMissao('porto', 222), 5, { parar: (x) => x.passo >= 3 });
    assert.equal(m.passo, 3);
  });

  it('o desenho interpola entre o passo anterior e o actual', () => {
    const m = avancarMissao(criarMissao('porto', 222), 0.15);
    const v = vooInterpolado(m);
    assert.ok(v.zM > m.vooAnterior.zM && v.zM < m.voo.zM);
    assert.ok(Math.abs((v.zM - m.vooAnterior.zM) / (m.voo.zM - m.vooAnterior.zM) - 0.5) < 1e-6);
    assert.equal(vooInterpolado(criarMissao('porto', 222)).zM, criarMissao('porto', 222).voo.zM, 'sem passo anterior desenha o actual');
  });
});
