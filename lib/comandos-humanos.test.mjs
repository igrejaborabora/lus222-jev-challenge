import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ordemHumana, seleccionarVertical } from '../public/src/piloto-sim.js';
import { criarVooLivre } from '../public/src/simulador.js';
import { darOrdem, RETENCAO_HUMANO_S } from '../public/src/piloto-sim.js';
import { avancarMissao } from '../public/src/simulacao.js';

function voar(m, vertical, segundos) {
  let s = m;
  for (let i = 0; i < segundos * 10; i++) {
    s = { ...s, piloto: darOrdem(s.piloto, ordemHumana(new Set(), vertical), s.voo.tempoS, RETENCAO_HUMANO_S) };
    s = avancarMissao(s, 0.1);
  }
  return s;
}

describe('comandos verticais humanos', () => {
  it('um clique selecciona subir/descer; clicar de novo ou nivelar termina', () => {
    assert.equal(seleccionarVertical('manter', 'subir'), 'subir');
    assert.equal(seleccionarVertical('subir', 'descer'), 'descer');
    assert.equal(seleccionarVertical('descer', 'descer'), 'manter');
    assert.equal(seleccionarVertical('subir', 'manter'), 'manter');
  });
  it('mantém a intenção vertical sem ter de segurar o botão', () => {
    assert.equal(ordemHumana(new Set(), 'subir').vertical, 'subir');
    assert.equal(ordemHumana(new Set(), 'descer').vertical, 'descer');
  });
  it('teclas verticais sobrepõem a selecção e teclas opostas nivelam', () => {
    assert.equal(ordemHumana(new Set(['ArrowUp']), 'subir').vertical, 'descer');
    assert.equal(ordemHumana(new Set(['KeyW', 'KeyS']), 'subir').vertical, 'manter');
    assert.equal(ordemHumana(new Set(['KeyA']), 'subir').lateral, 'esquerda');
  });
  it('potência e lateral tácteis não apagam a subida seleccionada', () => {
    assert.deepEqual(ordemHumana(new Set(), 'subir', new Map([['potencia', 'mais'], ['lateral', 'direita']])), { lateral: 'direita', vertical: 'subir', potencia: 'mais' });
  });
  it('a selecção produz altitude real e nivelar captura a nova altitude', () => {
    const inicio = { ...criarVooLivre(222), diretor: null };
    const alto = voar(inicio, 'subir', 8);
    assert.ok(alto.voo.altitudeM > inicio.voo.altitudeM + 15);
    const baixo = voar(alto, 'descer', 12);
    assert.ok(baixo.voo.altitudeM < alto.voo.altitudeM - 20);
    const nivelado = voar(baixo, 'manter', 20);
    assert.ok(Math.abs(nivelado.voo.altitudeM - baixo.voo.altitudeM) < 3);
    assert.ok(Math.abs(nivelado.voo.velocidadeVerticalMs) < 0.2);
  });
});

it('teclado segue o manche: puxar levanta o nariz, empurrar baixa',()=>{
 for(const code of ['ArrowDown','KeyS'])assert.equal(ordemHumana(new Set([code])).vertical,'subir');
 for(const code of ['ArrowUp','KeyW'])assert.equal(ordemHumana(new Set([code])).vertical,'descer');
 assert.equal(ordemHumana(new Set(['ArrowUp','ArrowDown'])).vertical,'manter');
});
