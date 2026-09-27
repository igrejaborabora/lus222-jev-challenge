import { estadoCockpit, escalaInstrumento } from './cockpit-model.js';
import { criarNavegacaoCockpit, velocidadeSoloNavegacao } from './cockpit-navigation.js';

const $=id=>document.getElementById(id);
const n=(v,d=0)=>Number(v).toLocaleString('en-GB',{maximumFractionDigits:d,minimumFractionDigits:d});
const field=(key,label,unit='',id='')=>`<div class="cp-reading"><span>${label}</span><strong ${id?`id="${id}"`:''} data-instrumento="${key}">—</strong><small>${unit}</small></div>`;
const tape=(type,label,unit,id,key)=>`<div class="cp-tape cp-tape-${type}"><span>${label}</span><svg viewBox="0 0 68 200" aria-hidden="true"><g data-cp-tape="${type}"></g></svg><div class="cp-tape-value"><b id="${id}" data-instrumento="${key}">—</b></div><small>${unit}</small></div>`;
const toggle=(id,label)=>`<label class="cp-switch"><input type="checkbox" data-cp-proxy="${id}"><span>${label}</span></label>`;
const target=(id,label,knob,min,max,step)=>`<div class="cp-target"><span>${label}</span><input aria-label="Cockpit ${label} target" type="number" min="${min}" max="${max}" step="${step}" data-cp-proxy="${id}"><button type="button" class="cp-knob cp-selector" data-cp-knob="${knob}" aria-label="Adjust ${label} target" title="Drag vertically, scroll or use arrow keys. Apply to engage."></button></div>`;

/** One presentation of the existing command handlers; no separate flight authority. */
export function criarCockpitUI(host,{onLayout=()=>{},onInteract=()=>{}}={}) {
  const horizon=host.querySelector('.sim-atitude svg').outerHTML;
  host.classList.add('cp-root');host.dataset.tab='pfd';
  host.innerHTML=`
    <div class="cp-top"><span><b>LUS–222</b> FLIGHT DECK</span><button type="button" class="cp-mode" id="cp-mode" aria-pressed="true" title="Switch between manual attitude and assisted flight">MANUAL ATTITUDE</button><div><label class="cp-dimmer" title="Panel backlight">DIM <input id="cp-brightness" type="range" aria-label="Panel brightness" min="45" max="100" value="90"></label><button type="button" id="cp-expand" aria-pressed="false" title="Expand instrument panel">⛶ <span>Expand</span></button><button type="button" data-cp-click="sim-instrumentos-toggle" title="Hide panel · I">Hide [I]</button></div></div>
    <p class="sim-aviso-voo" id="sim-aviso-voo" data-instrumento="aviso" role="status" hidden></p>
    <div class="cp-autopilot" aria-label="Flight targets">
      <label class="cp-mode-select"><span>VERTICAL MODE</span><select data-cp-proxy="sim-modo-vertical" aria-label="Cockpit vertical mode"><option value="livre">MANUAL</option><option value="altitude">ALT HOLD</option><option value="vertical">VS HOLD</option></select></label>
      ${target('sim-alvo-rumo','HDG','heading',0,359,1)}${target('sim-alvo-alt','ALT','altitude',40,11480,10)}${target('sim-alvo-vs','VS','vertical',-1500,1500,50)}
      ${toggle('sim-seguir-rumo','HDG HOLD')}<button type="button" data-cp-action="targets" class="cp-apply">APPLY</button><button type="button" data-cp-action="level">LEVEL</button><button type="button" data-cp-click="sim-borrego">GO AROUND</button>
    </div>
    <nav class="cp-tabs" aria-label="Cockpit displays"><button type="button" data-cp-tab="pfd" aria-pressed="true">01 / FLIGHT</button><button type="button" data-cp-tab="nav" aria-pressed="false">02 / NAV</button><button type="button" data-cp-tab="systems" aria-pressed="false">03 / SYSTEMS</button></nav>
    <div class="cp-mini" aria-label="Compact flight readings">${field('velocidade','SPEED','KT')}${field('altitude','ALTITUDE','FT')}${field('vertical','VERTICAL','FT/MIN')}${field('rumo','HEADING','°')}${field('agl','HEIGHT AGL','FT')}${field('potencia','POWER','%')}</div><div class="cp-displays">
      <section class="cp-screen cp-pfd" data-cp-screen data-cp-page="pfd" aria-label="Primary flight display">
        <header><span>PRIMARY FLIGHT DISPLAY</span><b id="cp-guidance">MANUAL</b></header>
        <div class="cp-pfd-body">
          ${tape('speed','AIRSPEED','KT','sim-vel','velocidade')}
          <div class="cp-attitude">${horizon}<div class="cp-attitude-status"><span>NOSE <b data-instrumento="pitch">0°</b></span><span>BANK <b data-instrumento="bank">0°</b></span><span>PATH <b data-instrumento="trajectoria">0°</b></span></div><div class="cp-heading"><span>HDG</span><b id="sim-rumo" data-instrumento="rumo">—</b><span>°</span><i id="cp-heading-bug">△</i></div></div>
          ${tape('alt','ALTITUDE','FT','sim-alt','altitude')}
          <div class="cp-vsi"><span>VS</span><div class="cp-vsi-scale"><small>+6</small><small>0</small><small>−6</small><i id="sim-vsi-agulha"></i></div><b data-instrumento="vertical">—</b><small>FT/MIN</small></div>
        </div>
        <footer><span>AGL <b data-instrumento="agl">—</b> FT</span><span data-instrumento="movimento">Level</span><span>CMD <b data-instrumento="intencao">—</b></span></footer>
      </section>
      <section class="cp-screen cp-nav" data-cp-screen data-cp-page="nav" aria-label="Navigation display">
        <header><span>NAVIGATION / PORTO</span><div><button type="button" id="cp-orientation" aria-pressed="false" title="Toggle heading-up">N ↑</button><select id="cp-range" aria-label="Map range"><option value="2">2 NM</option><option value="5" selected>5 NM</option><option value="10">10 NM</option><option value="20">20 NM</option></select></div></header>
        <canvas id="cp-nav-canvas" role="img" aria-label="Schematic navigation map with aircraft, route, runway and simulated traffic"></canvas>
        <footer><span>GS <b id="cp-ground-speed">—</b> KT</span><span id="cp-nav-destination">—</span></footer>
      </section>
      <section class="cp-screen cp-systems" data-cp-screen data-cp-page="systems" aria-label="Aircraft systems">
        <header><span>AIRCRAFT SYSTEMS</span><button type="button" id="cp-checklist-toggle" aria-pressed="false">CHECKLIST</button></header>
        <div class="cp-systems-body" id="cp-systems-body">
          <div class="cp-gauges"><div class="cp-power-dial"><svg viewBox="0 0 110 86" aria-hidden="true"><path d="M17 67A44 44 0 1 1 93 67" class="cp-arc-back"/><path id="cp-power-arc" pathLength="100" d="M17 67A44 44 0 1 1 93 67" class="cp-arc-value"/><path id="cp-power-needle" d="M55 52L25 65"/><circle cx="55" cy="52" r="3"/></svg><span>POWER</span><strong id="sim-pot" data-instrumento="potencia">—</strong><small>% / OUTPUT</small></div><div class="cp-fuel">${field('combustivel','FUEL','KG','sim-fuel')}<div class="cp-fuel-track"><i id="cp-fuel-bar"></i></div>${field('consumo','FUEL FLOW','KG/H')}</div></div>
          <div class="cp-engine-status"><span id="cp-engine-left">L —</span><span id="cp-engine-right">R —</span></div><div class="cp-system-stats">${field('autonomia','ENDURANCE','MIN')}${field('massa','MASS','KG')}</div>
          <div class="cp-system-positions"><span>FLAPS <b id="cp-flaps-value">0%</b><meter id="cp-flaps-meter" min="0" max="100" value="0"></meter></span><span>TRIM <b id="cp-trim-value">0%</b><i class="cp-trim-track"><i id="cp-trim-marker"></i></i></span></div>
        </div>
        <div class="cp-checklist" id="cp-checklist" hidden><select id="cp-checklist-phase" aria-label="Checklist phase"><option value="departure">BEFORE TAKE-OFF</option><option value="landing">BEFORE LANDING</option></select><ul id="cp-checklist-items"></ul><small>Live training checks · pilot verifies runway and traffic.</small></div>
        <footer><span id="cp-gear">GEAR DOWN</span><span id="cp-brakes-state">BRAKES OFF</span><span>ILLUSTRATIVE</span></footer>
      </section>
    </div>
    <div class="cp-console">
      <label class="cp-lever"><span class="cp-knob" data-cp-knob="power" aria-hidden="true"></span><span>POWER <output id="cp-power-out">55%</output></span><input type="range" min="0" max="100" step="1" data-cp-proxy="sim-potencia-range" aria-label="Cockpit throttle"></label>
      <label class="cp-lever"><span class="cp-knob" data-cp-knob="trim" aria-hidden="true"></span><span>TRIM <output id="cp-trim-out">0%</output></span><input type="range" min="-100" max="100" step="1" data-cp-proxy="sim-trim" aria-label="Cockpit trim"></label>
      <label class="cp-flaps-control"><span>FLAPS</span><select data-cp-proxy="sim-flaps" aria-label="Cockpit flaps"><option value="0">UP</option><option value="0.35">TAKE-OFF</option><option value="0.65">APPROACH</option><option value="1">FULL</option></select></label>
      <div class="cp-switches">${toggle('sim-travao','BRAKES')}${toggle('sim-luzes-nav','NAV')}${toggle('sim-luzes-pista','LAND')}</div>
      <div class="cp-ai"><span id="cp-ai-label">HUMAN CONTROL</span><b id="cp-ai-decision">You have the controls</b><div><button type="button" data-cp-click="sim-piloto-jev">AI PILOT</button><button type="button" data-cp-click="sim-piloto-humano">TAKE CONTROL</button></div></div>
    </div>
    <div class="cp-bottom"><span>PIXELGRAMMAR / JEV</span><span>ALT TARGET <b data-instrumento="alvo">—</b></span><span>SIMULATED SYSTEMS</span></div>`;
  const proxies=[...host.querySelectorAll('[data-cp-proxy]')];
  for(const proxy of proxies) {
    const source=$(proxy.dataset.cpProxy);
    proxy.value=source.value;if(proxy.type==='checkbox')proxy.checked=source.checked;
    for(const name of ['required','min','max','step'])if(source.hasAttribute(name))proxy.setAttribute(name,source.getAttribute(name));
    const event=proxy.matches('select,input[type=checkbox]')?'change':'input';
    proxy.addEventListener(event,()=>{
      if(proxy.type==='checkbox')source.checked=proxy.checked;else source.value=proxy.value;
      source.dispatchEvent(new Event('input',{bubbles:true}));
      if(event==='change')source.dispatchEvent(new Event('change',{bubbles:true}));
    });
  }
  for(const b of host.querySelectorAll('[data-cp-click]'))b.addEventListener('click',()=>$(b.dataset.cpClick).click());
  host.querySelector('[data-cp-action=targets]').addEventListener('click',()=>{
    const invalid=proxies.find(p=>p.type==='number'&&!p.checkValidity());
    if(invalid){invalid.reportValidity();return;}
    $('sim-alvos').requestSubmit();
  });
  for(const knob of host.querySelectorAll('.cp-selector')) {
    const input=knob.parentElement.querySelector('input');let drag=null;
    const adjust=delta=>{
      const step=Number(input.step),min=Number(input.min),max=Number(input.max);
      input.value=String(Math.max(min,Math.min(max,(Number(input.value)||0)+delta*step)));
      input.dispatchEvent(new Event('input',{bubbles:true}));onInteract();
    };
    knob.addEventListener('wheel',e=>{e.preventDefault();adjust(e.deltaY<0?1:-1);},{passive:false});
    knob.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key))return;e.preventDefault();e.stopPropagation();adjust(['ArrowUp','ArrowRight'].includes(e.key)?1:-1);});
    knob.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag=e.clientY;knob.setPointerCapture(e.pointerId);});
    knob.addEventListener('pointermove',e=>{if(drag==null)return;const steps=Math.trunc((drag-e.clientY)/6);if(steps){adjust(steps);drag-=steps*6;}});
    knob.addEventListener('lostpointercapture',()=>{drag=null;});
  }
  host.addEventListener('click',e=>{if(e.target.closest('button,input[type=checkbox],select'))onInteract();});
  host.querySelector('[data-cp-action=level]').addEventListener('click',()=>document.querySelector('#sim-actuacao [data-eixo=vertical][data-valor=manter]').click());
  const nav=criarNavegacaoCockpit($('cp-nav-canvas'));
  let shell=null,generation=0,visible=true,expanded=false,headingUp=false,active=false,last=null;
  const layout=()=>{nav.resize();shell?.resize();onLayout();};
  const observer=new ResizeObserver(()=>{if(visible&&active)layout();});observer.observe(host);
  for(const button of host.querySelectorAll('[data-cp-tab]'))button.addEventListener('click',()=>{
    host.dataset.tab=button.dataset.cpTab;
    for(const b of host.querySelectorAll('[data-cp-tab]'))b.setAttribute('aria-pressed',String(b===button));
    requestAnimationFrame(layout);
  });
  $('cp-mode').addEventListener('click',()=>{const source=$('sim-modo-voo');source.value=source.value==='avancado'?'assistido':'avancado';source.dispatchEvent(new Event('change',{bubbles:true}));});
  $('cp-expand').addEventListener('click',()=>{expanded=!expanded;host.classList.toggle('cp-expanded',expanded);$('cp-expand').setAttribute('aria-pressed',String(expanded));$('cp-expand').querySelector('span').textContent=expanded?'Compact':'Expand';requestAnimationFrame(layout);});
  $('cp-range').addEventListener('change',()=>nav.setRange(Number($('cp-range').value)));
  $('cp-orientation').addEventListener('click',()=>{headingUp=!headingUp;nav.setHeadingUp(headingUp);$('cp-orientation').textContent=headingUp?'HDG ↑':'N ↑';$('cp-orientation').setAttribute('aria-pressed',String(headingUp));});
  $('cp-checklist-toggle').addEventListener('click',()=>{const shown=$('cp-checklist').hidden;$('cp-checklist').hidden=!shown;$('cp-systems-body').hidden=shown;$('cp-checklist-toggle').setAttribute('aria-pressed',String(shown));});
  $('cp-brightness').addEventListener('input',()=>{host.style.setProperty('--cp-brightness',String(Number($('cp-brightness').value)/100));if(last)update(last);});
  async function startShell() {
    const gen=++generation;
    if(!visible||!active||shell)return;
    if(new URLSearchParams(location.search).has('sem-webgl'))return;
    try {
      const {criarCockpitShell}=await import('./cockpit-shell.js');
      if(gen!==generation||!active||!visible)return;
      const result=await criarCockpitShell(host);
      if(gen!==generation||!active||!visible){result.dispose();return;}
      shell=result;host.dataset.shell='3d';shell.resize();if(last)update(last);
    }catch {host.dataset.shell='css';}
  }
  function update(m) {
    last=m;if(!visible||!active)return;
    const c=estadoCockpit(m);nav.actualizar(m);
    for(const [type,value,step] of [['speed',c.velocidadeKt,10],['alt',c.altitudeFt,100]]) {
      host.querySelector(`[data-cp-tape=${type}]`).innerHTML=escalaInstrumento(value,step).map(t=>`<path d="M48 ${t.y}h14"/><text x="43" y="${t.y+4}">${Math.round(t.value)}</text>`).join('');
    }
    $('cp-mode').textContent=c.mode;
    $('cp-mode').setAttribute('aria-pressed',String(m.controlos?.modo==='avancado')); 
    $('cp-guidance').textContent=m.controlos?.aproximacao?'APP GUIDANCE':m.controlos?.altitudeM!=null?'ALT CAPTURE':m.controlos?.verticalMs!=null?'VS HOLD':m.piloto.tipo==='humano'?'MANUAL':'AI PILOT';
    $('cp-flaps-value').textContent=`${n(c.flapsPct)}%${Math.abs(c.flapsTargetPct-c.flapsPct)>1?' → '+n(c.flapsTargetPct)+'%':''}`;
    $('cp-flaps-meter').value=c.flapsPct;$('cp-trim-value').textContent=`${c.trimPct>0?'+':''}${n(c.trimPct)}%`;
    $('cp-trim-marker').style.left=`${(c.trimPct+100)/2}%`;
    $('cp-power-out').textContent=`${n((m.voo.acelerador??m.voo.potencia)*100)}%`;
    for(const [id,label,side] of [['cp-engine-left','L','esquerdo'],['cp-engine-right','R','direito']]) { const e=m.voo.motores?.[side];$(id).textContent=e?`${label} ${n(e.potencia*100)}%${e.estado!=='operacional'?' / OFF':''}`:`${label} —`;$(id).classList.toggle('failed',Boolean(e&&e.estado!=='operacional')); }$('cp-trim-out').textContent=`${n(c.trimPct)}%`;
    $('cp-power-arc').style.strokeDasharray=`${c.potenciaPct} 100`;
    $('cp-power-needle').setAttribute('transform',`rotate(${c.potenciaPct*2.4} 55 52)`);
    $('cp-fuel-bar').style.height=`${Math.min(100,c.combustivelKg/600*100)}%`;
    $('cp-brakes-state').textContent=c.brakes?'BRAKES ON':'BRAKES OFF';$('cp-brakes-state').classList.toggle('cp-amber',c.brakes);
    $('cp-ai-label').textContent=m.piloto.tipo==='humano'?'HUMAN CONTROL':m.piloto.tipo==='jev-gravado'?'JEV / RECORDED':'JEV / LIVE AI';
    $('cp-ai-decision').textContent=m.piloto.tipo==='humano'?'You have the controls':$('sim-decisao-manobra').textContent;
    host.querySelector('.cp-ai').classList.toggle('cp-ai-active',m.piloto.tipo!=='humano');
    const to=m.destinos?.find(d=>d.id===m.destinoId),dist=to?Math.hypot(to.xM-m.voo.xM,to.zM-m.voo.zM)/1852:0;
    $('cp-nav-destination').textContent=to?`${to.tipo==='aeroporto'?'RWY':'NEXT'} ${n(dist,1)} NM`:'NO ROUTE';
    $('cp-ground-speed').textContent=n(velocidadeSoloNavegacao(m).soloKt);
    $('cp-heading-bug').hidden=m.controlos?.rumoRad==null;
    const phase=$('cp-checklist-phase').value;
    $('cp-checklist-items').replaceChildren(...c.checklist[phase].map(([label,ready])=>{const li=document.createElement('li');li.textContent=`${ready?'✓':'○'} ${label}`;li.className=ready?'cp-ready':'';return li;}));
    for(const proxy of proxies) {
      const source=$(proxy.dataset.cpProxy);proxy.disabled=source.disabled;
      if(document.activeElement===proxy)continue;
      if(proxy.type==='checkbox')proxy.checked=source.checked;else proxy.value=source.value;
    }
    const selectorValue=key=>{const input=host.querySelector(`.cp-selector[data-cp-knob=${key}]`).parentElement.querySelector('input');return (Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min));};
    shell?.render({heading:selectorValue('heading'),altitude:selectorValue('altitude'),vertical:selectorValue('vertical'),power:m.voo.acelerador??c.potenciaPct/100,trim:c.trimPct/100,flaps:c.flapsPct/100,brightness:Number($('cp-brightness').value)/100});
  }
  return {
    actualizar:update,
    iniciar(){active=true;last=null;void startShell();requestAnimationFrame(layout);},
    setVisible(value){visible=value;host.hidden=!value;shell?.setVisible(value);if(value){if(!shell)void startShell();requestAnimationFrame(layout);if(last)update(last);}},
    resize(){if(visible&&active){nav.resize();shell?.resize();}},
    parar(){active=false;generation++;shell?.dispose();shell=null;delete host.dataset.shell;},
    dispose(){this.parar();observer.disconnect();nav.dispose?.();},
  };
}
