function primeiroVooPendente() {
  try{return localStorage.getItem('lus222-first-flight')!=='complete';}
  catch{return true;}
}

/** Native dialog owns focus trapping; live availability never selects a replay for the visitor. */
function criarEscolhaVoo({start,verificarLive}) {
  const $=id=>document.getElementById(id);
  const dialog=$('lab-flight-choice'),launch=$('lab-choice-start');
  const pilots=[...dialog.querySelectorAll('[name="lab-pilot-choice"]')];
  const goals=[...dialog.querySelectorAll('[name="lab-ai-goal"]')];
  let disponivel=null,geracao=0,origem=null,backdrop=false;
  const piloto=()=>pilots.find(input=>input.checked).value;
  const objectivo=()=>goals.find(input=>input.checked).value;
  function pintar() {
    const ai=piloto()==='jev';
    $('lab-choice-human').hidden=ai;
    $('lab-choice-ai-detail').hidden=!ai;
    $('lab-choice-replay').hidden=!ai;
    dialog.dataset.pilot=ai?'jev':'humano';
    launch.disabled=ai&&disponivel!==true;
    launch.firstChild.textContent=ai?(objectivo()==='aterrar'?'Start AI landing ':'Start AI route '):'Start flight ';
    const status=$('lab-choice-live-status');
    status.textContent=disponivel===null?'Checking live JEV…':disponivel?'● Live JEV available':'○ Live JEV unavailable. Try again or choose a recorded route.';
    status.dataset.state=disponivel===null?'checking':disponivel?'ready':'unavailable';
    $('lab-choice-retry').hidden=disponivel!==false;
  }
  async function verificar() {
    const pedido=++geracao;let timeout;
    disponivel=null;pintar();
    try{
      const resultado=await Promise.race([
        verificarLive(),
        new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),8000);}),
      ]);
      if(pedido!==geracao||!dialog.open)return;
      disponivel=resultado===true;
    }catch{if(pedido!==geracao||!dialog.open)return;disponivel=false;}
    finally{clearTimeout(timeout);}
    pintar();
  }
  function abrirEscolha(modo='humano',trigger=document.activeElement) {
    origem=trigger;
    for(const input of pilots)input.checked=input.value===modo;
    for(const input of goals)input.checked=input.value==='aterrar';
    disponivel=null;pintar();
    dialog.showModal();
    pilots.find(input=>input.checked).focus();
    void verificar();
  }
  function iniciar(options) {
    if(!dialog.open)return;
    origem=null;dialog.close();start(options);
  }
  for(const input of [...pilots,...goals])input.addEventListener('change',pintar);
  $('lab-choice-close').addEventListener('click',()=>dialog.close());
  $('lab-choice-retry').addEventListener('click',()=>void verificar());
  launch.addEventListener('click',()=>{
    if(piloto()==='jev'){
      if(disponivel===true)iniciar({piloto:'jev',objectivo:objectivo()});
    }else iniciar({piloto:'humano',primeiroVoo:primeiroVooPendente()});
  });
  $('lab-choice-recorded').addEventListener('click',()=>iniciar({piloto:'jev-gravado',objectivo:'rota',desdeS:100}));
  const fora=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
  dialog.addEventListener('pointerdown',e=>{backdrop=e.target===dialog&&fora(e);});
  dialog.addEventListener('click',e=>{if(backdrop&&e.target===dialog&&fora(e))dialog.close();backdrop=false;});
  dialog.addEventListener('close',()=>{++geracao;origem?.focus({preventScroll:true});origem=null;});
  return {abrirEscolha};
}

/** The landing is a document; the simulator keeps its own viewport and lifecycle. */
export function criarLandingLab({start,verificarLive}) {
  const screen=document.getElementById('screen-splash');
  const escolha=criarEscolhaVoo({start,verificarLive});
  for(const button of screen.querySelectorAll('[data-lab-start]'))button.addEventListener('click',()=>{
    const action=button.dataset.labStart;
    if(action==='ai'){escolha.abrirEscolha('jev',button);return;}
    start(action==='land'?{piloto:'humano',exercicio:'aproximacao',guiaVisual:true}:action==='learn'?{piloto:'humano',primeiroVoo:true}:{piloto:'humano'});
  });
  for(const a of screen.querySelectorAll('a[href^="#"]'))a.addEventListener('click',e=>{
    const target=document.getElementById(a.hash.slice(1));if(!target)return;
    e.preventDefault();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
    if(a.classList.contains('lab-skip')){target.tabIndex=-1;target.focus({preventScroll:true});}
  });
  const video=document.getElementById('lab-preview-video'),button=document.getElementById('lab-video-toggle');
  const pause=()=>{video.pause();button.textContent='Play preview ▷';button.setAttribute('aria-pressed','false');};
  button.addEventListener('click',async()=>{
    if(!video.paused){pause();return;}
    try{await video.play();button.textContent='Pause preview Ⅱ';button.setAttribute('aria-pressed','true');}
    catch{button.textContent='Preview unavailable · start flying above';}
  });
  new IntersectionObserver(([e])=>{if(!e.isIntersecting)pause();},{threshold:.1}).observe(video);
  new MutationObserver(()=>{if(!screen.classList.contains('active'))pause();}).observe(screen,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  return escolha;
}
