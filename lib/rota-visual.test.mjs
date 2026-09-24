import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alcanceM, pontosFitaRota, setaManobra } from './rota-visual.mjs';
import { criarMissao } from '../public/src/simulacao.js';

describe('rota visível', () => {
  it('a fita vai do avião ao destino activo e desce para a pista', () => {
    const m = criarMissao('porto', 222);
    const destino = m.destinos.find((d) => d.id === m.destinoId);
    const pts = pontosFitaRota(m.voo, destino);
    assert.deepEqual([pts[0].x, pts[0].z], [-m.voo.xM, m.voo.zM]);
    assert.deepEqual([pts.at(-1).x, pts.at(-1).z], [-destino.xM, destino.zM]);
    assert.ok(pts.at(-1).y < 60 && pts[0].y > 400);
  });

  it('o alcance chega ao destino com reserva e encolhe com menos combustível', () => {
    const m = criarMissao('porto', 222);
    const destino = m.destinos.find((d) => d.id === m.destinoId);
    const d = Math.hypot(destino.xM - m.voo.xM, destino.zM - m.voo.zM);
    assert.ok(alcanceM(m) > d);
    const pouco = { ...m, voo: { ...m.voo, combustivelKg: 200 } };
    assert.ok(alcanceM(pouco) < alcanceM(m));
  });

  it('com o destino a menos de 12 km a fita começa à altitude do avião', () => {
    const voo = { xM: 1000, zM: 50000, altitudeM: 480 };
    const pts = pontosFitaRota(voo, { xM: 1000, zM: 58000 });
    assert.equal(pts[0].y, 480);
    assert.equal(pts.at(-1).y, 30);
    assert.ok(pts.every((p, i) => i === 0 || p.y <= pts[i - 1].y));
  });

  it('o alcance não dispara quando o avião está em cima do destino', () => {
    const m = criarMissao('porto', 222);
    const destino = m.destinos.find((d) => d.id === m.destinoId);
    const emCima = { ...m, voo: { ...m.voo, xM: destino.xM, zM: destino.zM } };
    const aUmMetro = { ...m, voo: { ...m.voo, xM: destino.xM, zM: destino.zM - 1 } };
    assert.equal(alcanceM(emCima), alcanceM(aUmMetro));
  });

  it('a seta traduz os eixos da ordem', () => {
    assert.deepEqual(setaManobra({ lateral: 'direita', vertical: 'subir' }), { lateral: 1, vertical: 1 });
    assert.deepEqual(setaManobra({ lateral: 'esquerda', vertical: 'descer' }), { lateral: -1, vertical: -1 });
    assert.equal(setaManobra({ lateral: 'manter', vertical: 'manter' }), null);
  });
});
