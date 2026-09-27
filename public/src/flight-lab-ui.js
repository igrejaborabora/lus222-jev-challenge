import { createFirstFlight, updateFirstFlight, skipFirstFlight, deriveApproach, createLandingTracker, updateLandingTracker, createRunSummary, compareRuns } from './flight-training.js';
import { comandarMotor, reporMotores, PERFIL_PROGRESSIVO } from './voo-progressivo.js';

const $ = id => document.getElementById(id);
const value = (n, unit, digits = 0) => Number.isFinite(n) ? `${n.toFixed(digits)} ${unit}` : '—';
const signed = n => `${n > 0 ? '+' : ''}${n.toFixed(0)}`;
const engineName = e => e?.estado === 'falha' ? 'FAILED' : e?.estado === 'sem_combustivel' ? 'NO FUEL' : e ? 'RUNNING' : 'NOT MODELLED';

/** One lifecycle for learning, optional guidance and measured observations. No animation loop or flight law here. */
export function criarFlightLabUI({ estado, assumir, iniciar, pause, panelVisible, sound, liveAvailable }) {
  let tracker, tutorial, start, runActive = false, saved = {}, flags = {}, effect = null, resultKey = '', lastPaint = 0;
  const snapshot = () => structuredClone(estado().m);
  function renderReport(report, host) {
    if (!report) { host.replaceChildren(); return; }
    const title = document.createElement('strong'); title.textContent = report.title;
    const list = document.createElement('dl'); list.className = 'flight-lab-metrics';
    for (const [label, number, unit, digits] of [
      ['Touchdown sink',report.metrics.sinkRateMs,'m/s',1],['Touchdown speed',report.metrics.speedMs == null ? null : report.metrics.speedMs*1.94384,'kt',0],
      ['Bank',report.metrics.bankDeg,'°',1],['Heading error',report.metrics.headingErrorDeg,'°',1],
      ['Centreline offset',report.metrics.lateralOffsetM,'m',1],['Ground travel',report.metrics.groundDistanceM,'m',0],
      ['Stopping distance',report.metrics.stoppingDistanceM,'m',0],
    ]) {
      const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=label;dd.textContent=value(number,unit,digits);row.append(dt,dd);list.append(row);
    }
    const note=document.createElement('small');note.textContent=`Measured in this illustrative simulation. ${report.estimated?'Speed and attitude use the closest sample at contact.':'Contact readings are recorded at touchdown.'} Stopping distance appears only once stopped.`;
    host.replaceChildren(title,list,note);
  }
  function paintComparison() {
    const a=saved.human,b=saved['live-jev'],comparison=compareRuns(a,b);
    const labels = [a,b].filter(Boolean).map(r=>`${r.origin==='human'?'Human':'Live AI'}: ${value(r.metrics.durationS,'s',1)}, ${value(r.metrics.distanceM,'m')}, ${value(r.metrics.fuelUsedKg,'kg',2)} fuel`);
    $('lab-compare-result').textContent=[...labels,comparison.comparable
      ? `Live AI minus human: distance ${value(comparison.deltas.distanceM,'m')}, fuel ${value(comparison.deltas.fuelUsedKg,'kg',2)}, clearance ${value(comparison.deltas.minClearanceM,'m')}. These differences do not identify a winner.`
      : comparison.reasons.join(' ')].join('\n');
  }
  function finishRun() {
    const m=estado().m;
    if(!runActive||!m)return;
    const summary=createRunSummary(start,m,flags);
    saved[summary.origin]=summary;runActive=false;paintComparison();pause(true);
  }
  function action(name) {
    const s=estado();if(!s.m||!tutorial)return;
    tutorial=updateFirstFlight(tutorial,s.m,{action:name,panelVisible:panelVisible(),paused:s.pausa,visible:!document.hidden});
  }
  $('lab-guide-hide').addEventListener('click',()=>{$('lab-guide-enabled').checked=false;$('lab-approach').hidden=true;});
  $('sim-ordens-form').addEventListener('submit',()=>{flags.configurationChanged=true;});
  for(const b of document.querySelectorAll('#sim-atalhos button'))b.addEventListener('click',()=>{flags.configurationChanged=true;});
  $('lab-tutorial-skip').addEventListener('click',()=>{tutorial=skipFirstFlight(tutorial);$('lab-tutorial').hidden=true;});
  $('lab-tutorial-start').addEventListener('click',()=>void iniciar({primeiroVoo:true}));
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-eixo="vertical"]');
    if(b)action(b.dataset.valor==='manter'?'level':'pitch');
  });
  for(const id of ['sim-potencia-range','sim-nariz'])$(id).addEventListener('input',()=>action(id==='sim-nariz'?'pitch':'power'));
  const configurationIds = ['sim-protecao','sim-protecao-toggle','sim-modo-voo','sim-aproximacao','sim-tempo','sim-periodo','sim-nuvens'];
  for(const id of configurationIds)$(id).addEventListener('change',()=>{flags.configurationChanged=true;});
  for(const id of ['sim-protecao-toggle','sim-aproximacao'])$(id).addEventListener('click',()=>{flags.configurationChanged=true;});
  for(const button of document.querySelectorAll('[data-engine-fail]'))button.addEventListener('click',()=>{
    if(!assumir(true))return;
    const s=estado();s.m=comandarMotor(s.m,button.dataset.engineFail,{falha:true});flags.configurationChanged=true;
  });
  for(const input of document.querySelectorAll('[data-engine-power]'))input.addEventListener('input',()=>{
    if(!assumir(true))return;
    const s=estado();s.m=comandarMotor(s.m,input.dataset.enginePower,{acelerador:Number(input.value)/100});flags.configurationChanged=true;
  });
  $('lab-engine-reset').addEventListener('click',()=>{
    if(!assumir(true))return;
    const s=estado();s.m=reporMotores(s.m);s.m={...s.m,controlos:{...s.m.controlos,leme:0}};flags.configurationChanged=true;
  });
  $('lab-engine-rudder').addEventListener('click',()=>{
    if(!assumir(true))return;
    const s=estado();s.m={...s.m,controlos:{...s.m.controlos,modo:'avancado',leme:s.m.voo.motores?.lemeCompensacao??0}};flags.configurationChanged=true;
  });
  for(const b of document.querySelectorAll('[data-compare-pilot]'))b.addEventListener('click',()=>{
    const piloto=b.dataset.comparePilot;
    if(piloto==='jev'&&!liveAvailable()){$('lab-compare-result').textContent='Live JEV is unavailable. A recording cannot replace a live comparison run.';return;}
    void iniciar({piloto,comparacao:true,semente:222,exercicio:'livre',tempo:'poucas_nuvens',ambiente:{periodo:'anoitecer'}});
  });
  return {
    iniciar(m,{primeiroVoo=false,guiaVisual=false,comparacao=false}={}) {
      tracker=createLandingTracker(m);start=snapshot();flags={};effect=null;runActive=comparacao;resultKey='';
      tutorial=primeiroVoo&&m.piloto.tipo==='humano'?createFirstFlight(m,{panelVisible:panelVisible()}):null;
      $('lab-guide-enabled').checked=guiaVisual;
      $('lab-landing-report').replaceChildren();$('lab-final-report').replaceChildren();
      $('lab-ai-situation').textContent='';
      $('lab-observed-effect').textContent='Observed response appears after a decision. It includes aircraft dynamics and any active protection.';
      paintComparison();
    },
    guiaVisual:()=>Boolean($('lab-guide-enabled').checked),
    remaining:()=>runActive?Math.max(0,30-(estado().m.voo.tempoS-start.voo.tempoS)):Infinity,
    observarDecisao(m,label,recorded) {
      $('lab-ai-situation').textContent=`Observed state: ${Math.round(m.voo.altitudeM*3.28084)} ft · ${Math.round(m.voo.velocidadeMs*1.94384)} kt · ${m.ameacas?.length??0} active hazards`;
      // Keep an observation window long enough to measure motion, not reset at each API response.
      if(!effect||m.voo.tempoS-effect.time>=5)effect={time:m.voo.tempoS,alt:m.voo.altitudeM,speed:m.voo.velocidadeMs,label,recorded};
    },
    actualizar(m,{previousFlight}={}) {
      const s=estado(),hadContact=Boolean(tracker?.touchdown);
      tracker=updateLandingTracker(tracker,m,{previousFlight});
      if(!hadContact&&tracker.touchdown)sound.toque?.(tracker.touchdown.sinkRateMs??0);
      if(start&&m.piloto.tipo!==start.piloto.tipo)flags.authorityChanged=true;
      if(runActive&&(m.resultado||m.voo.tempoS-start.voo.tempoS>=29.999))finishRun();
      tutorial=updateFirstFlight(tutorial,m,{panelVisible:panelVisible(),paused:s.pausa,visible:!document.hidden});
      if(performance.now()-lastPaint<100)return;
      lastPaint=performance.now();
      const reportKey=JSON.stringify(tracker.report);
      if(reportKey!==resultKey){resultKey=reportKey;renderReport(tracker.report,$('lab-landing-report'));renderReport(tracker.report,$('lab-final-report'));}
      $('lab-tutorial').hidden=!tutorial||!['active','complete'].includes(tutorial.status);
      if(tutorial){$('lab-tutorial-title').textContent=tutorial.title;$('lab-tutorial-text').textContent=tutorial.instruction;
        $('lab-tutorial-skip').textContent=tutorial.status==='complete'?'Done':'Skip';
        if(tutorial.status==='complete')try{localStorage.setItem('lus222-first-flight','complete');}catch{/* session works */}}
      const guide=deriveApproach(m),visible=$('lab-guide-enabled').checked;
      $('lab-approach').hidden=!visible||m.piloto.tipo!=='humano';
      if(visible){$('lab-approach-title').textContent=guide.goAround?'GO AROUND ADVISED':'VISUAL APPROACH · ADVICE';
        $('lab-approach-reading').textContent=guide.available?`Threshold ${value(guide.distanceToThresholdM,'m')} · centreline ${value(guide.lateralOffsetM,'m')} · path ${value(guide.glidepathErrorM,'m')}`:'No runway reference';
        $('lab-approach-text').textContent=guide.instruction;$('lab-approach').classList.toggle('is-warning',guide.goAround);}
      const engines=m.voo.motores,canControl=m.perfil===PERFIL_PROGRESSIVO&&!s.fim;
      for(const side of ['esquerdo','direito']){
        const e=engines?.[side];$('lab-engine-'+side).textContent=`${engineName(e)} · ${value(e?.potencia==null?null:e.potencia*100,'%')} · ${value(e?.consumoKgS==null?null:e.consumoKgS*3600,'kg/h')}`;
        const input=document.querySelector(`[data-engine-power="${side}"]`);
        if(document.activeElement!==input)input.value=Math.round((e?.acelerador??m.voo.acelerador??0)*100);
      }
      for(const b of document.querySelectorAll('[data-engine-fail],[data-engine-power],#lab-engine-reset,#lab-engine-rudder'))b.disabled=!canControl;
      $('lab-engine-compensation').textContent=engines?`Illustrative rudder compensation: ${value(engines.lemeCompensacao*100,'%')}. Match power or apply rudder to limit yaw.`:'Independent engine simulation is unavailable in this historical recording.';
      if(effect){const elapsed=m.voo.tempoS-effect.time;
        $('lab-observed-effect').textContent=`${effect.recorded?'Recorded':'Live'} observation · ${effect.label}. Since ${effect.time.toFixed(1)} s: altitude ${signed((m.voo.altitudeM-effect.alt)*3.28084)} ft, speed ${signed((m.voo.velocidadeMs-effect.speed)*1.94384)} kt over ${elapsed.toFixed(1)} s. Includes dynamics and protection; not an isolated causal result.`;}
      $('lab-compare-progress').textContent=runActive?`${m.piloto.tipo==='jev'?'Live AI':'Human'} sample · ${(m.voo.tempoS-start.voo.tempoS).toFixed(1)} / 30 s · auto-pause at end`:'Fixed 30 s samples · same seed, conditions and assisted controls · live AI only';
    },
  };
}
