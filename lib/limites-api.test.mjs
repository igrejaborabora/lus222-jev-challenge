import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classificarErro, momentoDe, origemPermitida } from './limites-api.mjs';

const PRODUCAO = {
  VERCEL_ENV: 'production',
  VERCEL_URL: 'lus222-jev-challenge-abc123-fernandos-projects-8346d0e1.vercel.app',
  VERCEL_PROJECT_PRODUCTION_URL: 'lus222.pixelgrammar.com',
};

describe('momentos do /api/jev', () => {
  it('aceita briefing e incidente e recusa o resto', () => {
    assert.equal(momentoDe({ momento: 'briefing' }), 'briefing');
    assert.equal(momentoDe({ momento: 'incidente' }), 'incidente');
    assert.equal(momentoDe({ momento: 'tatico' }), null);
    assert.equal(momentoDe({}), null);
    assert.equal(momentoDe(null), null);
  });
});

describe('origem dos pedidos', () => {
  it('em produção só o próprio site, sem curingas', () => {
    assert.equal(origemPermitida('https://lus222.pixelgrammar.com', PRODUCAO), true);
    assert.equal(origemPermitida('https://lus222-jev-challenge.vercel.app', PRODUCAO), true);
    assert.equal(origemPermitida(`https://${PRODUCAO.VERCEL_URL}`, PRODUCAO), true);
    assert.equal(origemPermitida('https://lus222-jev-challenge-evil.vercel.app', PRODUCAO), false);
    assert.equal(origemPermitida('https://evil.example', PRODUCAO), false);
    assert.equal(origemPermitida('http://lus222.pixelgrammar.com', PRODUCAO), false);
    assert.equal(origemPermitida('http://localhost:43200', PRODUCAO), false);
    assert.equal(origemPermitida(undefined, PRODUCAO), false, 'sem Origin, fora de produção só');
    assert.equal(origemPermitida('isto não é um url', PRODUCAO), false);
  });

  it('localmente aceita localhost e pedidos sem Origin (gravador de replays)', () => {
    assert.equal(origemPermitida(undefined, {}), true);
    assert.equal(origemPermitida('http://localhost:43200', {}), true);
    assert.equal(origemPermitida('http://127.0.0.1:43123', { VERCEL_ENV: 'development' }), true);
    assert.equal(origemPermitida(undefined, { VERCEL_ENV: 'development' }), true);
    assert.equal(origemPermitida('https://evil.example', {}), false);
  });
});

describe('classificação dos erros do Gateway', () => {
  it('orçamento e quota contam como limite, mesmo dentro de um RetryError', () => {
    assert.equal(classificarErro({ name: 'AI_RetryError', lastError: { statusCode: 429, responseBody: '{"error":{"type":"quota_for_entity_exceeded"}}' } }), 'limite');
    assert.equal(classificarErro({ name: 'AI_RetryError', lastError: { statusCode: 429 } }), 'gateway_indisponivel', 'um 429 sem quota é passageiro');
    assert.equal(classificarErro({ statusCode: 402 }), 'limite');
    assert.equal(classificarErro({
      statusCode: 403,
      type: 'quota_for_entity_exceeded',
      message: 'Quota limit exceeded for "api_key_id_x". Current spend: $25.00, limit: $25.00.',
    }), 'limite', 'a quota ganha ao 403');
  });

  it('distingue credenciais, timeout e indisponibilidade', () => {
    assert.equal(classificarErro({ statusCode: 401, message: 'Invalid API key' }), 'gateway_nao_configurado');
    assert.equal(classificarErro({ name: 'TimeoutError' }), 'timeout');
    assert.equal(classificarErro({ name: 'Error', cause: { name: 'AbortError' } }), 'timeout');
    assert.equal(classificarErro({ statusCode: 500 }), 'gateway_indisponivel');
    assert.equal(classificarErro(new Error('rede em baixo')), 'gateway_indisponivel');
  });
});
