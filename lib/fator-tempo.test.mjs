import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ameacaIminente, fatorTempo } from './fator-tempo.mjs';
import { CENARIOS_SIM } from './simulacao.mjs';

const base = { espera: false, ameacaIminente: false, leitura: false, velocidade: 8 };

describe('factor do relógio simulado', () => {
  it('à espera do JEV com ameaça iminente pára, seja qual for a leitura ou a velocidade', () => {
    for (const velocidade of [1, 4, 8]) {
      assert.equal(fatorTempo({ ...base, espera: true, ameacaIminente: true, velocidade }), 0);
      assert.equal(fatorTempo({ ...base, espera: true, ameacaIminente: true, leitura: true, velocidade }), 0);
    }
  });

  it('à espera sem ameaça iminente corre a 1×, mesmo a ler uma ameaça a 8×', () => {
    assert.equal(fatorTempo({ ...base, espera: true }), 1);
    assert.equal(fatorTempo({ ...base, espera: true, leitura: true, velocidade: 8 }), 1);
    assert.equal(fatorTempo({ ...base, espera: true, velocidade: 1 }), 1);
  });

  it('a ler uma ameaça: a velocidade escolhida, no máximo 2×', () => {
    assert.equal(fatorTempo({ ...base, leitura: true, velocidade: 8 }), 2);
    assert.equal(fatorTempo({ ...base, leitura: true, velocidade: 4 }), 2);
    assert.equal(fatorTempo({ ...base, leitura: true, velocidade: 1 }), 1);
  });

  it('sem espera nem leitura: a velocidade escolhida', () => {
    for (const velocidade of [1, 4, 8]) assert.equal(fatorTempo({ ...base, velocidade }), velocidade);
  });

  it('ameaça iminente sem espera não conta: decide a leitura ou a velocidade', () => {
    assert.equal(fatorTempo({ ...base, ameacaIminente: true, velocidade: 8 }), 8);
    assert.equal(fatorTempo({ ...base, ameacaIminente: true, leitura: true, velocidade: 8 }), 2);
  });

  it('a leitura vale pela verdade do valor (ameacaAtiva ou leitura são objectos)', () => {
    assert.equal(fatorTempo({ ...base, leitura: { tipo: 'bando' }, velocidade: 8 }), 2);
    assert.equal(fatorTempo({ ...base, leitura: null, velocidade: 8 }), 8);
  });
});

describe('ameaça iminente', () => {
  it('até 15 s do contacto, inclusive', () => {
    assert.equal(ameacaIminente({ obstaculos: [{ segundos_ate_ao_contacto: 15 }] }), true);
    assert.equal(ameacaIminente({ obstaculos: [{ segundos_ate_ao_contacto: 16 }] }), false);
    assert.equal(ameacaIminente({ obstaculos: [{ segundos_ate_ao_contacto: 30 }, { segundos_ate_ao_contacto: 9 }] }), true);
  });

  it('sem evento ou sem obstáculos não há ameaça iminente', () => {
    assert.equal(ameacaIminente(null), false);
    assert.equal(ameacaIminente(undefined), false);
    assert.equal(ameacaIminente({}), false);
    assert.equal(ameacaIminente({ obstaculos: [] }), false);
  });

  it('as ameaças dos cenários suspendem o relógio; meteorologia e combustível não', () => {
    const evento = (c, id) => CENARIOS_SIM[c].eventos.find((e) => e.id === id);
    for (const [c, id] of [['porto', 'baloes'], ['porto', 'trafego_porto'], ['medevac', 'relevo'], ['carga', 'aves'], ['sar', 'trafego']]) {
      assert.equal(ameacaIminente(evento(c, id)), true, `${c}/${id}`);
    }
    assert.equal(ameacaIminente(evento('medevac', 'frente')), false);
    assert.equal(ameacaIminente(evento('sar', 'reserva')), false);
  });
});
