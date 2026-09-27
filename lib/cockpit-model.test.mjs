import {test} from 'node:test';
import {comandarMotor} from '../public/src/voo-progressivo.js';
import assert from 'node:assert/strict';
import {criarVooProgressivo} from '../public/src/simulador.js';
import {painelGuardado,guardarPainel,desvioDoPainel,escalaInstrumento,estadoCockpit,PAINEL_PREF} from '../public/src/cockpit-model.js';
test('panel visibility persists and remains usable when storage is unavailable',()=>{
 const entries=new Map(),storage={getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v)};
 assert.equal(painelGuardado(storage),true);guardarPainel(storage,false);
 assert.equal(entries.get(PAINEL_PREF),'hidden');assert.equal(painelGuardado(storage),false);
 guardarPainel(storage,true);assert.equal(painelGuardado(storage),true);
 const denied={getItem(){throw Error('denied')},setItem(){throw Error('denied')}};
 assert.equal(painelGuardado(denied),true);assert.doesNotThrow(()=>guardarPainel(denied,false));
});
test('hidden cockpit releases the entire camera offset',()=>{
 assert.equal(desvioDoPainel({visible:false,viewportHeight:900,coveredHeight:400}),0);
 assert.equal(desvioDoPainel({visible:true,viewportHeight:900,coveredHeight:400}),160);
 assert.ok(Math.abs(desvioDoPainel({visible:true,viewportHeight:600,coveredHeight:500})-168)<1e-9);
});
test('instrument tapes scroll continuously and avoid negative speed labels',()=>{
 const before=escalaInstrumento(125,10),after=escalaInstrumento(126,10);
 assert.ok(Math.abs(after.find(t=>t.value===130).y-before.find(t=>t.value===130).y-2.4)<1e-9);
 assert.ok(escalaInstrumento(0,10).every(t=>t.value>=0));
});
test('systems show actual flap transit, trim and real takeoff checklist state',()=>{
 let m=criarVooProgressivo(222,{exercicio:'solo'});m.voo.flaps=.2;m.controlos.flaps=.65;m.controlos.trim=-.4;
 const c=estadoCockpit(m);assert.equal(c.flapsPct,20);assert.equal(c.flapsTargetPct,65);assert.equal(c.trimPct,-40);
 assert.equal(c.checklist.departure[0][1],false);assert.equal(c.checklist.departure[1][1],false);
 m.voo.flaps=.35;m.controlos.travao=0;m.voo.acelerador=1;m=comandarMotor(comandarMotor(m,'esquerdo',{acelerador:1}),'direito',{acelerador:1});
 assert.ok(estadoCockpit(m).checklist.departure.every(([,ready])=>ready));
});

test('brake indication and checklist include live pilot inputs and guided rollout',()=>{
 const m=criarVooProgressivo(222,{exercicio:'solo'});m.controlos.travao=0;
 assert.equal(estadoCockpit(m).brakes,false);
 m.piloto={...m.piloto,travao:1,fonte:'humano',ateS:m.voo.tempoS+1};
 assert.equal(estadoCockpit(m).brakes,true);assert.equal(estadoCockpit(m).checklist.departure[0][1],false);
 m.piloto.ateS=m.voo.tempoS;
 assert.equal(estadoCockpit(m).brakes,false);
 m.controlos.aproximacao=true;assert.equal(estadoCockpit(m).brakes,true);
 m.voo.emSolo=false;assert.equal(estadoCockpit(m).brakes,false);
 m.voo.emSolo=true;m.piloto.supervisor={ateS:m.voo.tempoS+1};assert.equal(estadoCockpit(m).brakes,false);
});
