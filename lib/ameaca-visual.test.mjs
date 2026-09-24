import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alturaAteFolga, emLeitura, leituraAmeaca } from '../public/src/ameaca-visual.js';
import { CENARIOS_SIM } from '../public/src/simulacao.js';

const obstaculosDe = (cenario, id) => CENARIOS_SIM[cenario].eventos.find((e) => e.id === id).obstaculos;
const voo = { xM: 0, zM: 40000, rumoRad: 0, velocidadeMs: 88, tempoS: 600 };
const avancar = (v, s, rumo = v.rumoRad) => ({ ...v, xM: v.xM + Math.sin(rumo) * v.velocidadeMs * s, zM: v.zM + Math.cos(rumo) * v.velocidadeMs * s, tempoS: v.tempoS + s });

describe('leitura das ameaças no caminho (aves, tráfego, relevo)', () => {
  it('sem obstáculos em rota não há leitura; com vários, conta o mais próximo', () => {
    assert.equal(leituraAmeaca(voo, []), null);
    assert.equal(leituraAmeaca(voo, [{ tipo: 'bando', em_rota: false, distancia_m: 300 }]), null);
    const l = leituraAmeaca(voo, [{ tipo: 'relevo', em_rota: true, distancia_m: 900 }, { tipo: 'bando', em_rota: true, distancia_m: 400 }]);
    assert.equal(l.tipo, 'bando');
    assert.equal(l.distanciaM, 400);
  });

  it('aves da Carga: fica em leitura até o bando ficar para trás', () => {
    const l = leituraAmeaca(voo, obstaculosDe('carga', 'aves'));
    assert.equal(l.tipo, 'bando');
    assert.ok(emLeitura(l, voo));
    assert.ok(emLeitura(l, avancar(voo, 6)), 'a 528 m do início o bando (600 m) ainda está à frente');
    assert.ok(!emLeitura(l, avancar(voo, 8)), '704 m depois já passou (600 m + 60 m de margem)');
  });

  it('a leitura tem um fim no tempo mesmo que o avião nunca passe a ameaça', () => {
    const l = leituraAmeaca(voo, obstaculosDe('medevac', 'relevo'));
    const aVoltar = avancar(voo, 3, Math.PI);
    assert.ok(emLeitura(l, aVoltar));
    assert.ok(!emLeitura(l, { ...aVoltar, tempoS: l.ateS }));
    assert.ok(l.ateS - voo.tempoS < 30, 'limitada: passagem prevista mais uma margem curta');
  });

  it('usa o tempo até ao contacto do evento quando é maior do que a distância a esta velocidade', () => {
    const lento = leituraAmeaca({ ...voo, velocidadeMs: 200 }, obstaculosDe('sar', 'trafego'));
    assert.ok(lento.ateS - voo.tempoS >= 12);
  });
});

describe('obstáculos no chão à folga que o JEV lê', () => {
  it('relevo da MEDEVAC: 110 m de folga por cima a 480 m põem o topo a 370 m', () => {
    const [o] = obstaculosDe('medevac', 'relevo');
    assert.equal(alturaAteFolga(o.folga_por_cima_m, 480, 0, o.altura_m), 370);
    assert.equal(alturaAteFolga(o.folga_por_cima_m, 480, 50, o.altura_m), 320, 'sobe do chão até ao mesmo topo');
  });

  it('folga negativa: o topo fica acima do avião', () => {
    assert.equal(alturaAteFolga(-20, 300, 0, 56), 320);
  });

  it('nunca abaixo de 4 m (chão acima do topo pedido), e sem folga fica a altura do evento', () => {
    assert.equal(alturaAteFolga(110, 100, 0, 90), 4);
    assert.equal(alturaAteFolga(undefined, 480, 0, 90), 90);
    assert.equal(alturaAteFolga(null, 480, 0, 90), 90);
  });
});
