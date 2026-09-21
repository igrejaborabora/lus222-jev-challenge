import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarEvasao, novoAutomato, passoAutomato } from './automato.mjs';

describe('autómato de evasão', () => {
  it('subir e direita deslocam a aeronave para cima e mudam o rumo', () => {
    const a = novoAutomato();
    const y0 = a.y;
    const h0 = a.heading;
    aplicarEvasao(a, {
      acao: 'desviar_alternativo',
      vertical: 'subir',
      lateral: 'direita',
      urgencia: 3,
    });
    for (let i = 0; i < 50; i++) passoAutomato(a, 0.05);
    assert.ok(a.y > y0 + 8, `altitude ${a.y} vs ${y0}`);
    assert.ok(a.heading > h0 + 0.35, `heading ${a.heading} vs ${h0}`);
    assert.ok(a.bank < -0.1);
  });

  it('esquerda baixa o heading; descer reduz altitude', () => {
    const a = novoAutomato();
    a.y = 50;
    const h0 = a.heading;
    aplicarEvasao(a, { acao: 'desviar_alternativo', vertical: 'descer', lateral: 'esquerda', urgencia: 2 });
    for (let i = 0; i < 40; i++) passoAutomato(a, 0.05);
    assert.ok(a.heading < h0 - 0.25);
    assert.ok(a.y < 50);
  });
});
