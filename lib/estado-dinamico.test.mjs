import { it } from 'node:test';
import assert from 'node:assert/strict';
import { criarMissao, estadoParaAvaliacao, proximoEvento } from '../public/src/simulacao.js';
import { estadoParaJev } from './decisao.mjs';

it('preserva voo e alternativas na entrada enviada ao JEV sem expor dados arbitrários', () => {
  const entrada = estadoParaAvaliacao(criarMissao('medevac', 222), proximoEvento(criarMissao('medevac', 222)));
  entrada.alternativas[0].segredo = 'não enviar';
  const limpa = estadoParaJev(entrada);
  assert.equal(limpa.voo.velocidade_ms, 88);
  assert.ok(limpa.alternativas.some((d) => d.id === 'stol_proximo'));
  assert.equal(limpa.alternativas[0].segredo, undefined);
  assert.equal(limpa.incidente.tese, undefined);
});
