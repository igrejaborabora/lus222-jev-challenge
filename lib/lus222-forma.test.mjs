import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  anelSuperelipse,
  aneisFuselagem,
  interpolarMonotono,
  loft,
  perfilNaca,
  seccaoEm,
  vDoTopo,
  vEmY,
} from './lus222-forma.mjs';

describe('forma do LUS-222', () => {
  it('interpolação monotónica não ultrapassa as estações', () => {
    const xs = [0, 1, 2, 3];
    const ys = [0, 1, 1, 0];
    for (let x = 0; x <= 3; x += 0.05) {
      const y = interpolarMonotono(xs, ys, x);
      assert.ok(y >= -1e-9 && y <= 1 + 1e-9, `x=${x} y=${y}`);
    }
    assert.equal(interpolarMonotono(xs, ys, 1.5), 1);
  });

  it('secção central tem flancos quase planos e ventre plano (não é charuto)', () => {
    const anel = anelSuperelipse(seccaoEm(0), 120);
    const sec = seccaoEm(0);
    const flanco = anel.pontos.filter(([x]) => x > sec.w * 0.97);
    const alturaFlanco = Math.max(...flanco.map((p) => p[1])) - Math.min(...flanco.map((p) => p[1]));
    assert.ok(alturaFlanco > 0.9, `flanco plano com ${alturaFlanco.toFixed(2)} de altura`);
    const ventre = anel.pontos.filter(([, y]) => y < sec.yc - sec.hBot * 0.97);
    const larguraVentre = Math.max(...ventre.map((p) => p[0])) - Math.min(...ventre.map((p) => p[0]));
    assert.ok(larguraVentre > 1.0, `ventre plano com ${larguraVentre.toFixed(2)} de largura`);
  });

  it('cauda sobe (rampa) e o nariz é uma cunha baixa', () => {
    const fundo = (z) => {
      const s = seccaoEm(z);
      return s.yc - s.hBot;
    };
    const topo = (z) => {
      const s = seccaoEm(z);
      return s.yc + s.hTop;
    };
    assert.ok(fundo(-5.5) > fundo(-3.5) + 0.8, 'ventre sobe para a cauda');
    assert.ok(Math.abs(topo(-5.5) - topo(0)) < 0.15, 'linha de topo quase recta até à deriva');
    // Na vista lateral da render o topo desce ~0,4 entre z = 3,9 e 5,0, em
    // linha recta (cunha), e o cone de cauda acaba ~0,45 abaixo do tecto.
    assert.ok(topo(5.0) < topo(3.9) - 0.35, 'para-brisas desce para o nariz');
    const meio = (topo(4.9) + topo(3.3)) / 2;
    assert.ok(Math.abs(topo(4.1) - meio) < 0.08, 'linha de topo do nariz é recta (cunha), não convexa');
    assert.ok(topo(-6.6) < topo(0) - 0.35, 'cone de cauda baixo, abaixo do tecto');
    assert.ok(seccaoEm(5.2).yc < 0, 'ponta do nariz abaixo do eixo');
  });

  it('anel começa no ventre, sobe pelo lado direito e fecha', () => {
    const anel = anelSuperelipse(seccaoEm(0), 40);
    const p = anel.pontos;
    assert.equal(p.length, 41);
    assert.ok(Math.abs(p[0][0]) < 1e-6 && p[0][1] < 0);
    assert.ok(p[10][0] > 0.9, 'quarto do anel no lado +X');
    assert.ok(p[20][1] > 1, 'meio do anel no topo');
    assert.deepEqual(p[40], p[0]);
  });

  it('V por y e a partir do topo batem com o anel', () => {
    const anel = anelSuperelipse(seccaoEm(0), 80);
    const vd = vEmY(anel, 0.2, 1);
    const ve = vEmY(anel, 0.2, -1);
    assert.ok(vd > 0 && vd < 0.5);
    assert.ok(ve > 0.5 && ve < 1);
    assert.ok(Math.abs(vd + ve - 1) < 0.02, 'simetria esquerda/direita');
    assert.equal(vDoTopo(anel, 0), 0.5);
    assert.ok(vDoTopo(anel, 0.3) < 0.5, 'arco para +X diminui V');
  });

  it('loft da fuselagem: índices válidos, sem NaN, normais para fora', () => {
    const { aneis, us, zMin, zMax } = aneisFuselagem({ nAneis: 30, nPontos: 24 });
    assert.ok(zMax > 5 && zMin < -6.5, 'nariz em +Z, cauda em -Z');
    const g = loft(aneis, { us, tampaInicio: true, tampaFim: true });
    const nV = g.posicoes.length / 3;
    assert.ok(g.indices.every((i) => Number.isInteger(i) && i >= 0 && i < nV));
    assert.ok(g.posicoes.every(Number.isFinite) && g.normais.every(Number.isFinite));
    assert.ok(g.uvs.every((v) => v >= 0 && v <= 1));
    // Vértice no flanco direito a meio: normal com componente +X dominante.
    const i = 15 * 25 + 6;
    assert.ok(g.posicoes[i * 3] > 0.9);
    assert.ok(g.normais[i * 3] > 0.8, `normal x=${g.normais[i * 3]}`);
    // Topo a meio: normal para cima.
    const t = 15 * 25 + 12;
    assert.ok(g.normais[t * 3 + 1] > 0.8);
  });

  it('costura em V=0/1 partilha a normal', () => {
    const { aneis, us } = aneisFuselagem({ nAneis: 12, nPontos: 20 });
    const g = loft(aneis, { us });
    const a = 5 * 21;
    const b = a + 20;
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(g.normais[a * 3 + k] - g.normais[b * 3 + k]) < 1e-9);
  });

  it('loft corrige a orientação quando os anéis vêm ao contrário', () => {
    const perfil = perfilNaca({ t: 0.14, n: 20 });
    const aneis = [-3, 0, 3].map((x) => perfil.map(([c, y]) => [x, y, -c]));
    for (const ordem of [aneis, [...aneis].reverse()]) {
      const g = loft(ordem);
      // Ponto do extradorso a meia corda: normal para cima.
      const j = perfil.findIndex(([c, y]) => c < 0.35 && y > 0.05);
      const v = (1 * perfil.length + j) * 3;
      assert.ok(g.normais[v + 1] > 0.5, `normal y=${g.normais[v + 1]}`);
    }
  });

  it('perfil NACA fecha no bordo de fuga e tem a espessura pedida', () => {
    const p = perfilNaca({ m: 0, t: 0.12, n: 40 });
    assert.deepEqual(p[p.length - 1], p[0]);
    const esp = Math.max(...p.map((q) => q[1])) - Math.min(...p.map((q) => q[1]));
    assert.ok(Math.abs(esp - 0.12) < 0.01, `espessura ${esp}`);
  });
});
