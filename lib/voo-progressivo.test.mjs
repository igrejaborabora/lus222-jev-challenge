import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarVooProgressivo } from '../public/src/simulador.js';
import { avancarMissao, preverActuacao, PERFIL, alturaChaoM } from '../public/src/simulacao.js';
import { passoProgressivo, novosControlos, iniciarBorrego, normalizarControlos, PERFIL_PROGRESSIVO } from '../public/src/voo-progressivo.js';
import { darOrdem } from '../public/src/piloto-sim.js';
import { iniciarReproducao } from '../public/src/voo-gravado.js';
import { avaliarTreino, novoTreino } from '../public/src/treino.js';
const criar = (opts = {}) => ({ ...criarVooProgressivo(222, { tempo: 'limpo', ...opts }), diretor: null, ambiente: { ventoMs: { x: 0, z: 0 }, turbulencia: 0 } });
const neutra = { lateral: 'nivelar', vertical: 'manter', potencia: 'manter', fonte: 'humano' };
function passos(m, n, a = neutra) {
  for (let i=0;i<n;i++) m = { ...m, voo: passoProgressivo(m,a,0.1,PERFIL,(x,z)=>alturaChaoM(m,x,z)) };
  return m;
}
test('subida troca velocidade por altitude; descida recupera velocidade à mesma potência', () => {
  const m = criar();
  const nivel = passos(m,100);
  const sobe = passos(m,100,{ ...neutra,vertical:'subir' });
  const desce = passos(m,100,{ ...neutra,vertical:'descer' });
  assert.ok(sobe.voo.altitudeM > nivel.voo.altitudeM + 25);
  assert.ok(sobe.voo.velocidadeMs < nivel.voo.velocidadeMs - 2);
  assert.ok(desce.voo.velocidadeMs > nivel.voo.velocidadeMs + 2);
  assert.notEqual(sobe.voo.pitchRad,sobe.voo.gammaRad);
});
test('sem motor o nivelamento não cria energia mecânica', () => {
  let m = criar(); m.controlos = { ...m.controlos,acelerador:0 };
  const energia = v => v.velocidadeMs**2/2 + 9.80665*v.altitudeM;
  const inicio = energia(m.voo);
  m = passos(m,200);
  assert.ok(energia(m.voo) < inicio);
});
test('captura altitude e rumo, atravessando 360 graus pelo caminho curto', () => {
  let m = criar(); m.voo.rumoRad = -0.08;
  m.controlos = { ...m.controlos, altitudeM:530, verticalMs:4, rumoRad:0.08, acelerador:0.7 };
  m = passos(m,450);
  assert.ok(Math.abs(m.voo.altitudeM-530) < 1);
  assert.ok(Math.abs(m.voo.rumoRad-0.08) < 0.01);
  assert.ok(Math.abs(m.voo.velocidadeVerticalMs) < 0.1);
});
test('predição usa o mesmo passo e a mesma trajectória executada', () => {
  const m=criar(), ordem={...neutra,vertical:'subir',lateral:'direita'};
  const prev=preverActuacao(m,ordem,{horizonteS:5,aplicarS:8});
  const real=avancarMissao({...m,piloto:darOrdem(m.piloto,ordem,0,8)},5);
  for (const k of ['xM','zM','altitudeM','velocidadeMs']) assert.ok(Math.abs(prev.vooFinal[k]-real.voo[k])<1e-8,k);
});
test('flaps aumentam arrasto e reduzem velocidade de perda; limitados em alta velocidade', () => {
  let m=criar(); m.voo.velocidadeMs=70;
  const limpo=passos(m,60);
  const flap=passos({...m,controlos:{...m.controlos,flaps:1}},60);
  assert.ok(flap.voo.stallMs < limpo.voo.stallMs);
  assert.ok(flap.voo.velocidadeMs < limpo.voo.velocidadeMs);
  assert.equal(passos(criar(),1).voo.flaps,0);
  assert.equal(passos({...criar(),controlos:{...novosControlos(),flaps:1}},1).voo.flaps,0);
});
test('trim e leme avançados afectam trajectória e superfícies', () => {
  const m=criar();
  const av=passos({...m,controlos:{...m.controlos,modo:'avancado',trim:0.4,leme:0.5}},60);
  assert.ok(av.voo.altitudeM>m.voo.altitudeM+10);
  assert.ok(av.voo.rumoRad>m.voo.rumoRad);
  assert.equal(av.voo.superficies.rudder,0.5);
});
test('solo parado com travões, corrida e rotação de descolagem', () => {
  let m=criar({exercicio:'solo'});
  assert.equal(avancarMissao(m,4).voo.velocidadeMs,0);
  m.controlos={...m.controlos,travao:0,acelerador:1};
  m=passos(m,450,{...neutra,vertical:'subir'});
  assert.equal(m.voo.emSolo,false);
  assert.ok(m.voo.altitudeM>25);
  assert.equal(m.voo.contacto,null);
});
test('toque suave na pista, travagem até parar e classificação de toque duro', () => {
  let m=criar({exercicio:'aproximacao'});
  m.voo={...m.voo,zM:163500,altitudeM:4.35,velocidadeVerticalMs:-1};
  m.controlos={...m.controlos,verticalMs:-1,acelerador:0,travao:1};
  m=avancarMissao(m,0.2);
  assert.equal(m.voo.contacto?.tipo,'pista');
  assert.equal(m.voo.emSolo,true);
  m=avancarMissao(m,30);
  assert.equal(m.resultado,'chegou');
  let duro=criar({exercicio:'aproximacao'});
  duro.voo={...duro.voo,zM:163500,altitudeM:4.35,velocidadeVerticalMs:-7};
  duro=avancarMissao(duro,0.1);
  assert.equal(duro.resultado,'aterragem_dura');
});
test('fora da pista colide mesmo dentro da área do aeroporto', () => {
  let m=criar();m.voo={...m.voo,xM:100,zM:165000,altitudeM:4.3,velocidadeVerticalMs:-7};
  m=avancarMissao(m,0.1);
  assert.equal(m.resultado,'limite_altitude');
});
test('borrego cancela aproximação, aplica potência e ganha altitude', () => {
  let m=criar({exercicio:'aproximacao'});
  m.controlos.aproximacao=true;
  m=iniciarBorrego(m);
  assert.equal(m.controlos.aproximacao,false);
  assert.equal(m.controlos.acelerador,1);
  assert.ok(passos(m,100).voo.altitudeM>m.voo.altitudeM+10);
});
test('controlo inválido limitado e replay incompatível rejeitado', () => {
  const c=normalizarControlos({acelerador:5,trim:NaN,leme:-99,altitudeM:Infinity});
  assert.equal(c.acelerador,1);assert.equal(c.trim,0);assert.equal(c.leme,-1);assert.equal(c.altitudeM,null);
  assert.throws(()=>iniciarReproducao({versao:1,perfil:PERFIL_PROGRESSIVO,semente:1}),/incompatível/);
});
test('exercício avalia precisão apenas depois dos 60 segundos', () => {
  let t=novoTreino('altitude');
  const v={altitudeM:1800*0.3048,velocidadeVerticalMs:0};
  for(let i=0;i<600;i++) t=avaliarTreino(t,v,0.1,null);
  t=avaliarTreino(t,v,0.1,null);
  assert.equal(t.concluido,true);
  assert.match(t.avaliacao,/100%/);
});
test('previsão avançada preserva trim e limpa eixos de gamepad de outra manobra', () => {
  const m=criar();m.controlos={...m.controlos,modo:'avancado',trim:0.7};
  const actual={...m,piloto:darOrdem(m.piloto,neutra,0,8)};
  const p=preverActuacao(actual,neutra,{horizonteS:5});
  const r=avancarMissao(actual,5);
  assert.ok(Math.abs(p.vooFinal.altitudeM-r.voo.altitudeM)<1e-8);
  const velho={...m,piloto:darOrdem(m.piloto,{...neutra,bankInput:1,pitchInput:1},0,8)};
  const ordem={...neutra,lateral:'esquerda',vertical:'descer'};
  const prev=preverActuacao(velho,ordem,{horizonteS:5});
  const real=avancarMissao({...velho,piloto:darOrdem(velho.piloto,ordem,0,8)},5);
  assert.ok(Math.abs(prev.vooFinal.bankRad-real.voo.bankRad)<1e-8);
  assert.ok(Math.abs(prev.vooFinal.altitudeM-real.voo.altitudeM)<1e-8);
});
test('previsão de supervisor ignora guia de aproximação e borrego vence trim negativo', () => {
  let m=criar({exercicio:'aproximacao'});m.controlos.aproximacao=true;
  const ordem={...neutra,vertical:'subir',fonte:'supervisor'};
  const prev=preverActuacao(m,ordem,{horizonteS:5});
  const real=avancarMissao({...m,piloto:darOrdem(m.piloto,ordem,0,8)},5);
  assert.ok(Math.abs(prev.vooFinal.altitudeM-real.voo.altitudeM)<1e-8);
  m.controlos={...m.controlos,modo:'avancado',trim:-0.3};
  m=iniciarBorrego(m);
  assert.ok(passos(m,100).voo.altitudeM>200);
});
test('aproximação guiada completa toque e travagem com chuva e vento lateral', () => {
  for(const tempo of ['nublado','chuva','tempestade']) {
    let m=criarVooProgressivo(222,{exercicio:'aproximacao',tempo});m.controlos.aproximacao=true;
    for(let i=0;i<180&&!m.resultado;i++)m=avancarMissao(m,1);
    assert.equal(m.resultado,'chegou',tempo);
    assert.ok(Math.abs(m.voo.xM)<20,tempo);
    assert.match(m.treino.avaliacao,/toque/);
  }
});
