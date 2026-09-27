import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularMotores, novosComandosMotores, normalizarComandosMotores, AUTORIDADE_LEME_RAD_S } from '../public/src/engine-model.js';
import { criarVooProgressivo, criarVooLivre } from '../public/src/simulador.js';
import { comandarMotor, reporMotores, normalizarControlos, passoProgressivo, novosControlos } from '../public/src/voo-progressivo.js';
import { PERFIL, avancarMissao, preverActuacao, alturaChaoM } from '../public/src/simulacao.js';
import { darOrdem } from '../public/src/piloto-sim.js';

const neutra = { lateral: 'nivelar', vertical: 'manter', potencia: 'manter', fonte: 'humano' };
const criar = (exercicio = 'livre') => ({ ...criarVooProgressivo(222, { exercicio, tempo: 'limpo' }),
  diretor: null, circuito: null, controlos: { ...novosControlos(), modo: 'avancado', protecao: false },
  ambiente: { ventoMs: { x: 0, z: 0 }, turbulencia: 0 } });
const passo = (m, a = neutra) => ({ ...m, voo: passoProgressivo(m, a, 0.1, PERFIL, (x, z) => alturaChaoM(m, x, z)) });
const correr = (m, n = 100, a = neutra) => { for (let i = 0; i < n; i++) m = passo(m, a); return m; };
const perto = (actual, esperado, erro = 1e-9) => assert.ok(Math.abs(actual - esperado) < erro, `${actual} ≈ ${esperado}`);

function numerosFinitos(obj) {
  for (const valor of Object.values(obj)) {
    if (typeof valor === 'number') assert.ok(Number.isFinite(valor));
    else if (valor && typeof valor === 'object') numerosFinitos(valor);
  }
}

test('dois motores nominais preservam exactamente as leis de empuxo e consumo anteriores', () => {
  for (const altitudeM of [0, 480, 1950, 10000]) for (const acelerador of [0, 0.15, 0.55, 1]) {
    const estado = calcularMotores({ altitudeM, acelerador, combustivelKg: 600 }, {}, PERFIL);
    assert.equal(estado.empuxoTotalN, PERFIL.empuxoMaxN * acelerador * Math.max(0.55, 1 - altitudeM / 13000));
    assert.equal(estado.consumoTotalKgS, 0.026 + 0.115 * acelerador);
    assert.equal(estado.guinadaRadS, 0);
    assert.equal(estado.potenciaTotal, acelerador);
    assert.equal(estado.esquerdo.estado, 'operacional');
    assert.equal(estado.direito.estado, 'operacional');
  }
});

test('a falha é explícita, independente e não se propaga ao motor oposto', () => {
  const inicio = criar();
  const falha = comandarMotor(inicio, 'esquerdo', { falha: true });
  assert.equal(inicio.controlos.motores.esquerdo.falha, false);
  assert.equal(falha.voo.motores.esquerdo.estado, 'falha', 'leitura imediata, mesmo em pausa');
  assert.equal(falha.voo.motores.direito.estado, 'operacional');
  assert.equal(falha.voo.motores.esquerdo.empuxoN, 0);
  assert.equal(falha.voo.motores.esquerdo.consumoKgS, 0);
  assert.equal(falha.voo.motores.empuxoTotalN, inicio.voo.motores.empuxoTotalN / 2);
  assert.equal(falha.voo.motores.consumoTotalKgS, inicio.voo.motores.consumoTotalKgS / 2);
  assert.equal(correr(falha, 600).voo.motores.esquerdo.estado, 'falha', 'só um comando recupera o motor');
  const nominal = correr(inicio, 600);
  assert.equal(nominal.voo.motores.esquerdo.estado, 'operacional');
  assert.equal(nominal.voo.motores.direito.estado, 'operacional', 'não existem falhas aleatórias');
});

test('falhar um motor reduz aceleração e consumo medido, para igual comando comum', () => {
  const m = criar(), n = correr(m), f = correr(comandarMotor(m, 'esquerdo', { falha: true }));
  assert.ok(f.voo.velocidadeMs < n.voo.velocidadeMs - 3);
  perto(m.voo.combustivelKg - f.voo.combustivelKg, (m.voo.combustivelKg - n.voo.combustivelKg) / 2);
  assert.equal(f.voo.acelerador, n.voo.acelerador);
  assert.equal(f.voo.potencia, n.voo.potencia / 2);
});

test('guinada aponta para o motor avariado e leme oposto compensa a assimetria', () => {
  const m = criar();
  for (const [lado, sinal] of [['esquerdo', -1], ['direito', 1]]) {
    const falha = comandarMotor(m, lado, { falha: true });
    const livre = correr(falha);
    assert.ok((livre.voo.rumoRad - m.voo.rumoRad) * sinal > 0.05);
    assert.ok(falha.voo.motores.lemeCompensacao * sinal < 0);
    perto(falha.voo.motores.guinadaRadS + falha.voo.motores.lemeCompensacao * AUTORIDADE_LEME_RAD_S, 0);
    const compensado = correr({ ...falha, controlos: { ...falha.controlos, leme: falha.voo.motores.lemeCompensacao } });
    perto(compensado.voo.rumoRad, m.voo.rumoRad);
    assert.equal(compensado.voo.superficies.rudder, falha.voo.motores.lemeCompensacao);
  }
});

test('potência independente altera só o motor seleccionado; null volta ao comando comum', () => {
  const m = criar();
  const reduzido = comandarMotor(m, 'direito', { acelerador: 0.2 });
  assert.equal(reduzido.voo.motores.direito.potencia, 0.2);
  assert.equal(reduzido.voo.motores.esquerdo.potencia, 0.55);
  assert.ok(reduzido.voo.motores.guinadaRadS > 0);
  const restaurado = comandarMotor(reduzido, 'direito', { acelerador: null });
  assert.deepEqual(restaurado.voo.motores, m.voo.motores);
  const ambos = comandarMotor(comandarMotor(m, 'esquerdo', { falha: true }), 'direito', { falha: true });
  assert.equal(ambos.voo.motores.empuxoTotalN, 0);
  assert.equal(ambos.voo.motores.consumoTotalKgS, 0);
  assert.equal(ambos.voo.motores.guinadaRadS, 0);
  assert.equal(correr(ambos).voo.combustivelKg, m.voo.combustivelKg);
});

test('reset restaura as leituras e o passo nominal sem alterar a posição ou outros controlos', () => {
  const m = criar();
  m.controlos = { ...m.controlos, leme: 0.12, flaps: 0.3, trim: 0.1 };
  const alterado = comandarMotor(comandarMotor(m, 'esquerdo', { falha: true }), 'direito', { acelerador: 0.1 });
  const reposto = reporMotores(alterado);
  assert.deepEqual(reposto.controlos, m.controlos);
  assert.deepEqual(reposto.voo, m.voo);
  assert.deepEqual(passo(reposto).voo, passo(m).voo);
  const soRecuperado = comandarMotor(alterado, 'esquerdo', { falha: false });
  assert.equal(soRecuperado.voo.motores.esquerdo.estado, 'operacional');
  assert.equal(soRecuperado.controlos.motores.direito.acelerador, 0.1);
});

test('sem combustível não há empuxo nem consumo e reset não reabastece', () => {
  const m = criar();
  m.voo = { ...m.voo, combustivelKg: 0 };
  const reposto = reporMotores(comandarMotor(m, 'direito', { falha: true }));
  for (const lado of ['esquerdo', 'direito']) assert.equal(reposto.voo.motores[lado].estado, 'sem_combustivel');
  const voo = passo(reposto).voo;
  assert.equal(voo.combustivelKg, 0);
  assert.equal(voo.motores.empuxoTotalN, 0);
  assert.equal(voo.motores.consumoTotalKgS, 0);
  numerosFinitos(voo);
});

test('limites rejeitam valores não finitos sem introduzir NaN no voo', () => {
  const c = normalizarControlos({ motores: { esquerdo: { falha: 'true', acelerador: Infinity }, direito: { acelerador: -10 } }, leme: NaN });
  assert.deepEqual(c.motores.esquerdo, { falha: false, acelerador: null });
  assert.deepEqual(c.motores.direito, { falha: false, acelerador: 0 });
  assert.equal(normalizarComandosMotores({ esquerdo: { acelerador: 8 } }).esquerdo.acelerador, 1);
  assert.deepEqual(normalizarComandosMotores(null), novosComandosMotores());
  numerosFinitos(correr({ ...criar(), controlos: c }).voo);
  numerosFinitos(calcularMotores({ altitudeM: Infinity, acelerador: NaN, combustivelKg: NaN }, {}, { empuxoMaxN: Infinity }));
  assert.equal(comandarMotor(criar(), 'ausente', { falha: true }).controlos.motores.esquerdo.falha, false);
});

test('no solo a assimetria tem sinal correcto e ambos os motores parados não criam movimento', () => {
  const m = criar('solo');
  m.controlos = { ...m.controlos, acelerador: 1, travao: 0 };
  const esquerdo = correr(comandarMotor(m, 'esquerdo', { falha: true }));
  const direito = correr(comandarMotor(m, 'direito', { falha: true }));
  assert.ok(esquerdo.voo.rumoRad < 0);
  assert.ok(direito.voo.rumoRad > 0);
  const desligado = correr(comandarMotor(comandarMotor(m, 'esquerdo', { falha: true }), 'direito', { falha: true }));
  assert.equal(desligado.voo.velocidadeMs, 0);
  assert.equal(desligado.voo.rumoRad, 0);
  numerosFinitos(desligado.voo);
});

test('previsão e execução usam o mesmo motor avariado em passos fixos', () => {
  const m = comandarMotor(criar(), 'esquerdo', { falha: true });
  const ordem = { ...neutra, lateral: 'direita', potencia: 'mais' };
  const prev = preverActuacao(m, ordem, { horizonteS: 5, aplicarS: 8 });
  const real = avancarMissao({ ...m, piloto: darOrdem(m.piloto, ordem, 0, 8) }, 5);
  assert.deepEqual(prev.vooFinal, real.voo);
});

test('falha é determinística com ritmos de frames diferentes', () => {
  const m = comandarMotor(criar(), 'direito', { falha: true });
  let fraccionado = m;
  for (let i = 0; i < 100; i++) {
    fraccionado = avancarMissao(fraccionado, 0.03);
    fraccionado = avancarMissao(fraccionado, 0.07);
  }
  assert.deepEqual(fraccionado.voo, avancarMissao(m, 10).voo);
});

test('trajectórias nominais mantêm os valores anteriores à adição do modelo bimotor', () => {
  const campos = ['xM', 'zM', 'altitudeM', 'velocidadeMs', 'rumoRad', 'pitchRad', 'combustivelKg', 'distanciaPercorridaM'];
  const esperado = {
    livre: [-3459.080207130129, 151826.9324349452, 480, 92.31760464860112, 1.2, 0.07367978307643984, 599.1075000000023, 902.2366181104986],
    solo: [0, 163400, 4.25, 0, 0, 0, 599.739999999997, 0],
    aproximacao: [0, 160558.67471668858, 195, 68.20967004230411, 0, 0.13058783183601, 599.165000000005, 658.6747166885145],
  };
  for (const exercicio of Object.keys(esperado)) {
    const m = criar(exercicio);
    m.controlos = novosControlos();
    const voo = correr(m).voo;
    assert.deepEqual(campos.map(k => voo[k]), esperado[exercicio], exercicio);
  }
});

test('comandos de exercício não alteram missões nem trajectória do perfil histórico', () => {
  const m = { ...criarVooLivre(222), diretor: null };
  assert.equal(m.perfil, 'ilustrativo-3');
  assert.equal(comandarMotor(m, 'esquerdo', { falha: true }), m);
  assert.equal(reporMotores(m), m);
  const voo = avancarMissao(m, 10).voo;
  assert.equal(voo.motores, undefined);
  assert.deepEqual([voo.xM, voo.zM, voo.velocidadeMs, voo.combustivelKg], [-4329.246745138813, 141844.25195471462, 92.31760464860112, 599.1075000000023]);
});


test('recuperação da perda exige ganhar velocidade; potência máxima recupera antes de idle', () => {
  const m = criar();
  m.voo = { ...m.voo, velocidadeMs: 25, altitudeM: 600, altitudeAlvoM: 600 };
  const idle = { ...m, controlos: { ...m.controlos, acelerador: 0 } };
  const potencia = { ...m, controlos: { ...m.controlos, acelerador: 1 } };
  assert.equal(passo(idle).voo.stall, true);
  assert.equal(passo(potencia).voo.stall, true);
  const recuperado = correr(potencia).voo, lento = correr(idle).voo;
  assert.equal(recuperado.stall, false);
  assert.equal(lento.stall, true);
  assert.ok(recuperado.velocidadeMs > lento.velocidadeMs + 10);
  assert.ok(recuperado.altitudeM > lento.altitudeM + 20);
  assert.ok(recuperado.altitudeM < m.voo.altitudeM, 'recuperar ainda custa altitude');
});

test('vento lateral mantém deriva nominal em voo e não arrasta o avião parado no solo', () => {
  for (const exercicio of ['livre', 'solo']) {
    const m = criar(exercicio);
    const calmo = correr(m).voo;
    const vento = correr({ ...m, ambiente: { ...m.ambiente, ventoMs: { x: 10, z: 0 } } }).voo;
    perto(vento.xM - calmo.xM, exercicio === 'livre' ? 100 : 0);
    assert.equal(vento.zM, calmo.zM);
    assert.equal(vento.rumoRad, calmo.rumoRad);
    assert.equal(vento.velocidadeMs, calmo.velocidadeMs);
  }
});

test('o último passo de combustível deixa leituras de motores sem alimentação', () => {
  const m = criar();
  m.voo = { ...m.voo, combustivelKg: 0.0001 };
  const voo = passo(m).voo;
  assert.equal(voo.combustivelKg, 0);
  assert.equal(voo.motores.esquerdo.estado, 'sem_combustivel');
  assert.equal(voo.motores.direito.estado, 'sem_combustivel');
  assert.equal(voo.motores.empuxoTotalN, 0);
  assert.equal(voo.motores.consumoTotalKgS, 0);
  numerosFinitos(voo);
});
