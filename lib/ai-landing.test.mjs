import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarVooProgressivo } from '../public/src/simulador.js';
import { avancarMissao } from '../public/src/simulacao.js';
import { iniciarAterragemAI, decidirAterragemAI, cancelarAterragemAI, pedirBorregoAI, estadoAterragem } from '../public/src/ai-landing.js';
function flight(options={}) { const m=criarVooProgressivo(222,options); return iniciarAterragemAI({...m,treino:null,diretor:null}); }
function tick(m,decision='continue') {
  m=decidirAterragemAI(m,decision,{phase:m.aiLanding.phase,tempoS:m.voo.tempoS});
  return avancarMissao(m,1);
}
for(const tempo of ['limpo','chuva'])test(`AI joins from free flight, lands and stops: ${tempo}`,()=>{
  let m=flight({tempo});const seen=new Set();
  for(let i=0;i<650&&!m.resultado;i++){seen.add(m.aiLanding.phase);m=tick(m);}
  assert.equal(m.resultado,'chegou',JSON.stringify({phase:m.aiLanding.phase,v:m.voo}));
  assert.ok(seen.has('joining')&&seen.has('aligning')&&seen.has('descending')&&seen.has('flare')&&seen.has('rollout'));
  assert.ok(Math.abs(m.voo.contacto.verticalMs)<1.5);
  assert.ok(Math.abs(m.voo.contacto.lateralM)<20);
  assert.ok(m.voo.velocidadeMs<1);
});
test('AI can join from opposite heading north of airport without teleporting',()=>{
  const base=criarVooProgressivo(222,{tempo:'limpo'});
  let m=iniciarAterragemAI({...base,diretor:null,voo:{...base.voo,xM:2400,zM:167000,rumoRad:Math.PI}});
  assert.equal(m.voo.zM,167000);
  for(let i=0;i<1000&&!m.resultado;i++)m=tick(m);
  assert.equal(m.resultado,'chegou',`${m.aiLanding.phase}: ${m.voo.xM},${m.voo.zM}`);
});
test('hold defers the landing; continue allows a new approach',()=>{
  let m=flight({exercicio:'aproximacao',tempo:'limpo'});
  m=tick(m,'hold');assert.equal(m.controlos.aproximacao,false);
  assert.equal(m.aiLanding.phase,'holding');
  for(let i=0;i<650&&!m.resultado;i++)m=tick(m);
  assert.equal(m.resultado,'chegou');
});
test('stale judgement cannot authorise a final and manual takeover clears targets',()=>{
  let m=flight({exercicio:'aproximacao',tempo:'limpo'});
  m=tick(m);m=avancarMissao(m,9);
  assert.equal(m.aiLanding.phase,'go-around');assert.equal(m.controlos.aproximacao,false);
  const stale=decidirAterragemAI(m,'continue',{phase:'descending',tempoS:0});assert.deepEqual(stale,m);
  m=cancelarAterragemAI(m);assert.equal(m.aiLanding,null);assert.equal(m.controlos.aproximacao,false);
  assert.equal(m.controlos.rumoRad,null);assert.equal(m.controlos.altitudeM,null);
  assert.equal(m.piloto.tipo,'humano');
});
test('model go-around and unsafe weather reject descent',()=>{
  let m=flight({exercicio:'aproximacao',tempo:'limpo'});m=tick(m,'go_around');
  assert.equal(m.aiLanding.phase,'go-around');assert.ok(m.controlos.acelerador>=0.85);
  m=flight({exercicio:'aproximacao',tempo:'tempestade'});m=tick(m);
  assert.notEqual(m.aiLanding.phase,'descending');assert.equal(m.controlos.aproximacao,false);
});

test('pilot go-around on final preserves the JEV judgement and rejoins to a full stop',()=>{
  let m=flight({tempo:'limpo'});
  for(let i=0;i<200&&m.aiLanding.phase!=='descending';i++)m=tick(m);
  assert.equal(m.aiLanding.phase,'descending');
  m=pedirBorregoAI(m);assert.equal(m.aiLanding.decision,'continue');assert.match(m.aiLanding.reason,/Pilot requested/);
  for(let i=0;i<700&&!m.resultado;i++)m=tick(m);
  assert.equal(m.resultado,'chegou');
});
test('the state shown to JEV uses the controller descent envelope including bounded gusts',()=>{
  let m=flight({exercicio:'aproximacao',tempo:'limpo'});
  m={...m,voo:{...m.voo,velocidadeVerticalMs:-5.1}};
  assert.equal(estadoAterragem(m).stable,true);
  m.voo.velocidadeVerticalMs=-5.6;assert.equal(estadoAterragem(m).stable,false);
});
