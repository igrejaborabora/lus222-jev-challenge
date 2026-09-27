import { alturaChaoM } from './simulacao.js';
import { actuacaoEfectiva } from './piloto-sim.js';

const FT_M = 3.28084;
const KT_MS = 1.94384;
const graus = (r) => r * 180 / Math.PI;
const normalizar = (r) => ((graus(r) % 360) + 360) % 360;
const NOMES_VERTICAIS = { subir: 'Subir', descer: 'Descer', manter: 'Manter altitude' };

/** Telemetria de leitura: nunca escreve no motor ou muda a lei das gravações. */
export function instrumentosDeVoo(m, v = m.voo) {
  const a = actuacaoEfectiva(m.piloto, m.voo.tempoS);
  const gravado = m.piloto.tipo === 'jev-gravado';
  const piloto = m.piloto.tipo === 'humano' ? 'Humano' : gravado ? 'JEV gravado' : 'JEV ao vivo';
  const final = Boolean(m.finalAssistida);
  const supervisor = !final && a.fonte === 'supervisor';
  const autoridade = final ? 'Final assistida' : supervisor ? 'Supervisor'
    : a.fonte === 'estabilizador' ? 'Estabilizador' : a.fonte === 'humano' ? 'Humano' : piloto;
  const potencia = v.acelerador ?? v.potencia ?? 0.55;
  // Lei de consumo do perfil ilustrativo actual (kg/s); não é reserva operacional.
  const consumoKgH = (0.026 + 0.115 * potencia) * 3600;
  const vento = m.ambiente.ventoMs;
  const soloMs = Math.hypot(Math.sin(v.rumoRad) * v.velocidadeMs + vento.x, Math.cos(v.rumoRad) * v.velocidadeMs + vento.z);
  const captura = final || a.vertical === 'manter';
  return {
    velocidadeKt: v.velocidadeMs * KT_MS,
    soloKt: soloMs * KT_MS,
    altitudeFt: v.altitudeM * FT_M,
    aglFt: (v.altitudeM - alturaChaoM(m, v.xM, v.zM)) * FT_M,
    verticalFtMin: v.velocidadeVerticalMs * FT_M * 60,
    rumoGraus: normalizar(v.rumoRad),
    pitchGraus: graus(v.pitchRad),
    bankGraus: graus(v.bankRad),
    potenciaPct: potencia * 100,
    combustivelKg: v.combustivelKg,
    massaKg: v.massaKg,
    consumoKgH,
    autonomiaMin: Math.max(0, v.combustivelKg) / consumoKgH * 60,
    altitudeAlvoFt: captura && Number.isFinite(m.voo.altitudeAlvoM) ? m.voo.altitudeAlvoM * FT_M : null,
    piloto,
    autoridade,
    intencao: final ? 'Aproximação assistida' : NOMES_VERTICAIS[a.vertical] ?? 'Manter altitude',
    movimento: v.velocidadeVerticalMs > 0.15 ? 'A subir' : v.velocidadeVerticalMs < -0.15 ? 'A descer' : 'Nivelado',
    aviso: supervisor ? a.motivo === 'terreno' ? 'TERRENO · subida de protecção' : 'SEPARAÇÃO · manobra de protecção' : '',
  };
}

/** SVG: a paisagem roda contra o pranchamento; nariz acima faz o horizonte descer. */
export function transformacaoHorizonte(pitchGraus, bankGraus) {
  return `rotate(${-bankGraus}) translate(0 ${pitchGraus * 2.5})`;
}
