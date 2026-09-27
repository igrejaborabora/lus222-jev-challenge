import { novaAssinatura, avancarAssinatura } from './flight-signature.js';
const GLIFOS={
 P:['11110','10001','10001','11110','10000','10000','10000'],
 X:['10001','10001','01010','00100','01010','10001','10001'],
 D:['11110','10001','10001','10001','10001','10001','11110'],
 E:['11111','10000','10000','11110','10000','10000','11111'],
 V:['10001','10001','10001','10001','10001','01010','00100'],
 L:['10000','10000','10000','10000','10000','10000','11111'],
 O:['01110','10001','10001','10001','10001','10001','01110'],
 B:['11110','10001','10001','11110','10001','10001','11110'],
 Y:['10001','10001','01010','00100','00100','00100','00100'],
 I:['11111','00100','00100','00100','00100','00100','11111'],
 G:['01110','10001','10000','10111','10001','10001','01110'],
 R:['11110','10001','10001','11110','10100','10010','10001'],
 A:['01110','10001','10001','11111','10001','10001','10001'],
 M:['10001','11011','10101','10101','10001','10001','10001'],
 C:['01111','10000','10000','10000','10000','10000','01111'],
 '.':['00000','00000','00000','00000','00000','00110','00110'],
 '·':['00000','00000','00000','00100','00000','00000','00000'],
};
function desenhar(canvas) {
 const frase='PX · DEVELOPED BY PIXELGRAMMAR.COM',ctx=canvas.getContext('2d');
 if(!ctx)return;
 canvas.width=frase.length*12;canvas.height=14;
 ctx.fillStyle='#a4eddf';
 [...frase].forEach((letra,i)=>(GLIFOS[letra]??[]).forEach((linha,y)=>[...linha].forEach((p,x)=>{if(p==='1')ctx.fillRect(i*12+x*2,y*2,1.5,1.5);})));
 canvas.parentElement.classList.add('pixel-ready');
}
export function criarAssinaturaUI(host,toggle) {
 let s=novaAssinatura(),hover=false;
 const link=host.querySelector('a'),canvas=host.querySelector('canvas');
 const reduzido=matchMedia('(prefers-reduced-motion: reduce)');
 try {toggle.checked=localStorage.getItem('px-flight-signature')!=='off';}catch{/* Storage may be disabled. */}
 toggle.addEventListener('change',()=>{s=novaAssinatura();host.hidden=true;try{localStorage.setItem('px-flight-signature',toggle.checked?'on':'off');}catch{/* Optional preference. */}});
 link.addEventListener('pointerenter',()=>{hover=true;});link.addEventListener('pointerleave',()=>{hover=false;});
 link.addEventListener('focus',()=>{hover=true;});link.addEventListener('blur',()=>{hover=false;});
 desenhar(canvas);
 return {
  reiniciar(){s=novaAssinatura();host.hidden=true;},
  actualizar(dt,{activa,ocupado}) {
   s=avancarAssinatura(s,hover?0:dt,{activa:activa&&!document.hidden,ocupado,permitida:toggle.checked,reduzido:reduzido.matches});
   host.hidden=!s.visivel;
   if(!s.visivel)return;
   host.dataset.motion=s.progresso==null?'static':'scroll';
   const p=s.progresso;
   link.style.transform=p==null?'translateX(-50%)':`translateX(${-(host.clientWidth+link.offsetWidth)*p}px)`;
  },
 };
}
