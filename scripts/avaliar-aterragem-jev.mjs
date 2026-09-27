// Opt-in paid evaluation; never part of npm test.
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {POST} from '../api/jev.js';
import {criarVooProgressivo} from '../public/src/simulador.js';
import {iniciarAterragemAI,estadoAterragem,decidirAterragemAI} from '../public/src/ai-landing.js';
import {avancarMissao} from '../public/src/simulacao.js';
let m=iniciarAterragemAI(criarVooProgressivo(222,{tempo:'poucas_nuvens'}));const decisions=[];let phase=null,next=0;
for(let i=0;i<500&&!m.resultado&&decisions.length<100;i++){
 if(!m.voo.emSolo&&(m.aiLanding.phase!==phase||m.voo.tempoS>=next)){
  const state=estadoAterragem(m),started=m.voo.tempoS;
  const r=await POST(new Request('http://localhost/api/jev',{method:'POST',body:JSON.stringify({momento:'aterragem',estado:state})}));const d=await r.json();
  if(!r.ok){console.log(JSON.stringify({status:r.status,error:d.erro}));break;}
  m=decidirAterragemAI(m,d.answers.landingDecision.choice,{phase:state.phase,tempoS:started});
  decisions.push({time:started,state,answer:d.answers.landingDecision,ms:d.latencia_ms,model:d.modelo});
  if(phase!==state.phase||d.answers.landingDecision.choice!=='continue')console.log(JSON.stringify({t:started,phase:state.phase,choice:d.answers.landingDecision.choice}));
  phase=state.phase;next=started+5;
 }
 m=avancarMissao(m,1);
}
const report={testedAt:new Date().toISOString(),note:'Actual JEV endpoint function and fixed-step physics. Accelerated simulation; fresh judgement every 5 simulated seconds and each phase, not browser/network timing.',result:m.resultado,phase:m.aiLanding.phase,flightSeconds:m.voo.tempoS,touchdown:m.voo.contacto,requests:decisions.length,decisions};
await writeFile(process.argv[2]||join(tmpdir(),'jev-landing-live-evaluation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({result:report.result,phase:report.phase,flightSeconds:report.flightSeconds,touchdown:report.touchdown,requests:report.requests}));

if(report.result!=='chegou')process.exitCode=1;
