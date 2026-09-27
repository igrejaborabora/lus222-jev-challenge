import {test} from 'node:test';
import assert from 'node:assert/strict';
import {criarVooProgressivo} from '../public/src/simulador.js';
import {avancarMissao, alturaChaoM} from '../public/src/simulacao.js';
import {comandarAtitude} from '../public/src/voo-progressivo.js';
import {darOrdem} from '../public/src/piloto-sim.js';
const inicio=()=>({...criarVooProgressivo(222,{tempo:'limpo'}),diretor:null,circuito:null});
function voar(m,s,vertical='manter') {
 for(let i=0;i<Math.round(s*10)&&!m.resultado;i++) {
  m.piloto=darOrdem(m.piloto,{vertical,lateral:'nivelar',potencia:'manter',fonte:'humano'},m.voo.tempoS,.2);
  m=avancarMissao(m,.1);
 }
 return m;
}
test('voo humano permite inclinar progressivamente o nariz e conservar a atitude ao largar',()=>{
 let m=inicio();m.voo.altitudeM=1500;
 assert.equal(m.controlos.modo,'avancado');
 assert.equal(m.controlos.protecao,false);
 m=voar(m,4,'descer');
 assert.ok(m.voo.pitchRad < -.3,`pitch ${m.voo.pitchRad}`);
 assert.ok(m.voo.velocidadeVerticalMs < -15);
 const pedido=m.voo.pitchManualRad,alt=m.voo.altitudeM;
 m=voar(m,3);
 assert.equal(m.voo.pitchManualRad,pedido);
 assert.ok(m.voo.altitudeM<alt-40);
 assert.equal(m.voo.altitudeAlvoM,null);
});
test('descida manual chega ao chão sem o supervisor recuperar o avião',()=>{
 let m=inicio();m.voo.altitudeM=alturaChaoM(m,m.voo.xM,m.voo.zM)+90;
 m=voar(m,20,'descer');
 assert.equal(m.resultado,'limite_altitude');
 assert.equal(m.voo.fonteActuacao,'humano');
 assert.ok(m.voo.pitchRad<-.2,'o impacto não nivela visualmente o avião');
});
test('activar protecção conserva a recuperação junto ao terreno; IA nunca a desliga',()=>{
 for(const tipo of ['humano','jev']) {
  let m=inicio();m.piloto.tipo=tipo;m.controlos.protecao=tipo==='humano';
  m.voo.altitudeM=alturaChaoM(m,m.voo.xM,m.voo.zM)+40;
  m=voar(m,.2,'descer');
  assert.equal(m.voo.fonteActuacao,'supervisor');
 }
});
test('desactivar protecção remove de imediato uma intervenção ainda retida',()=>{
 let m=inicio();m.controlos.protecao=false;
 m.piloto.supervisor={vertical:'subir',lateral:'nivelar',potencia:'mais',ateS:100,motivo:'terreno'};
 m=voar(m,.1,'descer');
 assert.equal(m.voo.fonteActuacao,'humano');
 assert.equal(m.piloto.supervisor,null);
});


test('cliques ajustam o nariz, Dive permite picada e Level é explícito',()=>{
 let m=inicio();m.voo.altitudeM=2000;
 m=comandarAtitude(m,'descer');
 assert.ok(Math.abs(m.voo.pitchManualRad+5*Math.PI/180)<1e-9);
 m=comandarAtitude(m,'descer');
 assert.ok(Math.abs(m.voo.pitchManualRad+10*Math.PI/180)<1e-9);
 m=comandarAtitude(m,'picar');m=voar(m,6);
 assert.ok(m.voo.velocidadeVerticalMs < -45);
 assert.ok(m.voo.pitchRad < -.4);
 m=comandarAtitude(m,'manter');m=voar(m,10);
 assert.equal(m.voo.pitchManualRad,null);
 assert.ok(Math.abs(m.voo.velocidadeVerticalMs)<1);
});
test('aterragem manual permite toque e travagem sem guia nem supervisor',()=>{
 let m=criarVooProgressivo(222,{exercicio:'aproximacao',tempo:'limpo'});
 m.ambiente={...m.ambiente,ventoMs:{x:0,z:0},turbulencia:0};
 // Piloto de teste: ajusta o mesmo alvo de nariz exposto pelo slider.
 for(let i=0;i<1200&&!m.resultado;i++) {
  const agl=m.voo.altitudeM-alturaChaoM(m,m.voo.xM,m.voo.zM);
  const d=163650-m.voo.zM;
  const vs=agl<9?-.65:Math.max(-4,Math.min(-1,(4.25+d*.052-m.voo.altitudeM)*.3-m.voo.velocidadeMs*.052));
  m.voo.pitchManualRad=Math.asin(Math.max(-1,vs/m.voo.velocidadeMs))+(m.voo.alphaRad??.14);
  m.controlos.acelerador=m.voo.emSolo?0:Math.max(.1,Math.min(.8,.45+(64-m.voo.velocidadeMs)*.04));
  m.controlos.travao=m.voo.emSolo?1:0;
  m=voar(m,.1);
  assert.notEqual(m.voo.fonteActuacao,'supervisor');
  assert.equal(m.controlos.aproximacao,false);
 }
 assert.equal(m.resultado,'chegou');
 assert.equal(m.voo.contacto.tipo,'pista');
 assert.ok(Math.abs(m.voo.contacto.verticalMs)<1);
 assert.ok(m.voo.velocidadeMs<1);
});


test('Climb por toque permite rodar e descolar sem uma tecla premida',()=>{
 let m=criarVooProgressivo(222,{exercicio:'solo',tempo:'limpo'});
 m.ambiente={...m.ambiente,ventoMs:{x:0,z:0},turbulencia:0};
 m.controlos.acelerador=1;m.controlos.travao=0;
 m=comandarAtitude(m,'subir');
 m=voar(m,55);
 assert.equal(m.resultado,null);
 assert.equal(m.voo.emSolo,false);
 assert.ok(m.voo.altitudeM>14,`altitude ${m.voo.altitudeM}`);
 assert.ok(m.voo.velocidadeVerticalMs>0);
});
test('Level neutraliza trim e termina a descida sem recuperar a altitude anterior',()=>{
 let m=inicio();m.voo.altitudeM=1500;m.controlos.trim=-.8;
 m=comandarAtitude(m,'descer');m=voar(m,4);
 const alt=m.voo.altitudeM;
 m=comandarAtitude(m,'manter');m=voar(m,10);
 assert.equal(m.controlos.trim,0);
 assert.ok(Math.abs(m.voo.velocidadeVerticalMs)<.5);
 assert.ok(m.voo.altitudeM<alt);
 assert.equal(m.voo.modoVertical,'manter');
});
