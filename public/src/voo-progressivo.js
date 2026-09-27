import { ventoInstantaneo } from './meteorologia.js';
import { calcularMotores, novosComandosMotores, normalizarComandosMotores, AUTORIDADE_LEME_RAD_S } from './engine-model.js';

/** Perfil de treino ilustrativo; não contém dados certificados do LUS-222. */
export const PERFIL_PROGRESSIVO = 'treino-energia-2';
export const G = 9.80665;
export const ALTURA_TREM_M = 2.25;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const numero = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const angulo = (r) => Math.atan2(Math.sin(r), Math.cos(r));
export function novosControlos() {
  return { modo: 'assistido', protecao: true, acelerador: null, altitudeM: null, verticalMs: null, rumoRad: null, flaps: 0, trim: 0, leme: 0, travao: 0, luzesNav: true, luzesAterragem: false, aproximacao: false, motores: novosComandosMotores() };
}

/** Limites partilhados por UI e motor; entradas inválidas não entram no integrador. */
export function normalizarControlos(c = {}) {
  const alvo = (v, lo, hi) => Number.isFinite(v) ? clamp(v, lo, hi) : null;
  return { ...novosControlos(), ...c,
    modo: c.modo === 'avancado' ? 'avancado' : 'assistido',
    protecao: c.protecao !== false,
    motores: normalizarComandosMotores(c.motores),
    acelerador: alvo(c.acelerador, 0, 1), altitudeM: alvo(c.altitudeM, 10, 3500),
    verticalMs: alvo(c.verticalMs, -8, 8), rumoRad: Number.isFinite(c.rumoRad) ? angulo(c.rumoRad) : null,
    flaps: clamp(numero(c.flaps), 0, 1), trim: clamp(numero(c.trim), -1, 1),
    leme: clamp(numero(c.leme), -1, 1), travao: clamp(numero(c.travao), 0, 1),
  };
}

/** Pista geométrica no referencial da missão, eixo +Z (a mesma do cenário). */
export function situacaoPista(m, v = m.voo) {
  const p = (m.pistas ?? []).find((p) => Math.abs(v.xM - p.xM) <= 25 && Math.abs(v.zM - p.zM) <= p.pistaM / 2);
  return p ?? null;
}
export function corredorAproximacao(m, v = m.voo) {
  return (m.pistas ?? []).some((p) => {
    const distancia = p.zM - p.pistaM / 2 - v.zM;
    const lateral = Math.abs(v.xM - p.xM);
    return distancia >= -p.pistaM && distancia < 6500 && lateral < Math.max(22, distancia * 0.08)
      && Math.abs(angulo(v.rumoRad)) < 0.2 && Math.abs(v.bankRad) < 0.15
      && v.velocidadeMs > 38 && v.velocidadeMs < 90 && v.velocidadeVerticalMs > -5;
  });
}

function aerodinamica(v, bank, flaps, leme, perfil) {
  const massa = perfil.massaVaziaKg + v.payloadKg + v.combustivelKg;
  const rho = 1.225 * Math.exp(-v.altitudeM / 8500);
  const q = 0.5 * rho * v.velocidadeMs ** 2;
  const maxCL = perfil.clMax * (1 + flaps * 0.3);
  const cl = massa * G / Math.max(1, q * perfil.areaAsaM2 * Math.cos(bank));
  const drag = q * perfil.areaAsaM2 * (perfil.cd0 + 0.055 * flaps + 0.018 * leme ** 2 + perfil.kInduzido * Math.min(cl, maxCL) ** 2);
  return { massa, cl, drag, stall: cl > maxCL, stallMs: Math.sqrt(2 * massa * G / (rho * perfil.areaAsaM2 * maxCL * Math.max(0.5, Math.cos(bank)))) };
}

/** Ponto material com troca de energia: subir retira velocidade, descer acrescenta-a. */
export function passoProgressivo(m, a, dt, perfil, chao) {
  const v = m.voo;
  const c = normalizarControlos(m.controlos);
  const sup = a.fonte === 'supervisor';
  const manual = a.fonte === 'humano' || (a.fonte === 'estabilizador' && m.piloto?.tipo === 'humano');
  const bankInput = clamp(numero(a.bankInput, a.lateral === 'esquerda' ? -1 : a.lateral === 'direita' ? 1 : 0), -1, 1);
  const pitchInput = clamp(numero(a.pitchInput, a.vertical === 'subir' ? 1 : a.vertical === 'descer' ? -1 : 0), -1, 1);
  const leme = sup ? 0 : clamp(numero(a.rudder, c.modo === 'avancado' ? c.leme : 0), -1, 1);
  const vento = ventoInstantaneo(m.ambiente, v.tempoS, m.semente);
  if (!sup && c.aproximacao && m.pistas?.[0]) {
    c.rumoRad = clamp((m.pistas[0].xM - v.xM) * 0.002 - Math.asin(clamp(vento.x / Math.max(30, v.velocidadeMs), -0.4, 0.4)), -0.35, 0.35);
    c.acelerador = v.emSolo ? 0 : clamp(0.5 + (62 - v.velocidadeMs) * 0.035, 0.05, 0.9);
    c.flaps = 0.65;
    if (v.emSolo) c.travao = 1;
  }
  let bancoAlvo = bankInput * 0.44;
  if (!sup && !bankInput && c.rumoRad != null) bancoAlvo = clamp(angulo(c.rumoRad - v.rumoRad) * 1.2, -0.44, 0.44);
  const bank = v.emSolo ? 0 : v.bankRad + clamp(bancoAlvo - v.bankRad, -0.35 * dt, 0.35 * dt);
  const deltaPot = clamp(numero(a.potenciaDelta, a.potencia === 'mais' ? 1 : a.potencia === 'menos' ? -1 : 0), -1, 1);
  const acelerador = v.combustivelKg <= 0 ? 0 : clamp((!sup && c.acelerador != null && deltaPot === 0 ? c.acelerador : v.acelerador ?? 0.55) + deltaPot * 0.25 * dt, 0, 1);
  // Extensão bloqueada acima de 85 m/s; retracção sempre disponível. Transição a 0,2/s.
  const pedidoFlaps = v.velocidadeMs > 85 ? Math.min(v.flaps ?? 0, c.flaps) : c.flaps;
  const flaps = (v.flaps ?? 0) + clamp(pedidoFlaps - (v.flaps ?? 0), -0.2 * dt, 0.2 * dt);
  const aero = aerodinamica(v, bank, flaps, leme, perfil);
  const motores = calcularMotores(v, c, perfil, acelerador);
  const thrust = motores.empuxoTotalN;
  const alpha = clamp(aero.cl / 5.7 - flaps * 0.065, 0.015, 0.23);
  let pitchManualRad = Number.isFinite(v.pitchManualRad) ? v.pitchManualRad : null;
  const atitudeLivre = !sup && c.modo === 'avancado' && manual && !c.aproximacao && c.altitudeM == null && c.verticalMs == null;
  if (!atitudeLivre) pitchManualRad = null;
  let altitudeAlvoM = null;
  let verticalAlvo = pitchInput * 4;
  let modoVertical = a.vertical;
  const pista = m.pistas?.[0];
  const guiada = !sup && c.aproximacao && pista && !v.emSolo;
  if (guiada) {
    const d = pista.zM - pista.pistaM / 2 + 350 - v.zM;
    altitudeAlvoM = Math.max(ALTURA_TREM_M + 2, d * 0.052 + 4.25);
    verticalAlvo = clamp((altitudeAlvoM - v.altitudeM) * 0.6 - v.velocidadeMs * 0.052, -5, 4);
    if (v.altitudeM < 12) verticalAlvo = -0.7;
    modoVertical = 'aproximacao';
  } else if (atitudeLivre && (pitchInput || pitchManualRad != null || c.trim !== 0)) {
    // O comando move o nariz; largar conserva a atitude. No solo não acumula
    // inclinação invisível enquanto se espera pela velocidade de rotação.
    if (pitchInput && !v.emSolo) pitchManualRad = clamp((pitchManualRad ?? v.pitchRad) + pitchInput * 0.18 * dt, -80 * Math.PI / 180, 40 * Math.PI / 180);
    const pitchAlvo = clamp((pitchManualRad ?? alpha) + c.trim * 0.14, -80 * Math.PI / 180, 40 * Math.PI / 180);
    verticalAlvo = Math.sin(pitchAlvo - alpha) * v.velocidadeMs;
    modoVertical = 'atitude';
  } else if (!pitchInput) {
    if (!sup && c.altitudeM != null) {
      altitudeAlvoM = c.altitudeM;
      verticalAlvo = clamp((altitudeAlvoM - v.altitudeM) * 0.35, -Math.abs(c.verticalMs ?? 4), Math.abs(c.verticalMs ?? 4));
      modoVertical = 'altitude';
    } else if (!sup && c.verticalMs != null) {
      verticalAlvo = c.verticalMs;
      modoVertical = 'vertical';
    } else {
      altitudeAlvoM = ['manter','altitude'].includes(v.modoVertical) && Number.isFinite(v.altitudeAlvoM) ? v.altitudeAlvoM : v.altitudeM;
      verticalAlvo = clamp((altitudeAlvoM - v.altitudeM) * 0.4, -2, 2);
      if (v.modoVertical === 'nivelar') {
        verticalAlvo = 0;
        modoVertical = Math.abs(v.velocidadeVerticalMs) > 0.3 ? 'nivelar' : 'manter';
      }
    }
  }
  // A baixa velocidade a autoridade de subida desaparece antes da perda.
  verticalAlvo = Math.min(verticalAlvo, Math.max(-5, (v.velocidadeMs / aero.stallMs - 1) * 20));
  if (aero.stall) verticalAlvo = Math.min(-4, verticalAlvo);
  const respostaVertical = atitudeLivre ? 9 : 3;
  let vertical = v.velocidadeVerticalMs + clamp(verticalAlvo + vento.vertical - v.velocidadeVerticalMs, -respostaVertical * dt, respostaVertical * dt);
  vertical = clamp(vertical, -v.velocidadeMs * 0.999, v.velocidadeMs * 0.999);
  let speed = Math.max(0, v.velocidadeMs + ((thrust - aero.drag) / aero.massa - G * vertical / Math.max(25, v.velocidadeMs)) * dt);
  // Arrasto adicional acima do envelope ilustrativo; não injecta energia.
  if (speed > perfil.velocidadeMaxMs) speed -= (speed - perfil.velocidadeMaxMs) * Math.min(1, dt);
  let heading = v.rumoRad + (G * Math.tan(bank) / Math.max(25, speed) + leme * AUTORIDADE_LEME_RAD_S + motores.guinadaRadS) * dt;
  let emSolo = Boolean(v.emSolo);
  const travao = Math.max(c.travao, clamp(numero(a.travao), 0, 1));
  if (emSolo) {
    speed = Math.max(0, v.velocidadeMs + (thrust / aero.massa - 0.18 - 0.00025 * v.velocidadeMs ** 2 - travao * 4.5 * (1 - (m.ambiente.chuva ?? 0) * 0.35)) * dt);
    heading = v.rumoRad + (bankInput + leme) * Math.min(0.2, speed * 0.008) * dt;
    if (c.aproximacao && pista) heading = v.rumoRad + clamp(clamp((pista.xM - v.xM) * 0.025, -0.15, 0.15) - v.rumoRad, -0.3 * dt, 0.3 * dt);
    // Tyre contact damps asymmetric yaw as ground speed approaches zero.
    heading += motores.guinadaRadS * Math.min(1, speed / 25) * dt;
    vertical = 0;
    const pedeRotacao = pitchInput > 0.1 || (atitudeLivre && pitchManualRad != null && pitchManualRad + c.trim * 0.14 > alpha + 0.015);
    if (pedeRotacao && speed > aero.stallMs * 1.1) { emSolo = false; vertical = Math.min(1, dt * 3); altitudeAlvoM = null; }
  }
  const horizontal = Math.sqrt(Math.max(0, speed ** 2 - vertical ** 2));
  const dx = (Math.sin(heading) * horizontal + (emSolo ? 0 : vento.x)) * dt;
  const dz = (Math.cos(heading) * horizontal + (emSolo ? 0 : vento.z)) * dt;
  const xM = v.xM + dx, zM = v.zM + dz;
  const piso = chao(xM, zM) + ALTURA_TREM_M;
  let altitude = emSolo ? piso : v.altitudeM + vertical * dt;
  let contacto = v.contacto ?? null;
  const pitchContacto = Math.asin(clamp(vertical / Math.max(1, speed), -1, 1)) + alpha;
  if (!emSolo && altitude <= piso) {
    const p = situacaoPista(m, { xM, zM });
    const seguro = p && Math.abs(angulo(heading)) < 0.18 && Math.abs(bank) < 0.12 && vertical >= -3 && speed < 85 && speed > 30;
    contacto = { tipo: seguro ? 'pista' : p ? 'duro' : 'terreno', verticalMs: vertical, lateralM: p ? xM - p.xM : null, tempoS: v.tempoS + dt, pitchRad: pitchContacto, speedMs:speed, bankRad:bank, headingRad:heading, xM, zM, distanciaPercorridaM:v.distanciaPercorridaM+Math.hypot(dx,dz) };
    altitude = piso; vertical = 0; emSolo = true;
  }
  if (emSolo && !situacaoPista(m, { xM, zM })) contacto = { ...contacto, tipo: 'fora_pista' };
  const fuel = Math.max(0, v.combustivelKg - motores.consumoTotalKgS * dt);
  const leiturasMotores = fuel > 0 ? motores : calcularMotores({ ...v, combustivelKg: fuel }, c, perfil, acelerador);
  const gamma = Math.asin(clamp(vertical / Math.max(1, speed), -1, 1));
  const pitch = emSolo ? (contacto && contacto.tipo !== 'pista' ? contacto.pitchRad ?? v.pitchRad : 0) : gamma + alpha;
  return { ...v, xM, zM, altitudeM: altitude, velocidadeMs: speed, velocidadeVerticalMs: vertical,
    rumoRad: heading, bankRad: bank, pitchRad: pitch, pitchManualRad, gammaRad: gamma, alphaRad: alpha,
    massaKg: perfil.massaVaziaKg + v.payloadKg + fuel, combustivelKg: fuel,
    distanciaPercorridaM: v.distanciaPercorridaM + Math.hypot(dx,dz), tempoS: v.tempoS + dt,
    acelerador, potencia: leiturasMotores.potenciaTotal, motores: leiturasMotores, altitudeAlvoM, modoVertical, fonteActuacao: sup ? 'supervisor' : guiada ? 'aproximacao' : a.fonte,
    flaps, stall: !emSolo && aero.stall, stallMs: aero.stallMs, emSolo, contacto,
    avisoFlaps: c.flaps > flaps + 0.01 && v.velocidadeMs > 85,
    superficies: { aileron: clamp((bancoAlvo-bank)*3,-1,1), elevator: clamp((verticalAlvo-v.velocidadeVerticalMs)*0.12,-1,1), rudder: leme, flaps },
  };
}

export function iniciarBorrego(m) {
  if (m.voo.emSolo || m.resultado) return m;
  return { ...m, fase: 'borrego', controlos: { ...normalizarControlos(m.controlos), aproximacao: false, modo: 'assistido', trim: 0, leme: 0, altitudeM: Math.max(m.voo.altitudeM + 150, 200), verticalMs: 4, acelerador: 1, flaps: 0.35 }, piloto: { ...m.piloto, lateral: 'nivelar', vertical: 'manter', potencia: 'manter', ateS: 0 } };
}


/** Human authority is independent of the optional collision-avoidance assistance. */
export function protecaoActiva(m) {
  return m.perfil !== PERFIL_PROGRESSIVO || m.piloto?.tipo !== 'humano' || m.controlos?.protecao !== false;
}

/** Buttons adjust attitude in steps; Level is an explicit return to altitude hold. */
export function comandarAtitude(m, pedido) {
  const delta = pedido === 'subir' ? 5 : -5;
  const alvo = pedido === 'manter' ? null : pedido === 'picar' ? -65 * Math.PI / 180
    : clamp((m.voo.pitchManualRad ?? m.voo.pitchRad) + delta * Math.PI / 180, -80 * Math.PI / 180, 40 * Math.PI / 180);
  const c = normalizarControlos(m.controlos);
  return { ...m, controlos: { ...c, trim: pedido === 'manter' ? 0 : c.trim, modo:'avancado', altitudeM:null, verticalMs:null, aproximacao:false },
    voo: { ...m.voo, pitchManualRad:alvo, altitudeAlvoM:alvo == null ? m.voo.altitudeM : null, modoVertical:alvo == null ? 'nivelar' : 'atitude' },
    piloto: { ...m.piloto, vertical:'manter', pitchInput:undefined, ateS:0 } };
}

/** Commands never affect the historical replay profile or unrelated controls.
 * Readings update immediately, including while paused; motion updates next step.
 */
function aplicarComandosMotores(m, comandos) {
  const controlos = { ...normalizarControlos(m.controlos), motores: normalizarComandosMotores(comandos) };
  if (!m.voo.motores) return { ...m, controlos };
  const motores = calcularMotores(m.voo, controlos, { empuxoMaxN: m.voo.motores.empuxoMaxN });
  return { ...m, controlos, voo: { ...m.voo, motores, potencia: motores.potenciaTotal } };
}

export function comandarMotor(m, lado, comando = {}) {
  if (m?.perfil !== PERFIL_PROGRESSIVO || !['esquerdo', 'direito'].includes(lado)) return m;
  const comandos = normalizarComandosMotores(m.controlos?.motores);
  return aplicarComandosMotores(m, { ...comandos, [lado]: { ...comandos[lado], ...comando } });
}

/** Restore both engines and remove per-engine throttle overrides, retaining the
 * common throttle, rudder, aircraft position and all other flight controls.
 */
export function reporMotores(m) {
  if (m?.perfil !== PERFIL_PROGRESSIVO) return m;
  return aplicarComandosMotores(m, novosComandosMotores());
}
