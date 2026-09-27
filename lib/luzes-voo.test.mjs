import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faseLuzes } from '../public/src/luzes-voo.js';
test('beacon e estrobos alternam com o relógio de simulação',()=>{
 assert.equal(faseLuzes(0.04).estrobo,true);assert.equal(faseLuzes(0.1).estrobo,false);
 assert.equal(faseLuzes(0.19).estrobo,true);assert.equal(faseLuzes(0.4).beacon,false);
 assert.deepEqual(faseLuzes(1.44),faseLuzes(0.04));
});
test('movimento reduzido mantém luzes contínuas',()=>{
 for(const t of [0,0.1,0.4,20])assert.deepEqual(faseLuzes(t,true),{beacon:true,estrobo:true});
});
