import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  alternarPreferido, alvoCamara, DURACAO_ABERTURA_S, DURACAO_EVENTO_S, modoCamara, novaCamara,
  PLANO_CINEMA_S, planoCinema, registarEvento, registarInteracao, REGRESSO_APOS_S,
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

  it('a cauda manual ignora abertura e eventos sem alterar os cortes do piloto JEV', () => {
    const c = novaCamara(0);
    assert.equal(modoCamara(c, 0.1, { manual: true }), 'cauda');
    assert.equal(modoCamara(c, 0.1), 'abertura');
    const evento = registarEvento(c, 20);
    assert.equal(modoCamara(evento, 21, { manual: true }), 'cauda');
    assert.equal(modoCamara(evento, 21), 'evento');
    assert.equal(modoCamara(registarInteracao(evento, 21), 21.1, { manual: true }), 'livre');
    assert.equal(modoCamara({ ...c, preferido: 'livre' }, 0.1, { manual: true }), 'livre');
    assert.equal(modoCamara({ ...c, preferido: 'cinema' }, 10, { manual: true }), 'cinema');
  });

  it('o botão alterna cauda → cockpit → lado → cinema → livre → cauda', () => {
    let c = novaCamara(0, { abertura: false });
    c = alternarPreferido(c);
    assert.equal(modoCamara(c, 1), 'cockpit');
    c = alternarPreferido(c);
    assert.equal(modoCamara(c, 1), 'lado');
    c = alternarPreferido(c);
    assert.equal(modoCamara(c, 1), 'cinema');
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
function projectar({ pos, mira, up = { x: 0, y: 1, z: 0 } }, p, aspecto, fovV = 48) {
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const esc = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const vec = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const uni = (a) => {
    const l = Math.hypot(a.x, a.y, a.z);
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  };
  const frente = uni(sub(mira, pos));
  const direita = uni(vec(frente, up));
  const cima = vec(direita, frente);
  const d = sub(p, pos);
  const t = Math.tan((fovV / 2) * (Math.PI / 180));
  const z = esc(d, frente);
  return { x: esc(d, direita) / (z * t * aspecto), y: esc(d, cima) / (z * t), z };
}

describe('câmara cinema', () => {
  it('muda de plano a cada 7 s e enquadra o marco quando o há', () => {
    assert.deepEqual([0, 1, 2, 3, 4].map((k) => planoCinema(k * PLANO_CINEMA_S + 1)), ['alto', 'lado', 'frente', 'orbita', 'alto']);
    const pose = { x: 0, y: 480, z: 0, heading: 0 };
    for (let t = 0; t < 4 * PLANO_CINEMA_S; t += PLANO_CINEMA_S) {
      const { pos, mira } = alvoCamara('cinema', pose, { agoraS: t + 1 });
      assert.ok([pos.x, pos.y, pos.z, mira.x, mira.y, mira.z].every(Number.isFinite));
    }
    assert.ok(alvoCamara('cinema', pose, { agoraS: 2 * PLANO_CINEMA_S + 1 }).pos.z > 20, 'o plano de frente fica à frente do nariz');
    assert.ok(alvoCamara('cinema', pose, { agoraS: 1 }).mira.y < pose.y - 100, 'a perseguição alta olha para a paisagem');
    const foco = { x: 300, y: 40, z: 1500 };
    const comMarco = alvoCamara('cinema', pose, { agoraS: 1, foco });
    assert.deepEqual(comMarco.mira, foco);
    assert.ok(comMarco.pos.z < 0 && comMarco.pos.x < 0, 'atrás e do lado oposto ao marco');
  });
});


describe('vista de pilotagem', () => {
  it('os eventos e a abertura não interrompem a vista frontal escolhida', () => {
    const c = alternarPreferido(novaCamara(0));
    assert.equal(modoCamara(c, 0.1), 'cockpit');
    assert.equal(modoCamara(registarEvento(c, 0.2), 0.3), 'cockpit');
    assert.equal(modoCamara(registarInteracao(c, 1), 1.1), 'livre');
    assert.equal(modoCamara(registarInteracao(c, 1), 6), 'cockpit');
  });

  it('segue o rumo e o nariz acima/abaixo sem deslocar a posição para trás', () => {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (const pitch of [-0.2, 0, 0.2]) {
        const pose = { x: 40, y: 2.3, z: 150, heading, pitch, bank: 0.5 };
        const { pos, mira, up } = alvoCamara('cockpit', pose);
        const dx = mira.x - pos.x;
        const dy = mira.y - pos.y;
        const dz = mira.z - pos.z;
        assert.ok(Math.abs(Math.hypot(dx, dy, dz) - 200) < 1e-9);
        assert.ok(Math.abs(dy + Math.sin(pitch) * 200) < 1e-9);
        assert.ok(dx * Math.sin(heading) + dz * Math.cos(heading) > 190);
        assert.ok((pos.x - pose.x) * Math.sin(heading) + (pos.z - pose.z) * Math.cos(heading) > 4);
        assert.notDeepEqual(alvoCamara('cockpit', { ...pose, bank: -0.5 }).up, up);
      }
    }
  });

  it('tolera poses antigas sem pitch e não depende do enquadramento de ecrã', () => {
    const pose = { x: 0, y: 480, z: 0, heading: 0 };
    const cam = alvoCamara('cockpit', pose, { fit: 0.42 });
    assert.deepEqual(cam, alvoCamara('cockpit', pose));
    assert.equal(cam.pos.y, cam.mira.y);
  });
});


describe('cauda acompanha a atitude vertical', () => {
  const rad = graus => graus * Math.PI / 180;
  const pontosAviao = [[0, -0.4, 7.3], [0, 0.8, -9.1], [-10.8, 1.65, 0.5], [10.8, 1.65, 0.5], [0, 4.65, -8.4], [0, -2.25, 5.2]];
  function noMundo([x, y, z], pose) {
    const xb = x * Math.cos(pose.bank) - y * Math.sin(pose.bank);
    const yb = x * Math.sin(pose.bank) + y * Math.cos(pose.bank);
    const yp = yb * Math.cos(pose.pitch) - z * Math.sin(pose.pitch);
    const zp = yb * Math.sin(pose.pitch) + z * Math.cos(pose.pitch);
    return {
      x: pose.x + xb * Math.cos(pose.heading) + zp * Math.sin(pose.heading),
      y: pose.y + yp,
      z: pose.z - xb * Math.sin(pose.heading) + zp * Math.cos(pose.heading),
    };
  }

  it('mostra mais terreno ao baixar o nariz e mais céu ao levantá-lo', () => {
    for (const heading of [0, 1.2, -2]) {
      const pose = { x: 20, y: 480, z: 40, heading, bank: 0 };
      const horizonte = { x: pose.x + Math.sin(heading) * 2000, y: pose.y, z: pose.z + Math.cos(heading) * 2000 };
      const nivel = projectar(alvoCamara('cauda', { ...pose, pitch: 0 }), horizonte, 16 / 9);
      const descer = projectar(alvoCamara('cauda', { ...pose, pitch: rad(20) }), horizonte, 16 / 9);
      const subir = projectar(alvoCamara('cauda', { ...pose, pitch: rad(-20) }), horizonte, 16 / 9);
      assert.ok(descer.y > nivel.y + 0.4, 'em descida o horizonte sobe no ecrã e revela o terreno');
      assert.ok(subir.y < nivel.y - 0.4, 'em subida o horizonte desce no ecrã e revela o céu');
    }
  });

  it('enquadra nariz, cauda e asas até 80° em desktop e telemóvel', () => {
    for (const aspecto of [0.46, 16 / 9]) {
      const fit = Math.min(1, Math.max(0.42, aspecto / 1.2));
      for (const pitch of [-80, -45, -20, 0, 20, 45, 80]) {
        for (const bank of [-25, 0, 25]) {
          const pose = { x: 20, y: 480, z: 40, heading: 1.2, pitch: rad(pitch), bank: rad(bank) };
          const cam = alvoCamara('cauda', pose, { fit });
          for (const p of pontosAviao) {
            const ndc = projectar(cam, noMundo(p, pose), aspecto);
            assert.ok(ndc.z > 0 && Math.abs(ndc.x) < 0.98 && Math.abs(ndc.y) < 0.9, JSON.stringify({ aspecto, pitch, bank, ponto: p, ndc }));
          }
        }
      }
    }
  });

  it('ameaças distantes não achatam a picada na cauda manual', () => {
    const pose = { x: 0, y: 250, z: 0, heading: 0, pitch: rad(28), bank: 0 };
    const look = { x: 300, y: 480, z: 4500 };
    const manual = alvoCamara('cauda', pose, { manual: true });
    assert.deepEqual(alvoCamara('cauda', pose, { manual: true, look }), manual);
    const auto = alvoCamara('cauda', pose);
    assert.notDeepEqual(alvoCamara('cauda', pose, { look }), auto, 'a apresentação automática mantém o enquadramento das ameaças');
    const inclinacao = Math.atan2(manual.mira.y - manual.pos.y, Math.hypot(manual.mira.x - manual.pos.x, manual.mira.z - manual.pos.z));
    assert.ok(inclinacao < rad(-20), 'a câmara olha claramente para baixo durante a picada');
  });

  it('a cauda manual mantém o avião acima do painel com o view offset do simulador', () => {
    // Reservas medidas no layout: instrumentos a 66% do desktop e 51% do telemóvel.
    for (const { aspecto, topoPainel } of [{ aspecto: 16 / 9, topoPainel: 0.66 }, { aspecto: 0.46, topoPainel: 0.51 }]) {
      const fit = Math.min(1, Math.max(0.42, aspecto / 1.2));
      const offsetNdc = 2 * (1 - topoPainel) * 0.4;
      for (const pitch of [-40, -20, 0, 20, 28, 45, 65, 80]) {
        for (const bank of [-25, 0, 25]) {
          const pose = { x: 20, y: 480, z: 40, heading: 1.2, pitch: rad(pitch), bank: rad(bank) };
          const cam = alvoCamara('cauda', pose, { fit, manual: true });
          for (const p of pontosAviao) {
            const ndc = projectar(cam, noMundo(p, pose), aspecto);
            const y = ndc.y + offsetNdc;
            assert.ok(ndc.z > 0 && Math.abs(ndc.x) < 0.98 && y < 0.92 && y > 1 - 2 * topoPainel + 0.04,
              JSON.stringify({ aspecto, pitch, bank, ponto: p, ndc, y, topoPainel }));
          }
        }
      }
    }
  });

  it('preserva a escala vertical real e aceita poses sem pitch', () => {
    const pose = { x: 0, y: 480, z: 0, heading: 0, pitch: rad(60) };
    const cam = alvoCamara('cauda', pose);
    const alto = alvoCamara('cauda', { ...pose, y: pose.y + 150 });
    assert.ok(Math.abs(alto.pos.y - cam.pos.y - 150) < 1e-9);
    assert.ok(Math.abs(alto.mira.y - cam.mira.y - 150) < 1e-9);
    assert.deepEqual(alvoCamara('cauda', { ...pose, pitch: undefined }), alvoCamara('cauda', { ...pose, pitch: 0 }));
  });

  it('a vista lateral mantém a leitura do nariz para baixo na picada', () => {
    const pose = { x: 0, y: 480, z: 0, heading: 0, pitch: rad(60), bank: 0 };
    const cam = alvoCamara('lado', pose);
    const nariz = projectar(cam, noMundo(pontosAviao[0], pose), 16 / 9);
    const cauda = projectar(cam, noMundo(pontosAviao[1], pose), 16 / 9);
    assert.ok(nariz.y < cauda.y - 0.4);
    for (const p of [nariz, cauda]) assert.ok(p.z > 0 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1);
  });
});


describe('cockpit preso à aeronave', () => {
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  it('o eixo cima é unitário e perpendicular à mira, mesmo em atitude vertical', () => {
    for (const heading of [0, 1.3, -2.8]) for (const pitch of [-Math.PI / 2, -0.8, 0, 0.8, Math.PI / 2]) for (const bank of [-2, -0.6, 0, 0.6, 2]) {
      const pose = { x: 8, y: 450, z: 19, heading, pitch, bank };
      const { pos, mira, up } = alvoCamara('cockpit', pose);
      const dir = { x: (mira.x - pos.x) / 200, y: (mira.y - pos.y) / 200, z: (mira.z - pos.z) / 200 };
      assert.ok(Math.abs(dot(up, up) - 1) < 1e-12);
      assert.ok(Math.abs(dot(up, dir)) < 1e-12);
      const assento = { x: pos.x - pose.x, y: pos.y - pose.y, z: pos.z - pose.z };
      assert.ok(Math.abs(dot(assento, dir) - 4.4) < 1e-10);
      assert.ok(Math.abs(dot(assento, up) - 1.1) < 1e-10);
    }
  });

  it('a curva à direita inclina o horizonte para cima à direita no ecrã', () => {
    const pose = { x: 0, y: 480, z: 0, heading: 0, pitch: 0, bank: 0.4 };
    const cam = alvoCamara('cockpit', pose);
    const esquerda = projectar(cam, { x: 1000, y: 480, z: 2000 }, 16 / 9);
    const direita = projectar(cam, { x: -1000, y: 480, z: 2000 }, 16 / 9);
    assert.ok(direita.x > esquerda.x);
    assert.ok(direita.y > esquerda.y + 0.3);
    const reverso = alvoCamara('cockpit', { ...pose, bank: -pose.bank });
    assert.ok(projectar(reverso, { x: -1000, y: 480, z: 2000 }, 16 / 9).y < projectar(reverso, { x: 1000, y: 480, z: 2000 }, 16 / 9).y);
  });
});
