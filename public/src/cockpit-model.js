import { actuacaoEfectiva } from './piloto-sim.js';
import { instrumentosDeVoo } from './instrumentos.js';

export const PAINEL_PREF = 'lus222-cockpit-visible';
export function painelGuardado(storage) {
  try { return storage.getItem(PAINEL_PREF) !== 'hidden'; } catch { return true; }
}
export function guardarPainel(storage, visible) {
  try { storage.setItem(PAINEL_PREF, visible ? 'visible' : 'hidden'); } catch { /* Session state still works. */ }
}
export function desvioDoPainel({ visible, viewportHeight, coveredHeight }) {
  return visible ? Math.min(viewportHeight * .28, Math.max(0, coveredHeight) * (viewportHeight < 700 ? .55 : .4)) : 0;
}
export function escalaInstrumento(value, step, pixels = 24) {
  const centre = Math.round(value / step) * step;
  return Array.from({length:7}, (_,i) => centre + (i-3)*step).filter(n=>n>=0)
    .map(n=>({value:n, y:100+(value-n)/step*pixels}));
}
export function estadoCockpit(m) {
  const i = instrumentosDeVoo(m);
  const v=m.voo,c=m.controlos??{};
  const a=actuacaoEfectiva(m.piloto,v.tempoS);
  const guided=a.fonte!=='supervisor'&&c.aproximacao&&Boolean(m.pistas?.[0]);
  const brakes=Boolean(c.travao>0||a.travao>0||(guided&&v.emSolo));
  return {...i, flapsPct:(v.flaps??0)*100, flapsTargetPct:(guided ? .65 : c.flaps??0)*100,
    trimPct:(c.trim??0)*100, rudderPct:(c.leme??0)*100,
    brakes, navLights:c.luzesNav!==false, landingLights:Boolean(c.luzesAterragem),
    ground:Boolean(v.emSolo), mode:c.modo==='avancado'?'MANUAL ATTITUDE':'ASSISTED',
    checklist:{
      departure:[['Brakes released',!brakes],['Take-off flaps',Math.abs((v.flaps??0)-.35)<.03],['Landing lights',Boolean(c.luzesAterragem)],['Take-off power',i.potenciaPct>=90]],
      landing:[['Approach flaps',(v.flaps??0)>=.6],['Landing lights',Boolean(c.luzesAterragem)],['Speed below 165 kt',v.velocidadeMs<85],['Descent below 590 ft/min',v.velocidadeVerticalMs>=-3]],
    },
  };
}
