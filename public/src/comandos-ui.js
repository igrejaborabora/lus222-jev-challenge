import { ambienteMeteorologico } from './meteorologia.js';
import { PERFIL_PROGRESSIVO, novosControlos, normalizarControlos, iniciarBorrego, corredorAproximacao } from './voo-progressivo.js';
import { lerGamepad } from './gamepad.js';
const $ = id => document.getElementById(id);

export function criarComandosUI({ estado, assumir, iniciar, avisar }) {
  let gamepadActivo = false;
  function preparar() {
    const s = estado();
    if (!assumir(true)) return null;
    if (s.m.perfil !== PERFIL_PROGRESSIVO) {
      s.m = { ...s.m, perfil: PERFIL_PROGRESSIVO, controlos: novosControlos(), ambiente: ambienteMeteorologico('poucas_nuvens'), voo: { ...s.m.voo, emSolo: false, contacto: null, flaps: 0 } };
    }
    return s;
  }
  function alterar(changes) {
    const s = preparar();
    if (!s) return;
    s.m = { ...s.m, controlos: normalizarControlos({ ...s.m.controlos, ...changes }) };
  }
  $('sim-potencia-range').addEventListener('input', () => alterar({ acelerador: Number($('sim-potencia-range').value)/100 }));
  $('sim-alvos').addEventListener('submit', e => {
    e.preventDefault();
    const s = preparar(); if (!s) return;
    const modo = $('sim-modo-vertical').value;
    const vs = Number($('sim-alvo-vs').value) * 0.00508;
    if (modo === 'altitude' && vs === 0) { avisar('Escolhe uma razão vertical diferente de zero para capturar altitude.'); return; }
    alterar({ altitudeM: modo === 'altitude' ? Number($('sim-alvo-alt').value)*0.3048 : null,
      verticalMs: modo === 'livre' ? null : modo === 'altitude' ? Math.abs(vs) : vs,
      rumoRad: $('sim-seguir-rumo').checked ? Number($('sim-alvo-rumo').value)*Math.PI/180 : null, aproximacao:false, modo:'assistido' });
    s.verticalSeleccionada='manter'; s.m.piloto={...s.m.piloto,ateS:0};
    $('sim-modo-voo').value='assistido';
  });
  for (const [id,key] of [['sim-flaps','flaps'],['sim-trim','trim'],['sim-leme','leme']]) {
    $(id).addEventListener('input',()=>alterar({[key]:Number($(id).value)/(key==='flaps'?1:100)}));
  }
  $('sim-modo-voo').addEventListener('change',()=>alterar({modo:$('sim-modo-voo').value,altitudeM:null,verticalMs:null,rumoRad:null,aproximacao:false}));
  for(const [id,key] of [['sim-travao','travao'],['sim-luzes-nav','luzesNav'],['sim-luzes-pista','luzesAterragem']]) {
    $(id).addEventListener('change',()=>alterar({[key]:key==='travao'?Number($(id).checked):$(id).checked}));
  }
  function mudarTempo(preset = false) {
    const s=preparar();if(!s)return;
    s.m={...s.m,ambiente:ambienteMeteorologico($('sim-tempo').value,{periodo:$('sim-periodo').value,...(!preset?{cobertura:Number($('sim-nuvens').value)/100}:{})})};
    $('sim-nuvens').value=Math.round(s.m.ambiente.cobertura*100);
    $('sim-nuvens-out').textContent=`${$('sim-nuvens').value}%`;
  }
  $('sim-tempo').addEventListener('change',()=>mudarTempo(true));
  $('sim-periodo').addEventListener('change',()=>mudarTempo());
  $('sim-nuvens').addEventListener('input',()=>mudarTempo());
  $('sim-iniciar-exercicio').addEventListener('click',()=>{
    const s=estado();
    void iniciar({piloto:'humano',semente:s.m?.semente??222,exercicio:$('sim-exercicio').value,tempo:$('sim-tempo').value,ambiente:{periodo:$('sim-periodo').value,cobertura:Number($('sim-nuvens').value)/100}});
  });
  $('sim-aproximacao').addEventListener('click',()=>{
    const s=preparar();if(!s)return;
    if(!s.m.controlos.aproximacao && (s.m.voo.emSolo || !corredorAproximacao(s.m))) { $('sim-treino-avaliacao').textContent='Alinha com a pista antes de activar a guia, ou inicia o exercício de aproximação.';return; }
    alterar({aproximacao:!s.m.controlos.aproximacao,altitudeM:null,verticalMs:null,rumoRad:null});
    s.verticalSeleccionada='manter';s.m.piloto={...s.m.piloto,ateS:0};
  });
  $('sim-borrego').addEventListener('click',()=>{const s=preparar();if(s){s.verticalSeleccionada='manter';s.m=iniciarBorrego(s.m);}});
  return {
    preparar,
    cancelarEixo(eixo) {
      const s=estado();if(!s.m?.controlos)return;
      const c={...s.m.controlos};
      if(eixo==='vertical') { c.altitudeM=null;c.verticalMs=null;c.aproximacao=false; }
      if(eixo==='lateral') { c.rumoRad=null;c.aproximacao=false; }
      if(eixo==='potencia') { c.acelerador=null;c.aproximacao=false; }
      s.m={...s.m,controlos:c};
    },
    limpar() { gamepadActivo=false; },
    gamepad() {
      const s=estado();
      if(s.pausa || s.fim || document.hidden || !document.hasFocus() || document.activeElement?.closest('input,select,textarea')) return null;
      let g=null;try {g=lerGamepad(navigator.getGamepads?.()??[]);} catch { /* indisponível */ }
      if(!g) {
        if(gamepadActivo && s.m) s.m={...s.m,piloto:{...s.m.piloto,ateS:0}};
        gamepadActivo=false;return null;
      }
      if(g.activo && preparar()) {
        gamepadActivo=true;
        if(g.pitchInput) { s.verticalSeleccionada='manter';this.cancelarEixo('vertical'); }
        if(g.bankInput || g.rudder) this.cancelarEixo('lateral');
        if(g.potenciaDelta) this.cancelarEixo('potencia');
        return g;
      }
      if(gamepadActivo) return g;
      return null;
    },
    iniciar() {
      const s=estado(), c=s.m.controlos??novosControlos(), a=s.m.ambiente;
      $('sim-exercicio').value=s.m.treino?.tipo??'livre';
      $('sim-periodo').value=a.periodo??'noite';$('sim-tempo').value=a.tempo??'poucas_nuvens';
      $('sim-nuvens').value=Math.round((a.cobertura??0.3)*100);
      $('sim-nuvens-out').textContent=`${$('sim-nuvens').value}%`;
      $('sim-flaps').value=String(c.flaps);$('sim-modo-voo').value=c.modo;
      $('sim-trim').value=String(c.trim*100);$('sim-leme').value=String(c.leme*100);
      $('sim-travao').checked=Boolean(c.travao);$('sim-luzes-nav').checked=c.luzesNav;$('sim-luzes-pista').checked=c.luzesAterragem;
      $('sim-treino-avaliacao').textContent='';gamepadActivo=false;
    },
    actualizar() {
      const s=estado(),m=s.m,c=m.controlos??novosControlos(),v=m.voo;
      if(document.activeElement!==$('sim-potencia-range')) $('sim-potencia-range').value=Math.round(v.acelerador*100);
      $('sim-potencia-out').textContent=`${Math.round(v.acelerador*100)}%`;
      $('sim-trim').disabled=c.modo!=='avancado';$('sim-leme').disabled=c.modo!=='avancado';
      $('sim-aproximacao').setAttribute('aria-pressed',String(c.aproximacao));
      $('sim-alvos-estado').textContent=[c.aproximacao?'Aproximação guiada':c.altitudeM!=null?`ALT ${Math.round(c.altitudeM/0.3048)} ft`:c.verticalMs!=null?`VS ${Math.round(c.verticalMs/0.00508)} ft/min`:'Vertical manual',c.rumoRad!=null?`HDG ${Math.round((c.rumoRad*180/Math.PI+360)%360)}°`:null,v.avisoFlaps?'FLAPS: reduzir velocidade abaixo de 165 kt':null].filter(Boolean).join(' · ');
      $('sim-gamepad').textContent=gamepadActivo?'Gamepad activo · analógicos: inclinação / subida / leme · gatilhos: potência · A: travão':'Teclado: Z / X leme no modo avançado · B trava. Gamepad standard disponível.';
      const t=m.treino;
      if(t?.avaliacao) $('sim-treino-avaliacao').textContent=t.avaliacao;
      $('sim-treino-estado').textContent=v.emSolo?`No solo · ${Math.round(v.velocidadeMs*1.944)} kt · ${c.travao?'liberta os travões para rolar':'B ou Travões para parar'} · Subir para rodar.`
        :t?.tipo==='altitude'||t?.tipo==='rumo'?`${Math.min(60,Math.floor(t.segundos))} / 60 s · tolerância ${t.tipo==='altitude'?'±50 ft':'±5°'}`
          :c.aproximacao?'Guia activa: alinhamento, potência, descida e travagem. Uma ordem manual cancela a guia.':'Voo manual · reduz potência na final, suaviza a descida antes do toque e trava na pista.';
    },
  };
}
