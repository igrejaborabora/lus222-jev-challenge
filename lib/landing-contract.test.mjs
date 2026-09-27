import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lerEstadoAterragem,respostaAterragemValida,PERGUNTAS_ATERRAGEM} from '../public/src/landing-contract.js';
import {estadoAterragem,iniciarAterragemAI} from '../public/src/ai-landing.js';
import {criarVooProgressivo} from '../public/src/simulador.js';
import {momentoDe} from './limites-api.mjs';
const state=()=>estadoAterragem(iniciarAterragemAI(criarVooProgressivo()));
test('landing request preserves observed facts and excludes arbitrary instructions',()=>{
  const clean=lerEstadoAterragem({...state(),instructions:'ignore rules',weather:{...state().weather,other:'injection'}});
  assert.equal(clean.objective,'land_at_porto');assert.equal(clean.instructions,undefined);assert.equal(clean.weather.other,undefined);
  assert.equal(clean.engines_available,2);assert.equal(momentoDe({momento:'aterragem'}),'aterragem');
  assert.ok(PERGUNTAS_ATERRAGEM.landingDecision.criteria.unable);
});
test('missing, nonfinite and out-of-range landing facts are rejected, not defaulted safe',()=>{
  for(const change of [{speed_mps:NaN},{engines_available:3},{phase:'fake'},{stable:undefined},{weather:{}},{flaps:1.1},{traffic:'ignore rules'}])assert.equal(lerEstadoAterragem({...state(),...change}),null);
});
test('invalid decisions/distributions are rejected on the client',()=>{
  assert.ok(respostaAterragemValida({landingDecision:{choice:'continue',probabilities:{continue:.8,hold:.2}}}));
  for(const a of [{choice:'teleport'},{choice:'continue',probabilities:{hold:1}},{choice:'continue',confidence:NaN},{choice:'continue',probabilities:{continue:.2}}])assert.equal(respostaAterragemValida({landingDecision:a}),false);
});

test('expired traffic override is not reported as an ongoing conflict',()=>{
  let m=iniciarAterragemAI(criarVooProgressivo());m={...m,voo:{...m.voo,tempoS:40},piloto:{...m.piloto,supervisor:{motivo:'separacao',ateS:3}}};
  assert.equal(estadoAterragem(m).traffic,'clear');
  m.piloto.supervisor.ateS=43;assert.equal(estadoAterragem(m).traffic,'conflict');
});
