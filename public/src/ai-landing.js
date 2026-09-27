import { novosControlos, PERFIL_PROGRESSIVO } from './voo-progressivo.js';
import { novoPiloto } from './piloto-sim.js';
import { ventoInstantaneo } from './meteorologia.js';

export const LANDING_PHASES = Object.freeze(['joining','aligning','descending','flare','rollout','stopped','holding','go-around']);
export const LANDING_DECISIONS = Object.freeze(['continue','hold','go_around','unable']);
export const LANDING_FRESH_S = 7;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const wrap=n=>Math.atan2(Math.sin(n),Math.cos(n));
const finalPhase=p=>p==='descending'||p==='flare';
export function geometriaAterragem(m) {
  const p=m.pistas?.find(p=>p.id===m.aiLanding?.runwayId)??m.pistas?.[0],v=m.voo;
  if(!p)return null;
  const distance=p.zM-p.pistaM/2-v.zM;
  return {runway:p,distance,lateral:v.xM-p.xM,heading:wrap(v.rumoRad),glideAltitude:Math.max(4.25,(distance+350)*0.052+4.25)};
}
export function iniciarAterragemAI(m) {
  if(m.perfil!==PERFIL_PROGRESSIVO||m.voo.emSolo||m.resultado||!m.pistas?.length)return m;
  const controls={...novosControlos(),motores:m.controlos?.motores,flaps:m.voo.flaps??0,luzesAterragem:true};
  return {...m,circuito:null,diretor:null,treino:null,destinoId:m.pistas[0].id,piloto:novoPiloto('jev'),controlos:controls,
    aiLanding:{phase:'joining',sinceS:m.voo.tempoS,runwayId:m.pistas[0].id,decision:null,decisionAtS:null,
      previousCircuit:m.circuito,previousDirector:m.diretor,reason:'Awaiting a live JEV judgement while capturing the entry altitude.',attempt:1,joinLeg:0,joinSide:m.voo.xM>0?1:-1}};
}
export function cancelarAterragemAI(m) {
  if(!m.aiLanding)return m;
  return {...m,circuito:m.aiLanding.previousCircuit,diretor:m.aiLanding.previousDirector?{...m.aiLanding.previousDirector,proximoS:m.voo.tempoS+20}:null,aiLanding:null,piloto:novoPiloto('humano'),controlos:{...m.controlos,modo:'avancado',protecao:false,aproximacao:false,altitudeM:null,verticalMs:null,rumoRad:null,acelerador:null,travao:0,trim:0,leme:0},
    voo:{...m.voo,pitchManualRad:m.voo.pitchRad}};
}
export function decidirAterragemAI(m,decision,{phase,tempoS}) {
  const a=m.aiLanding;
  if(!a||m.piloto.tipo!=='jev'||m.resultado||phase!==a.phase||!LANDING_DECISIONS.includes(decision)||!Number.isFinite(tempoS)
    ||tempoS<a.sinceS||tempoS<(a.decisionAtS??-Infinity)||m.voo.tempoS-tempoS>LANDING_FRESH_S||tempoS>m.voo.tempoS)return m;
  return {...m,aiLanding:{...a,decision,decisionAtS:tempoS}};
}
function change(a,phase,time,reason) {
  return {...a,phase,sinceS:time,reason,...(phase==='joining'?{joinLeg:0}:{}),...(phase==='go-around'?{attempt:a.attempt+1}:{})};
}
/** A pilot override is labelled separately and never fabricates a model judgement. */
export function pedirBorregoAI(m) {
  if(!m.aiLanding||m.voo.emSolo||m.resultado)return m;
  return {...m,aiLanding:change(m.aiLanding,'go-around',m.voo.tempoS,'Pilot requested a go-around.')};
}
/** Same stability envelope feeds both the controller veto and the model state. */
function finalEstavel(m,g=geometriaAterragem(m)) {
  const v=m.voo;
  return Math.abs(g.lateral)<=Math.max(25,g.distance*.06)&&Math.abs(g.heading)<=.2&&!v.stall
    &&v.velocidadeMs>=45&&v.velocidadeMs<=84&&v.velocidadeVerticalMs>=-5.5
    &&Math.abs(v.altitudeM-g.glideAltitude)<=Math.max(30,g.distance*.03)&&g.distance>=-1000;
}
export function tempoAterragemSeguro(m) {
  const w=m.ambiente;
  return (w.visKm??12)>=4&&Math.abs(w.ventoMs?.x??0)<=9&&Math.abs(w.ventoMs?.z??0)<=15&&(w.turbulencia??0)<0.6;
}
/** Fixed-step flight guidance. AI chooses a bounded intent; this code flies it. */
export function prepararAterragemAI(m) {
  if(!m.aiLanding||m.piloto.tipo!=='jev'||m.perfil!==PERFIL_PROGRESSIVO)return m;
  const v=m.voo,g=geometriaAterragem(m),t=v.tempoS;
  if(!g)return cancelarAterragemAI(m);
  let a={...m.aiLanding};
  const fresh=a.decisionAtS!=null&&t-a.decisionAtS<=LANDING_FRESH_S;
  const proceed=fresh&&a.decision==='continue',weather=tempoAterragemSeguro(m);
  if(a.phase==='joining')a.reason=proceed?'Following the approach entry route.':fresh?'JEV is reassessing the approach.':'Awaiting a live JEV judgement while capturing the entry altitude.';
  const supervisor=m.piloto.supervisor?.ateS>t;
  const unstable=finalPhase(a.phase)&&!finalEstavel(m,g);
  if(v.emSolo)a=change(a,v.velocidadeMs<1?'stopped':'rollout',t,'Guidance brakes and tracks the runway centreline.');
  else if(a.phase!=='go-around'&&a.phase!=='holding') {
    if(supervisor||unstable||(finalPhase(a.phase)&&(!proceed||!weather))) {
      a=change(a,'go-around',t,supervisor?'Protection override: climb and rejoin.':unstable?'Approach outside the simulator stability limits.':!weather?'Weather outside the illustrative landing limits.':fresh?'JEV withheld continuation on final. Climb and reassess.':'No fresh JEV clearance: climb and request a new decision.');
    } else if(fresh&&['go_around','hold','unable'].includes(a.decision)) {
      a=change(a,a.decision==='go_around'?'go-around':'holding',t,a.decision==='unable'?'JEV could not select a suitable action. Holding for reassessment.':a.decision==='hold'?'JEV selected hold. Stay above the approach until reassessed.':'JEV selected go around.');
    }
  }
  if(a.phase==='go-around'&&t-a.sinceS>25&&v.altitudeM>340) a=change(a,'holding',t,'Climb complete. Rejoin after a fresh JEV decision.');
  if(a.phase==='holding'&&proceed&&weather&&t-a.sinceS>12)a=change(a,'joining',t,'JEV selected continue. Joining the approach again.');
  const aligned=Math.abs(g.lateral)<100&&Math.abs(g.heading)<.15&&Math.abs(v.bankRad)<.15;
  if(a.phase==='joining'&&g.distance>3200&&g.distance<7200&&Math.abs(g.lateral)<650&&Math.abs(g.heading)<.5) a=change(a,'aligning',t,'Guidance captures the runway centreline.');
  if(a.phase==='aligning'&&proceed&&weather&&aligned&&g.distance>2200&&g.distance<6200&&Math.abs(v.altitudeM-g.glideAltitude)<110&&v.velocidadeMs<80) a=change(a,'descending',t,'Fresh JEV clearance. Guidance follows the descent path.');
  if(a.phase==='aligning'&&g.distance<2100)a=change(a,'go-around',t,'Insufficient distance to establish a stable final.');
  if(a.phase==='descending'&&v.altitudeM<14)a=change(a,'flare',t,'Guidance eases the descent before touchdown.');
  const wind=ventoInstantaneo(m.ambiente,t,m.semente);
  let heading,altitude=390,speed=76,aproximacao=false,power;
  if(a.phase==='go-around') {heading=0;altitude=Math.max(390,v.altitudeM+20);power=1;}
  else if(finalPhase(a.phase)||a.phase==='rollout'||a.phase==='stopped'){aproximacao=true;heading=0;altitude=null;}
  else {
    // Entry fix is well south of the runway. Aim ahead on the centreline once joining northbound.
    const entryZ=g.runway.zM-g.runway.pistaM/2-6800;
    const points=[{x:g.runway.xM+a.joinSide*3200,z:entryZ-3200},{x:g.runway.xM,z:entryZ-3200},{x:g.runway.xM,z:entryZ}];
    if(a.phase==='joining'){
      const point=points[a.joinLeg];
      if(Math.hypot(v.xM-point.x,v.zM-point.z)<1200){
        if(a.joinLeg<2)a.joinLeg++;
        else a=change(a,'aligning',t,'Guidance turns onto the final approach centreline.');
      }
    }
    const ahead=a.phase==='aligning'||(a.phase==='joining'&&Math.abs(g.lateral)<650&&g.distance>6000&&Math.abs(g.heading)<.6);
    const targetZ=ahead?v.zM+1500:points[a.joinLeg].z;
    const targetX=ahead?g.runway.xM:points[a.joinLeg].x;
    const track=Math.atan2(targetX-v.xM,targetZ-v.zM);
    const cross=wind.x*Math.cos(track)-wind.z*Math.sin(track);
    heading=track-Math.asin(clamp(cross/Math.max(45,v.velocidadeMs),-.3,.3));
    if(a.phase==='aligning'){altitude=g.glideAltitude;speed=67;}
    if(a.phase==='holding') {
      const radius=1800,dx=v.xM-targetX,dz=v.zM-entryZ,radial=Math.atan2(dx,dz);
      heading=radial+Math.PI/2+clamp((Math.hypot(dx,dz)-radius)/radius,-.8,.8);
    }
  }
  const c={...m.controlos,modo:'assistido',protecao:true,aproximacao,altitudeM:altitude,verticalMs:4,rumoRad:heading,
    acelerador:power??clamp(.55+(speed-v.velocidadeMs)*.045,.08,1),flaps:aproximacao?.65:a.phase==='aligning'?.35:0,
    trim:0,leme:0,travao:a.phase==='rollout'||a.phase==='stopped'?1:0,luzesAterragem:true};
  // No old tactical order may compete with the selected landing objective; supervisor remains authoritative.
  const piloto={...novoPiloto('jev'),supervisor:m.piloto.supervisor};
  return {...m,aiLanding:a,controlos:c,piloto};
}
export function estadoAterragem(m) {
  const a=m.aiLanding,g=geometriaAterragem(m),v=m.voo;
  if(!a||!g)return null;
  return {phase:a.phase,altitude_m:v.altitudeM,speed_mps:v.velocidadeMs,vertical_mps:v.velocidadeVerticalMs,
    heading_error_deg:g.heading*180/Math.PI,lateral_m:g.lateral,distance_threshold_m:g.distance,glide_error_m:v.altitudeM-g.glideAltitude,
    flaps:v.flaps??0,fuel_kg:v.combustivelKg,engines_available:[v.motores?.esquerdo,v.motores?.direito].filter(e=>!e||e.estado==='operacional').length,
    weather:{visibility_km:m.ambiente.visKm??12,crosswind_mps:Math.abs(m.ambiente.ventoMs?.x??0),turbulence:m.ambiente.turbulencia??0,rain:m.ambiente.chuva??0},
    traffic:m.piloto.supervisor?.motivo==='separacao'&&m.piloto.supervisor.ateS>v.tempoS?'conflict':m.ameacas?.length?'nearby':'clear',stable:finalEstavel(m,g),weather_suitable:tempoAterragemSeguro(m)};
}
