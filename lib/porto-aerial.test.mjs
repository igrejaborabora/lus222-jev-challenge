import test from 'node:test';
import assert from 'node:assert/strict';
import { coordenadasFotoPorto, pesoFotoPorto, FOTO_PORTO } from '../public/src/porto-aerial.js';
test('foto adapta as duas referências do cenário sem alterar a altura',()=>{
 const airport=coordenadasFotoPorto(0,165000),bridge=coordenadasFotoPorto(2200,152700);
 assert.ok(Math.abs(airport.lon-(-8.6818))<1e-7);
 assert.ok(Math.abs(bridge.lon-(-8.6094))<1e-7);
 assert.ok(Math.abs(bridge.lat-41.1406)<1e-7);
 assert.ok(airport.u>0&&airport.u<1&&airport.v>0&&airport.v<1);
 assert.ok(coordenadasFotoPorto(1000,165000).u<airport.u);
});
test('foto desaparece fora da cobertura, na água e sobre a pista simulada',()=>{
 assert.equal(pesoFotoPorto(0,165000,2,[{x:0,z:165000,comprimentoM:3480}]),0);
 assert.equal(pesoFotoPorto(3000,155000,-4,[]),0);
 assert.equal(pesoFotoPorto(100000,155000,40,[]),0);
 assert.ok(pesoFotoPorto(3000,155000,40,[])>.9);
 assert.ok(FOTO_PORTO.mobile.endsWith('.jpg'));
});
