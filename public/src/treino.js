/** Exercícios curtos com métricas calculadas no passo fixo, sem avaliações pelo modelo. */
export const EXERCICIOS = {
  livre: 'Voo livre', solo: 'Descolagem', aproximacao: 'Aproximação e aterragem',
  altitude: 'Manter 1800 ft', rumo: 'Manter rumo 090°',
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
    r.avaliacao = falhou ? `Exercício interrompido: ${resultado.replaceAll('_', ' ')}.`
      : altitude || rumo ? `${Math.round(dentroS / segundos * 100)}% dentro da tolerância · erro médio ${(r.erroAcumulado / segundos * (altitude ? 3.28084 : 1)).toFixed(1)} ${altitude ? 'ft' : '°'} · variação vertical média ${(r.oscilacao / segundos).toFixed(2)} m/s².`
        : t.tipo === 'solo' ? 'Descolagem concluída · 150 m de altitude atingidos.'
          : `Aterragem concluída · toque a ${Math.abs(voo.contacto?.verticalMs ?? 0).toFixed(1)} m/s · desvio lateral ${Math.abs(voo.contacto?.lateralM ?? 0).toFixed(1)} m.`;
  }
  return r;
}
