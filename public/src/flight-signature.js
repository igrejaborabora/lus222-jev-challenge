/** Presentation clock, independent of aircraft state and AI calls. */
export function novaAssinatura() {
  return {tempoS:0,proximaS:30,inicioS:null,visivel:false,progresso:null};
}
export function avancarAssinatura(anterior,dt,{activa=true,ocupado=false,permitida=true,reduzido=false}={}) {
  const s={...anterior,visivel:false,progresso:null};
  if(!activa||!permitida)return s;
  s.tempoS+=Number.isFinite(dt)?Math.max(0,dt):0;
  if(ocupado) {
    if(s.inicioS!=null){s.inicioS=null;s.proximaS=s.tempoS+30;}
    return s;
  }
  if(reduzido)return {...s,visivel:true};
  if(s.inicioS!=null&&s.tempoS-s.inicioS>=8)s.inicioS=null;
  if(s.inicioS==null&&s.tempoS>=s.proximaS){s.inicioS=s.tempoS;s.proximaS=s.tempoS+30;}
  if(s.inicioS!=null){s.visivel=true;s.progresso=(s.tempoS-s.inicioS)/8;}
  return s;
}
