/** Shared bounded contract for live JEV landing judgements; no free-text instructions. */
export const LANDING_CHOICES=Object.freeze(['continue','hold','go_around','unable']);
const PHASES=['joining','aligning','descending','flare','rollout','stopped','holding','go-around'];
const LIMITS={altitude_m:[0,6000],speed_mps:[0,160],vertical_mps:[-160,160],heading_error_deg:[-180,180],lateral_m:[-200000,200000],distance_threshold_m:[-200000,200000],glide_error_m:[-20000,20000],flaps:[0,1],fuel_kg:[0,3000],engines_available:[0,2]};
const WEATHER={visibility_km:[0,100],crosswind_mps:[0,60],turbulence:[0,1],rain:[0,1]};
function numbers(source,limits) {
  if(!source||typeof source!=='object'||Array.isArray(source))return null;
  const out={};
  for(const [key,[min,max]] of Object.entries(limits)){
    const v=source[key];if(!Number.isFinite(v)||v<min||v>max)return null;
    out[key]=Math.round(v*100)/100;
  }
  return out;
}
export function lerEstadoAterragem(raw) {
  if(!raw||!PHASES.includes(raw.phase)||!['clear','nearby','conflict'].includes(raw.traffic)||typeof raw.stable!=='boolean'||typeof raw.weather_suitable!=='boolean')return null;
  const fields=numbers(raw,LIMITS),weather=numbers(raw.weather,WEATHER);
  if(!fields||!weather||!Number.isInteger(fields.engines_available))return null;
  return {objective:'land_at_porto',phase:raw.phase,...fields,weather,traffic:raw.traffic,stable:raw.stable,weather_suitable:raw.weather_suitable};
}
export const PERGUNTAS_ATERRAGEM=Object.freeze({
  landingDecision:{type:'choice',instructions:'You are JEV selecting the next landing intent in an illustrative flight simulator. A continuous controller handles the arithmetic, approach routing, heading, throttle, descent, flaps, flare and braking. Select continue in joining/aligning to let it establish the approach when weather_suitable and engines_available=2, fuel remains and traffic is not conflict. Stable is only meaningful on final, so do not hold just because stable=false in joining/aligning/holding. In descending/flare, continue only when stable=true and conditions remain suitable; otherwise select go_around. Select hold for unsuitable weather or conflicting traffic before final. During go-around let the controller climb; continue means authorise rejoining afterwards, never reverse the climb. On rollout/stopped the controller must finish braking; continue is appropriate. If the facts do not support any available intent, select unable. These are simulated choices, not real aviation procedures.',criteria:{
    continue:'Continue the current guided phase, or rejoin after a completed hold/go-around.',
    hold:'Delay the approach at the entry altitude. On final this becomes a go-around.',
    go_around:'Discontinue the approach, climb and set up another attempt.',
    unable:'None of the options fits the evidence. Keep guidance conservative and request reassessment.'
  }}
});
export function respostaAterragemValida(answers) {
  const a=answers?.landingDecision;
  if(!a||!LANDING_CHOICES.includes(a.choice))return false;
  if(a.confidence!=null&&(!Number.isFinite(a.confidence)||a.confidence<0||a.confidence>1))return false;
  if(a.probabilities!=null){
    const p=a.probabilities;
    if(typeof p!=='object'||Array.isArray(p)||!(a.choice in p)||Object.entries(p).some(([k,v])=>!LANDING_CHOICES.includes(k)||!Number.isFinite(v)||v<0||v>1))return false;
    if(Math.abs(Object.values(p).reduce((a,b)=>a+b,0)-1)>.05)return false;
  }
  return true;
}
