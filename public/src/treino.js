import { textoUI } from './copy-en.js';
/** Exercícios curtos com métricas calculadas no passo fixo, sem avaliações pelo modelo. */
export const EXERCICIOS = {
  livre: 'Free flight', solo: 'Take-off', aproximacao: 'Approach and landing',
  altitude: 'Hold 1,800 ft', rumo: 'Hold heading 090°',
};
export function novoTreino(tipo) {
  if (!EXERCICIOS[tipo] || tipo === 'livre') return null;
  return { tipo, segundos: 0, dentroS: 0, erroAcumulado: 0, oscilacao: 0, ultimoVS: 0, concluido: false, avaliacao: null };
}
export function avaliarTreino(t, voo, dt, resultado) {
  if (!t || t.concluido) return t;
  const altitude = t.tipo === 'altitude';
  const rumo = t.tipo === 'rumo';
  const erro = altitude ? Math.abs(voo.altitudeM - 1800 * 0.3048)
    : rumo ? Math.abs(Math.atan2(Math.sin(voo.rumoRad - Math.PI / 2), Math.cos(voo.rumoRad - Math.PI / 2))) * 180 / Math.PI : 0;
  const segundos = t.segundos + dt;
  const dentroS = t.dentroS + (erro <= (altitude ? 15.24 : 5) ? dt : 0);
  const concluido = Boolean(resultado) || ((altitude || rumo) && segundos >= 60)
    || (t.tipo === 'solo' && !voo.emSolo && voo.altitudeM >= 150);
  const r = { ...t, segundos, dentroS, erroAcumulado: t.erroAcumulado + erro * dt,
    oscilacao: t.oscilacao + Math.abs(voo.velocidadeVerticalMs - t.ultimoVS), ultimoVS: voo.velocidadeVerticalMs, concluido };
  if (concluido) {
    const falhou = resultado && resultado !== 'chegou';
    r.avaliacao = falhou ? `Exercise ended: ${textoUI(resultado)}.`
      : altitude || rumo ? `${Math.round(dentroS / segundos * 100)}% within tolerance · mean error ${(r.erroAcumulado / segundos * (altitude ? 3.28084 : 1)).toFixed(1)} ${altitude ? 'ft' : '°'} · mean vertical acceleration change ${(r.oscilacao / segundos).toFixed(2)} m/s².`
        : t.tipo === 'solo' ? 'Take-off complete · reached 150 m altitude.'
          : `Landing complete · touchdown at ${Math.abs(voo.contacto?.verticalMs ?? 0).toFixed(1)} m/s · lateral offset ${Math.abs(voo.contacto?.lateralM ?? 0).toFixed(1)} m.`;
  }
  return r;
}
