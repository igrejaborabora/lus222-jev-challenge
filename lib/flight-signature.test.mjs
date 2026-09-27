import test from 'node:test';
import assert from 'node:assert/strict';
import { novaAssinatura, avancarAssinatura } from '../public/src/flight-signature.js';
const step=(s,dt,o={})=>avancarAssinatura(s,dt,{activa:true,...o});
test('assinatura aparece aos 30 s, dura 8 s e volta aos 60 s',()=>{
 let s=step(novaAssinatura(),29);assert.equal(s.visivel,false);
 s=step(s,1);assert.equal(s.visivel,true);assert.equal(s.progresso,0);
 s=step(s,4);assert.equal(s.progresso,.5);
 s=step(s,4);assert.equal(s.visivel,false);
 s=step(s,22);assert.equal(s.visivel,true);
});
test('pausa não conta tempo e alerta adia a passagem inteira',()=>{
 let s=step(novaAssinatura(),29);
 s=step(s,100,{activa:false});assert.equal(s.tempoS,29);assert.equal(s.visivel,false);
 s=step(s,6,{ocupado:true});assert.equal(s.visivel,false);
 s=step(s,1);assert.equal(s.visivel,true);assert.equal(s.progresso,0);
 s=step(s,1,{ocupado:true});assert.equal(s.visivel,false);
 s=step(s,1);assert.equal(s.visivel,false);
});
test('ocultar e movimento reduzido nunca iniciam deslocação',()=>{
 assert.equal(step(novaAssinatura(),35,{permitida:false}).visivel,false);
 const s=step(novaAssinatura(),35,{reduzido:true});assert.equal(s.visivel,true);assert.equal(s.progresso,null);
 assert.equal(step(s,2,{reduzido:true,ocupado:true}).visivel,false);
});
