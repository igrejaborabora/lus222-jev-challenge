import {test} from 'node:test';
import assert from 'node:assert/strict';
import {criarVooProgressivo} from '../public/src/simulador.js';
import {comandarMotor,reporMotores,novosControlos} from '../public/src/voo-progressivo.js';
import {instrumentosDeVoo} from '../public/src/instrumentos.js';
import {parametrosSom} from '../public/src/som-motor.js';
import {avancarMissao} from '../public/src/simulacao.js';
import {createLandingTracker,updateLandingTracker,createRunSummary,compareRuns} from '../public/src/flight-training.js';

test('engine telemetry and audio distinguish commanded throttle from failed output',()=>{
 const initial=criarVooProgressivo(222),failed=comandarMotor(initial,'esquerdo',{falha:true});
 const before=instrumentosDeVoo(initial),after=instrumentosDeVoo(failed);
 assert.equal(failed.voo.acelerador,initial.voo.acelerador);
 assert.equal(after.potenciaPct,before.potenciaPct/2);assert.equal(after.consumoKgH,before.consumoKgH/2);
 assert.match(after.aviso,/ENGINE/);
 const sound=parametrosSom({potencia:failed.voo.potencia,motores:failed.voo.motores});
 assert.deepEqual(sound.canais.map(c=>c.activo),[false,true]);
 const stopped=comandarMotor(failed,'direito',{falha:true});assert.equal(instrumentosDeVoo(stopped).autonomiaMin,null);
 assert.equal(instrumentosDeVoo(reporMotores(stopped)).consumoKgH,before.consumoKgH);
});
test('guided approach captures exact contact data then reports a stopped landing',()=>{
 let m=criarVooProgressivo(222,{exercicio:'aproximacao',tempo:'limpo',ambiente:{ventoMs:{x:0,z:0}}});
 m={...m,controlos:{...m.controlos,aproximacao:true}};
 let tracker=createLandingTracker(m);
 for(let i=0;i<1800&&!m.resultado;i++){
  const previousFlight=m.voo;m=avancarMissao(m,.1);tracker=updateLandingTracker(tracker,m,{previousFlight});
 }
 assert.equal(m.resultado,'chegou');assert.equal(tracker.report.success,true);
 assert.deepEqual(tracker.touchdown.estimated,[]);assert.ok(tracker.report.metrics.stoppingDistanceM>0);
 assert.equal(tracker.touchdown.speedMs,m.voo.contacto.speedMs);
 assert.ok(tracker.touchdown.speedMs>m.voo.velocidadeMs);
});
test('matched human and live AI sample setups compare; a failure/configuration change disqualifies them',()=>{
 const human=criarVooProgressivo(222);human.controlos={...novosControlos(),flaps:human.voo.flaps??0};
 const ai=structuredClone(human);ai.piloto={...ai.piloto,tipo:'jev',fonte:'jev'};
 let a=human,b=ai;for(let i=0;i<300;i++){a=avancarMissao(a,.1);b=avancarMissao(b,.1);}
 const first=createRunSummary(human,a),second=createRunSummary(ai,b);
 assert.equal(compareRuns(first,second).comparable,true);
 assert.equal(compareRuns(first,createRunSummary(ai,b,{configurationChanged:true})).comparable,false);
});
