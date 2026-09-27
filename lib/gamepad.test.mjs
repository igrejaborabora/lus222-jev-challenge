import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lerGamepad } from '../public/src/gamepad.js';

const pad = (dados = {}) => ({ connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [], ...dados });
const buttons = (valores) => Array.from({ length: 8 }, (_, i) => ({ value: valores[i] ?? 0, pressed: (valores[i] ?? 0) > 0 }));

describe('leitura de gamepad', () => {
  it('ignora ausentes, desligados e mapeamentos desconhecidos', () => {
    assert.equal(lerGamepad(), null);
    assert.equal(lerGamepad([null, pad({ connected: false }), pad({ mapping: '' })]), null);
    assert.equal(lerGamepad({ 0: null, length: 1 }), null);
  });

  it('um comando ligado mas neutro não toma controlo, incluindo ruído dos eixos', () => {
    assert.deepEqual(lerGamepad([pad({ axes: [0.11, -0.12, 0.08] })]), {
      activo: false, bankInput: 0, pitchInput: 0, rudder: 0, potenciaDelta: 0, travao: 0,
    });
  });

  it('preserva o sentido dos comandos e atinge o curso completo após a zona morta', () => {
    assert.deepEqual(lerGamepad([pad({ axes: [1, 1, -1], buttons: buttons({ 7: 1, 0: 0.6 }) })]), {
      activo: true, bankInput: 1, pitchInput: 1, rudder: -1, potenciaDelta: 1, travao: 0.6,
    });
    assert.equal(lerGamepad([pad({ axes: [0, -1, 0], buttons: buttons({ 6: 1 }) })]).pitchInput, -1);
    assert.equal(lerGamepad([pad({ buttons: buttons({ 6: 1 }) })]).potenciaDelta, -1);
    assert.ok(Math.abs(lerGamepad([pad({ axes: [0.56] })]).bankInput - 0.5) < 1e-9);
  });

  it('os dois gatilhos iguais anulam a mudança de potência', () => {
    assert.equal(lerGamepad([pad({ buttons: buttons({ 6: 0.8, 7: 0.8 }) })]).activo, false);
  });

  it('valores corrompidos não entram na física e valores excessivos são limitados', () => {
    const v = lerGamepad([pad({ axes: [NaN, Infinity, -4], buttons: buttons({ 7: NaN, 0: 8 }) })], { zonaMorta: NaN });
    assert.deepEqual(v, { activo: true, bankInput: 0, pitchInput: 0, rudder: -1, potenciaDelta: 0, travao: 1 });
    assert.equal(lerGamepad([pad({ axes: [0.5] })], { zonaMorta: 0 }).bankInput, 0.5);
  });

  it('prefere um segundo comando activo a um primeiro ligado mas parado', () => {
    assert.equal(lerGamepad([pad(), pad({ axes: [0, 1] })]).pitchInput, 1);
    assert.equal(lerGamepad([pad({ axes: [0, 1], connected: false })]), null);
  });
});
