import { LANDING_FRESH_S } from './ai-landing.js';
const $=id=>document.getElementById(id);
const PHASE={joining:'Joining the approach',aligning:'Aligning with the runway',descending:'Descending to Porto',flare:'Flare · easing the descent',rollout:'Touchdown · braking',stopped:'Landed · stopped',holding:'Holding · approach delayed','go-around':'Going around · climbing'};
const CHOICE={continue:'Continue',hold:'Hold',go_around:'Go around',unable:'Unable to decide'};
export function actualizarAterragemUI(m) {
  const a=m.aiLanding;
  $('sim-ai-actions').hidden=!a;
  $('sim-ordens').disabled=Boolean(a);
  for(const n of document.querySelectorAll('#sim-ordens-form button,#sim-atalhos button'))n.disabled=Boolean(a);
  $('sim-ordens').placeholder=a?'Landing follows the selected objective':'For example: save fuel and avoid clouds';
  if(!a){$('sim-decisao').removeAttribute('data-landing-phase');return;}
  const phase=m.resultado==='chegou'?'stopped':a.phase;
  const age=a.decisionAtS==null?null:Math.max(0,m.voo.tempoS-a.decisionAtS);
  $('sim-decisao').dataset.landingPhase=phase;
  $('sim-decisao-manobra').textContent=PHASE[phase];
  $('sim-decisao-detalhe').textContent=`JEV: ${CHOICE[a.decision]??'awaiting live judgement'}${age==null?'':` · ${age.toFixed(1)} s ago${age>LANDING_FRESH_S?' · stale':''}`}`;
  $('sim-decisao-estado').textContent=`Guidance: ${a.reason}`;
  $('sim-ai-go-around').disabled=m.voo.emSolo||Boolean(m.resultado);
  $('sim-fonte').textContent='Live JEV · Land at Porto · guided flight';
  for(const node of document.querySelectorAll('[data-instrumento="autoridade"]'))node.textContent=m.piloto.supervisor?.ateS>m.voo.tempoS?'Protection':'Flight guidance';
}
