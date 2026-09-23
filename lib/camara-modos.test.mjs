import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  alternarPreferido, alvoCamara, DURACAO_ABERTURA_S, DURACAO_EVENTO_S, modoCamara, novaCamara,
  registarEvento, registarInteracao, REGRESSO_APOS_S,
} from './camara-modos.mjs';

describe('modos de câmara', () => {
  it('abre de lado e depois vai para a cauda', () => {
    const c = novaCamara(0);
    assert.equal(modoCamara(c, 1), 'abertura');
    assert.equal(modoCamara(c, DURACAO_ABERTURA_S + 0.1), 'cauda');
    assert.equal(modoCamara(novaCamara(0, { abertura: false }), 0.1), 'cauda');
  });

  it('a órbita manual manda e volta à cauda depois de largar', () => {
    const c = registarInteracao(novaCamara(0), 10);
    assert.equal(modoCamara(c, 12), 'livre');
    assert.equal(modoCamara(c, 10 + REGRESSO_APOS_S + 0.1), 'cauda');
  });

  it('enquadra o evento e cede à interacção do utilizador', () => {
    const c = registarEvento(novaCamara(0), 20);
    assert.equal(modoCamara(c, 21), 'evento');
    assert.equal(modoCamara(c, 20 + DURACAO_EVENTO_S + 0.1), 'cauda');
    assert.equal(modoCamara(registarInteracao(c, 21), 21.5), 'livre');
  });

  it('o botão alterna cauda → lado → livre → cauda', () => {
    let c = novaCamara(0, { abertura: false });
    c = alternarPreferido(c);
    assert.equal(modoCamara(c, 1), 'lado');
    c = alternarPreferido(c);
    assert.equal(modoCamara(c, 1), 'livre');
    c = alternarPreferido(c);
    assert.equal(modoCamara(c, 1), 'cauda');
  });

  it('lado fica de través; cauda fica atrás e acima', () => {
    const pose = { x: 0, y: 480, z: 0, heading: 0 };
    const lado = alvoCamara('lado', pose);
    assert.ok(Math.abs(lado.pos.z) < 8 && Math.abs(lado.pos.x) > 25);
    const cauda = alvoCamara('cauda', pose);
    assert.ok(cauda.pos.z < -20 && cauda.pos.y > pose.y);
  });
});
