import { velocidadeSoloNavegacao } from './cockpit-navigation.js';
import { alturaChaoM } from './simulacao.js';
import { actuacaoEfectiva } from './piloto-sim.js';

const FT_M = 3.28084;
const KT_MS = 1.94384;
const graus = (r) => r * 180 / Math.PI;
const normalizar = (r) => ((graus(r) % 360) + 360) % 360;
const NOMES_VERTICAIS = { subir: 'Climb', descer: 'Descend', manter: 'Level hold' };

/** Telemetria de leitura: nunca escreve no motor ou muda a lei das gravações. */
export function instrumentosDeVoo(m, v = m.voo) {
  const a = actuacaoEfectiva(m.piloto, m.voo.tempoS);
  const gravado = m.piloto.tipo === 'jev-gravado';
  const piloto = m.piloto.tipo === 'humano' ? 'Human' : gravado ? 'JEV recorded' : 'JEV live';
  const final = Boolean(m.finalAssistida || (m.controlos?.aproximacao && a.fonte !== 'supervisor'));
  const supervisor = !final && a.fonte === 'supervisor';
  const autoridade = final ? 'Assisted final' : supervisor ? 'Protection'
    : a.fonte === 'estabilizador' ? 'Stabiliser' : a.fonte === 'humano' ? 'Human' : piloto;
  const potencia = v.motores ? v.motores.potenciaTotal : v.acelerador ?? v.potencia ?? 0.55;
  // Lei de consumo do perfil ilustrativo actual (kg/s); não é reserva operacional.
  const consumoKgH = (v.motores?.consumoTotalKgS ?? (0.026 + 0.115 * potencia)) * 3600;
  const motorFalhado = v.motores && [v.motores.esquerdo,v.motores.direito].some(e=>e.estado!=='operacional');
  const soloMs = velocidadeSoloNavegacao({ ...m, voo: v }).soloMs;
  const vertical = a.pitchInput ? (a.pitchInput > 0 ? 'subir' : 'descer') : a.vertical;
  const captura = final || (vertical === 'manter' && m.controlos?.modo !== 'avancado') || (!supervisor && m.controlos?.altitudeM != null);
  return {
    velocidadeKt: v.velocidadeMs * KT_MS,
    soloKt: soloMs * KT_MS,
    altitudeFt: v.altitudeM * FT_M,
    aglFt: (v.altitudeM - alturaChaoM(m, v.xM, v.zM)) * FT_M,
    verticalFtMin: v.velocidadeVerticalMs * FT_M * 60,
    rumoGraus: normalizar(v.rumoRad),
    pitchGraus: graus(v.pitchRad),
    trajectoriaGraus: anguloTrajectoria(v),
    bankGraus: graus(v.bankRad),
    potenciaPct: potencia * 100,
    combustivelKg: v.combustivelKg,
    massaKg: v.massaKg,
    consumoKgH,
    autonomiaMin: consumoKgH > 0 ? Math.max(0, v.combustivelKg) / consumoKgH * 60 : null,
    altitudeAlvoFt: captura && Number.isFinite(m.voo.altitudeAlvoM) ? m.voo.altitudeAlvoM * FT_M : null,
    piloto,
    autoridade,
    intencao: final ? 'Guided approach' : supervisor ? NOMES_VERTICAIS[vertical] : m.controlos?.altitudeM != null ? 'Altitude capture' : m.controlos?.verticalMs != null ? 'Vertical speed' : m.controlos?.modo==='avancado' && Number.isFinite(v.pitchManualRad) ? `Nose ${Math.round(v.pitchManualRad*180/Math.PI)}°` : NOMES_VERTICAIS[vertical] ?? 'Level hold',
    movimento: v.velocidadeVerticalMs > 0.15 ? 'Climbing' : v.velocidadeVerticalMs < -0.15 ? 'Descending' : 'Level',
    aviso: supervisor ? a.motivo === 'terreno' ? 'TERRAIN · protective climb' : 'SEPARATION · protective manoeuvre' : v.stall ? 'STALL · lower the nose and add power' : motorFalhado ? 'ENGINE · check power and rudder' : v.avisoFlaps ? 'FLAPS · reduce speed below 165 kt' : '',
  };
}

/** SVG: a paisagem roda contra o pranchamento; nariz acima faz o horizonte descer. */
export function transformacaoHorizonte(pitchGraus, bankGraus) {
  return `rotate(${-bankGraus}) translate(0 ${pitchGraus * 2.5})`;
}

/** Ângulo da trajectória medido pela velocidade, distinto da atitude do nariz. */
export function anguloTrajectoria(v) {
  return graus(Math.asin(Math.max(-1, Math.min(1, (v.velocidadeVerticalMs ?? 0) / Math.max(1, v.velocidadeMs ?? 0)))));
}
