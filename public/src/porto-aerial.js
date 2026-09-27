/** Bounded photo surface; coordinates adapt to the existing illustrative scene. */
export const FOTO_PORTO = Object.freeze({
  mobile: './terrain/porto/ortho-2025-2048.jpg', desktop: './terrain/porto/ortho-2025-4096.jpg',
  west: -8.74, south: 41.11, east: -8.55, north: 41.28,
});
const clamp = v => Math.max(0, Math.min(1, v));
const smooth = v => { const t=clamp(v);return t*t*(3-2*t); };
export function coordenadasFotoPorto(x,z) {
  // Two scene anchors, not a survey/geographic coordinate system. +X is west.
  const lonPerM=1/(111320*Math.cos(41.2*Math.PI/180));
  const north=(z-165000)/12300;
  const lon=-8.6818-x*lonPerM+north*(-8.6818-(-8.6094+2200*lonPerM));
  const lat=41.237+north*(41.237-41.1406);
  return {lon,lat,u:(lon-FOTO_PORTO.west)/(FOTO_PORTO.east-FOTO_PORTO.west),v:(lat-FOTO_PORTO.south)/(FOTO_PORTO.north-FOTO_PORTO.south)};
}
export function pesoFotoPorto(x,z,h,pistas=[]) {
  const {u,v}=coordenadasFotoPorto(x,z);
  let peso=smooth(Math.min(u,v,1-u,1-v)/.045)*smooth((h-3)/8);
  for(const p of pistas) {
    const dx=x-p.x,dz=z-p.z,a=p.heading??0;
    const lateral=Math.abs(dx*Math.cos(a)-dz*Math.sin(a));
    const longitudinal=Math.abs(dx*Math.sin(a)+dz*Math.cos(a));
    const fora=Math.max(lateral-160,longitudinal-(p.comprimentoM??3480)/2-180);
    peso*=smooth(fora/260);
  }
  return peso;
}
