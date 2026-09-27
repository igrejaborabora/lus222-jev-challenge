/** The landing is a document; the simulator keeps its own viewport and lifecycle. */
export function criarLandingLab({start}) {
  const screen=document.getElementById('screen-splash');
  for(const button of screen.querySelectorAll('[data-lab-start]'))button.addEventListener('click',()=>{
    const action=button.dataset.labStart;
    start(action==='ai'?{piloto:'jev-gravado',desdeS:100}:action==='land'?{exercicio:'aproximacao',guiaVisual:true}:action==='learn'?{primeiroVoo:true}:{});
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
}
