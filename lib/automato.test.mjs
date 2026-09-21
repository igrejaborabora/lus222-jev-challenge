import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarEvasao, novoAutomato, passoAutomato } from './automato.mjs';

describe('autómato de evasão', () => {
  it('subir e direita: sobe, nariz acima, vira à direita do ecrã', () => {
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
    assert.ok(a.heading < h0 - 0.35, `heading ${a.heading} vs ${h0}`);
    assert.ok(a.bank > 0.1, `bank ${a.bank}`);
    assert.ok(a.pitch < -0.05, `pitch ${a.pitch}`);
  });

  it('esquerda no ecrã sobe o heading; descer baixa altitude e o nariz', () => {
    const a = novoAutomato();
    a.y = 50;
    const h0 = a.heading;
    aplicarEvasao(a, { acao: 'desviar_alternativo', vertical: 'descer', lateral: 'esquerda', urgencia: 2 });
    for (let i = 0; i < 40; i++) passoAutomato(a, 0.05);
    assert.ok(a.heading > h0 + 0.25, `heading ${a.heading}`);
    assert.ok(a.y < 50);
    assert.ok(a.pitch > 0.02, `pitch ${a.pitch}`);
    assert.ok(a.bank < -0.05, `bank ${a.bank}`);
  });

  it('o último eixo continua depois da janela de dodge', () => {
    const a = novoAutomato();
    const h0 = a.heading;
    aplicarEvasao(a, { acao: 'desviar_alternativo', vertical: 'manter', lateral: 'direita', urgencia: 2 });
    for (let i = 0; i < 90; i++) passoAutomato(a, 0.05);
    assert.ok(a.dodgeT === 0);
    assert.ok(a.heading < h0 - 0.5);
    const h = a.heading;
    passoAutomato(a, 0.05);
    assert.ok(a.heading < h);
  });
});
