import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ambienteMeteorologico, CONFIGS_TEMPO, ventoInstantaneo } from '../public/src/meteorologia.js';
import { noiteAlvo, paletaCeu } from '../public/src/ambiente-visual.js';

describe('meteorologia controlada do simulador', () => {
  it('oferece cinco condições e começa ao anoitecer, com chão legível', () => {
    assert.deepEqual(CONFIGS_TEMPO.map((p) => p.id), ['limpo', 'poucas_nuvens', 'nublado', 'chuva', 'tempestade']);
    const ambiente = ambienteMeteorologico();
    assert.equal(ambiente.periodo, 'anoitecer');
    const luz = paletaCeu(noiteAlvo('porto', ambiente.luzDia, ambiente.periodo), ambiente);
    const noite = paletaCeu(noiteAlvo('porto', false, 'noite'), ambiente);
    assert.ok(luz.intensidadeCeu > 0.7);
    assert.ok(luz.intensidadeCeu > noite.intensidadeCeu * 1.5);
    assert.ok(luz.luzes > 0, 'as luzes urbanas já se acendem no crepúsculo');
  });

  it('separa cobertura, chuva e visibilidade, incluindo céu nublado seco', () => {
    const nublado = ambienteMeteorologico('nublado');
    assert.ok(nublado.cobertura > 0.8);
    assert.equal(nublado.chuva, 0);
    const chuva = ambienteMeteorologico('chuva', { cobertura: 0.6, visKm: 9 });
    assert.equal(chuva.cobertura, 0.6);
    assert.equal(chuva.visKm, 9);
    assert.ok(chuva.chuva > 0);
    assert.equal(ambienteMeteorologico('limpo', { visKm: 2 }).chuva, 0);
  });

  it('mantém dia e noite selecionáveis e contém entradas inválidas', () => {
    assert.equal(ambienteMeteorologico('limpo', { periodo: 'dia' }).luzDia, true);
    assert.equal(ambienteMeteorologico('limpo', { periodo: 'noite' }).luzDia, false);
    const a = ambienteMeteorologico('invalido', { cobertura: 3, chuva: -1, turbulencia: NaN, tetoFt: 0, ventoMs: { x: Infinity, z: 90 } });
    assert.equal(a.tempo, 'poucas_nuvens');
    assert.equal(a.cobertura, 1);
    assert.equal(a.chuva, 0);
    assert.equal(a.tetoFt, 200);
    assert.equal(a.ventoMs.z, 35);
    assert.ok(Number.isFinite(a.ventoMs.x));
  });

  it('repete o vento com a mesma semente e tempo, sem depender do número de frames', () => {
    const a = ambienteMeteorologico('tempestade');
    const v = ventoInstantaneo(a, 12.7, 222);
    assert.deepEqual(v, ventoInstantaneo(a, 12.7, 222));
    assert.notDeepEqual(v, ventoInstantaneo(a, 12.7, 333));
    assert.notDeepEqual(v, ventoInstantaneo(a, 13, 222));
    const antes = ventoInstantaneo(a, 12.699, 222);
    assert.ok(Math.abs(v.vertical - antes.vertical) < 0.01, 'sem saltos entre frames');
  });

  it('limita rajadas e remove-as quando a turbulência é zero', () => {
    const a = ambienteMeteorologico('tempestade');
    for (let t = 0; t < 300; t += 0.1) {
      const v = ventoInstantaneo(a, t, 222);
      assert.ok(Math.abs(v.x - a.ventoMs.x) <= 5);
      assert.ok(Math.abs(v.z - a.ventoMs.z) <= 4);
      assert.ok(Math.abs(v.vertical) <= 1.9);
    }
    assert.deepEqual(ventoInstantaneo({ ventoMs: { x: 2, z: -3 }, turbulencia: 0 }, 12), { x: 2, z: -3, vertical: 0 });
  });

  it('a tempestade reduz o sol mas preserva luz difusa para ler o terreno', () => {
    const limpo = paletaCeu(0.42, ambienteMeteorologico('limpo'));
    const tempestade = paletaCeu(0.42, ambienteMeteorologico('tempestade'));
    assert.ok(tempestade.intensidadeSol < limpo.intensidadeSol / 2);
    assert.ok(tempestade.intensidadeCeu > 0.6);
  });
});
