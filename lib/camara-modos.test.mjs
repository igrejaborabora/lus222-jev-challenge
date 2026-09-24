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

  it('o evento ganha à abertura e não a retoma depois', () => {
    const c = registarEvento(novaCamara(0), 1);
    assert.equal(modoCamara(c, 1.5), 'evento');
    const cedo = registarEvento(novaCamara(0), 0.2);
    assert.equal(modoCamara(cedo, 0.2 + DURACAO_EVENTO_S + 0.1), 'cauda');
  });

  it('lado fica de través; cauda fica atrás e acima', () => {
    const pose = { x: 0, y: 480, z: 0, heading: 0 };
    const lado = alvoCamara('lado', pose);
    assert.ok(Math.abs(lado.pos.z) < 8 && Math.abs(lado.pos.x) > 20);
    const cauda = alvoCamara('cauda', pose);
    assert.ok(cauda.pos.z < -20 && cauda.pos.y > pose.y);
  });

  it('a abertura fica à direita do piloto (flanco com sol) e perto', () => {
    const pose = { x: 0, y: 480, z: 0, heading: 0 };
    assert.ok(alvoCamara('lado', pose).pos.x < 0);
    assert.ok(alvoCamara('abertura', pose).pos.x < 0);
    const distancia = (fit) => {
      const { pos } = alvoCamara('lado', pose, { fit });
      return Math.hypot(pos.x - pose.x, pos.z - pose.z);
    };
    assert.ok(distancia(1) <= 25);
    assert.ok(distancia(0.42) <= 49);
  });

  it('o evento enquadra avião e ameaça, com a câmara do lado oposto à ameaça', () => {
    const pose = { x: 0, y: 480, z: 0, heading: 0 };
    const focos = [
      { x: 22, y: 480, z: 800 }, // balões: 800 m à frente, 22 m à esquerda do piloto
      { x: 300, y: 480, z: 800 },
      { x: -300, y: 480, z: 800 },
    ];
    assert.ok(alvoCamara('evento', pose, { foco: focos[0] }).pos.x < 0);
    assert.ok(alvoCamara('evento', pose, { foco: focos[2] }).pos.x > 0);
    for (const aspecto of [0.46, 16 / 9]) {
      const fit = Math.min(1, Math.max(0.42, aspecto / 1.2));
      for (const foco of focos) {
        const cam = alvoCamara('evento', pose, { fit, foco });
        const aviao = projectar(cam, pose, aspecto);
        const ameaca = projectar(cam, foco, aspecto);
        const info = JSON.stringify({ aspecto, foco, aviao, ameaca });
        for (const ndc of [aviao, ameaca]) {
          assert.ok(ndc.z > 0 && Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1, info);
        }
        // Ameaça perto do centro: o selo de decisão (topo, ao centro) não lhe tapa a etiqueta.
        assert.ok(ameaca.y >= -0.05 && ameaca.y <= 0.15, info);
        // Avião com margem no quadro, abaixo da ameaça (ou quase à mesma altura).
        assert.ok(Math.abs(aviao.x) < 0.9 && Math.abs(aviao.y) < 0.9, info);
        assert.ok(aviao.y <= ameaca.y + 0.1, info);
      }
    }
  });
});

// Projecção perspectiva mínima: câmara em `pos` a olhar para `mira`, com +Y para cima.
function projectar({ pos, mira }, p, aspecto, fovV = 48) {
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const esc = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const vec = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const uni = (a) => {
    const l = Math.hypot(a.x, a.y, a.z);
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  };
  const frente = uni(sub(mira, pos));
  const direita = uni(vec(frente, { x: 0, y: 1, z: 0 }));
  const cima = vec(direita, frente);
  const d = sub(p, pos);
  const t = Math.tan((fovV / 2) * (Math.PI / 180));
  const z = esc(d, frente);
  return { x: esc(d, direita) / (z * t * aspecto), y: esc(d, cima) / (z * t), z };
}
