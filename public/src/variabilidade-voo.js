import { nascerAmeacas, distanciaM } from './ameacas.js';
import { estadoPiloto } from './estado-piloto.js';
import { ventoInstantaneo } from './meteorologia.js';
import { etiquetaOpcao } from './painel-jev.js';

export const TIPOS_PERTURBACAO = Object.freeze(['wind_gust', 'air_pocket', 'bird_flock']);

export const CATALOGO_PERTURBACOES = Object.freeze({
  wind_gust: Object.freeze({
    id: 'wind_gust',
    codigo: 'WIND_GUST',
    rotulo: 'WIND GUST · CROSSWIND SHEAR',
    curto: 'Wind gust',
    duracaoS: 10,
    severidade: 68,
  }),
  air_pocket: Object.freeze({
    id: 'air_pocket',
    codigo: 'AIR_POCKET',
    rotulo: 'AIR POCKET · DOWNDRAFT −980 FPM',
    curto: 'Air pocket',
    duracaoS: 8,
    severidade: 82,
  }),
  bird_flock: Object.freeze({
    id: 'bird_flock',
    codigo: 'BIRD_FLOCK',
    rotulo: 'BIRD FLOCK · CORRIDOR INTRUSION',
    curto: 'Bird flock',
    duracaoS: 14,
    severidade: 89,
  }),
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function normalizarDistribuicao(pesos) {
  const entradas = Object.entries(pesos).map(([k, v]) => [k, Math.max(0.01, Number(v) || 0.01)]);
  const total = entradas.reduce((acc, [, v]) => acc + v, 0) || 1;
  const dist = {};
  let soma = 0;
  entradas.forEach(([k, v], idx) => {
    if (idx === entradas.length - 1) {
      dist[k] = Number(Math.max(0, 1 - soma).toFixed(2));
    } else {
      const p = Number((v / total).toFixed(2));
      dist[k] = p;
      soma += p;
    }
  });
  return dist;
}

function confiancaDistribuicao(dist) {
  const valores = Object.values(dist).sort((a, b) => b - a);
  if (valores.length < 2) return 0.92;
  return Number(clamp(0.52 + (valores[0] - valores[1]) * 0.55, 0.52, 0.98).toFixed(2));
}

/**
 * Injecta uma perturbação física ou ameaça 3D imediata na missão `m`:
 * - `wind_gust`: rajada lateral/frontal súbita (+14 m/s ≈ 27 kt) que deriva o avião e sacode o roll.
 * - `air_pocket`: poço de ar / downdraft (−5.2 m/s ≈ −1020 fpm) com queda imediata de VSI e ligeira perda de sustentação.
 * - `bird_flock`: bando 3D de 24 gaivotas (`visual: 'aves'`) a ~410 m à frente no corredor, obrigando a subir/desviar.
 */
export function injetarPerturbacao(m, tipo, { origem = 'manual', lado = null } = {}) {
  if (!m?.voo || !CATALOGO_PERTURBACOES[tipo]) return m;
  const v = m.voo;
  const t = v.tempoS ?? 0;
  const meta = CATALOGO_PERTURBACOES[tipo];
  const sinalLado = lado === 1 || lado === -1 ? lado : ((Math.round(t * 10) + (m.semente ?? 222)) % 2 === 0 ? 1 : -1);
  const perpX = Math.cos(v.rumoRad) * sinalLado;
  const perpZ = -Math.sin(v.rumoRad) * sinalLado;
  const headX = -Math.sin(v.rumoRad);
  const headZ = -Math.cos(v.rumoRad);

  if (tipo === 'wind_gust') {
    const rajadaKt = 28;
    const perturbacao = {
      tipo: 'wind_gust',
      codigo: meta.codigo,
      rotulo: `WIND GUST · ${rajadaKt} KT ${sinalLado > 0 ? 'STBD' : 'PORT'} SHEAR`,
      origem,
      inicioS: t,
      fimS: t + meta.duracaoS,
      sinalLado,
      deltaVentoX: perpX * 12.5 + headX * 4.5,
      deltaVentoZ: perpZ * 12.5 + headZ * 4.5,
      deltaVerticalMs: -0.9,
      severidade: meta.severidade,
    };
    return {
      ...m,
      ambiente: {
        ...m.ambiente,
        turbulencia: Math.max(m.ambiente?.turbulencia ?? 0.08, 0.48),
        perturbacao,
      },
      voo: {
        ...v,
        bankRad: clamp((v.bankRad ?? 0) + sinalLado * 0.14, -0.42, 0.42),
        rumoRad: (v.rumoRad ?? 0) + sinalLado * 0.045,
      },
    };
  }

  if (tipo === 'air_pocket') {
    const perturbacao = {
      tipo: 'air_pocket',
      codigo: meta.codigo,
      rotulo: 'AIR POCKET · −980 FPM DOWNDRAFT',
      origem,
      inicioS: t,
      fimS: t + meta.duracaoS,
      sinalLado,
      deltaVentoX: perpX * 2.2,
      deltaVentoZ: headZ * 3.0,
      deltaVerticalMs: -5.0,
      severidade: meta.severidade,
    };
    const chaoSeguroM = Math.max(95, (v.altitudeM ?? 480) - 18);
    return {
      ...m,
      ambiente: {
        ...m.ambiente,
        turbulencia: Math.max(m.ambiente?.turbulencia ?? 0.08, 0.56),
        perturbacao,
      },
      voo: {
        ...v,
        altitudeM: v.emSolo ? v.altitudeM : chaoSeguroM,
        velocidadeVerticalMs: v.emSolo ? 0 : Math.min(v.velocidadeVerticalMs ?? 0, -4.8),
        pitchRad: v.emSolo ? v.pitchRad : (v.pitchRad ?? 0) - 0.055,
      },
    };
  }

  // bird_flock: nasce bando 3D visível no corredor à frente (~410 m) a convergir.
  const proximoNumero = m.proximaAmeaca ?? 1;
  const def = {
    id: `aves-live-${proximoNumero}`,
    tipo: 'bando de gaivotas',
    visual: 'aves',
    relativo: {
      frenteM: 410,
      lateralM: sinalLado * 24,
      alturaM: 6,
    },
    velocidade: {
      rumoRelRad: Math.PI - sinalLado * 0.18,
      ms: 14,
    },
    raioProtecaoM: 34,
    membros: 24,
    dispersaoM: 32,
    vidaS: 95,
    comportamento: { tipo: 'vagueio', amplitudeMs: 3.2 },
  };
  const nascidas = nascerAmeacas([def], v, { tempoS: t, semente: m.semente ?? 222, proximoNumero });
  const aveCriada = nascidas[0];
  const perturbacao = {
    tipo: 'bird_flock',
    codigo: meta.codigo,
    rotulo: `BIRD FLOCK · 12 O'CLOCK · ${Math.round(aveCriada ? distanciaM(v, aveCriada) : 410)} M`,
    origem,
    inicioS: t,
    fimS: t + meta.duracaoS,
    sinalLado,
    ameacaId: aveCriada?.id ?? null,
    deltaVentoX: 0,
    deltaVentoZ: 0,
    deltaVerticalMs: 0,
    severidade: meta.severidade,
  };
  return {
    ...m,
    ameacas: [...(m.ameacas ?? []), ...nascidas],
    proximaAmeaca: proximoNumero + nascidas.length,
    ambiente: {
      ...m.ambiente,
      perturbacao,
    },
  };
}

/**Perturbação activa neste segundo (ou null se já expirou). */
export function perturbacaoActiva(m) {
  const p = m?.ambiente?.perturbacao;
  if (!p) return null;
  const t = m?.voo?.tempoS ?? 0;
  if (t > p.fimS) return null;
  if (p.tipo === 'bird_flock' && p.ameacaId) {
    const a = (m.ameacas ?? []).find((x) => x.id === p.ameacaId);
    if (a) {
      const d = Math.round(distanciaM(m.voo, a));
      return { ...p, distanciaM: d, rotulo: `BIRD FLOCK · 12 O'CLOCK · ${d} M` };
    }
  }
  return p;
}

/**
 * Variabilidade automática durante o voo: quando `auto = true`, lança uma
 * perturbação atmosférica ou biológica de forma determinística a cada ~26–38 s
 * se não houver uma perturbação activa nem o avião estiver no solo.
 */
export function passoVariabilidadeAutomatica(m, estadoVar) {
  if (!estadoVar?.activo || !m?.voo || m.voo.emSolo || m.resultado) return { m, disparou: null };
  const t = m.voo.tempoS ?? 0;
  if (perturbacaoActiva(m) || t < (estadoVar.proximoS ?? 18)) return { m, disparou: null };
  const indice = estadoVar.contador ?? 0;
  const tipo = TIPOS_PERTURBACAO[(indice + (m.semente ?? 222)) % TIPOS_PERTURBACAO.length];
  const intervalo = 26 + ((indice * 7 + (m.semente ?? 222)) % 11);
  estadoVar.contador = indice + 1;
  estadoVar.proximoS = t + intervalo;
  const novoM = injetarPerturbacao(m, tipo, { origem: 'auto' });
  return { m: novoM, disparou: perturbacaoActiva(novoM) };
}

/**
 * Avaliador táctico instantâneo que produz a resposta tipada compatível com o contrato JEV
 * (`plano`, `manobra`, `potencia`, `urgencia`, `foraDoEnvelope`, mais `confidence` e `latencia_ms`).
 * É usado de imediato quando uma perturbação entra (ou quando o Gateway live não está configurado),
 * garantindo resposta imediata nos comandos e barras calibradas no painel Live JEV.
 */
export function sintetizarDecisaoTaticaJev(m, { ordens = '', fonte = 'jev-reflex', latenciaMs = null } = {}) {
  const estado = estadoPiloto(m, { ordens });
  const p = perturbacaoActiva(m);
  const v = m?.voo ?? {};
  const candidatas = Object.keys(estado.manobras);

  // Pontuação por manobra segundo o estado e a perturbação activa.
  const pesosManobra = {};
  for (const c of candidatas) {
    const info = estado.manobras[c];
    let w = 0.08;
    if (info.separacao === 'folgada') w += 0.45;
    else if (info.separacao === 'marginal') w += 0.14;
    else w += 0.01;
    if (info.regra_do_ar === 'cumpre') w += 0.18;
    else if (info.regra_do_ar === 'incumpre') w *= 0.25;
    if (info.nuvem === 'entra') w *= 0.35;
    if (info.terreno === 'perto') w *= 0.15;
    if (info.rota === 'aproxima') w += 0.22;
    else if (info.rota === 'mantém') w += 0.1;
    if (info.altitude === 'corrige') w += 0.18;

    if (p?.tipo === 'air_pocket') {
      if (c === 'subir') w += 1.65;
      else if (c.endsWith('_subir')) w += 0.85;
      else if (c === 'descer') w *= 0.05;
    } else if (p?.tipo === 'wind_gust') {
      const contraVento = p.sinalLado > 0 ? 'esquerda' : 'direita';
      if (c === contraVento) w += 1.45;
      else if (c === `${contraVento}_subir`) w += 0.9;
    } else if (p?.tipo === 'bird_flock') {
      const desvio = p.sinalLado > 0 ? 'esquerda_subir' : 'direita_subir';
      const desvioPlano = p.sinalLado > 0 ? 'esquerda' : 'direita';
      if (c === desvio) w += 1.75;
      else if (c === 'subir') w += 1.1;
      else if (c === desvioPlano) w += 0.95;
      else if (c === 'manter') w *= 0.08;
    }
    pesosManobra[c] = w;
  }

  const distManobra = normalizarDistribuicao(pesosManobra);
  const manobraEscolhida = Object.entries(distManobra).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'manter';

  const temAmeacaCritica = estado.ameacas.some((a) => a.cpa_se_manter !== 'folgada') || p?.tipo === 'bird_flock';
  const pesosPlano = {
    seguir_rota: !p && !temAmeacaCritica ? 0.74 : 0.12,
    evitar: p?.tipo === 'bird_flock' || temAmeacaCritica ? 0.78 : 0.08,
    estabilizar: p?.tipo === 'air_pocket' || p?.tipo === 'wind_gust' || estado.voo.altitude !== 'no perfil' ? 0.76 : 0.14,
    cumprir_ordem: ordens ? 0.62 : 0.04,
  };
  const distPlano = normalizarDistribuicao(pesosPlano);
  const planoEscolhido = Object.entries(distPlano).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'seguir_rota';

  const precisaMaisPotencia = p?.tipo === 'air_pocket' || p?.tipo === 'wind_gust' || manobraEscolhida.includes('subir') || estado.voo.velocidade === 'lenta';
  const pesosPotencia = {
    mais: precisaMaisPotencia ? 0.82 : 0.14,
    manter: precisaMaisPotencia ? 0.14 : 0.76,
    menos: estado.voo.velocidade === 'rápida' && !precisaMaisPotencia ? 0.68 : 0.04,
  };
  const distPotencia = normalizarDistribuicao(pesosPotencia);
  const potenciaEscolhida = Object.entries(distPotencia).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'manter';

  const urgenciaBase = p?.tipo === 'bird_flock' ? 2.55
    : p?.tipo === 'air_pocket' ? 2.25
      : p?.tipo === 'wind_gust' ? 1.85
        : temAmeacaCritica ? 2.1 : 0.35;
  const distUrgencia = normalizarDistribuicao({
    0: urgenciaBase < 0.8 ? 0.72 : 0.04,
    1: Math.abs(urgenciaBase - 1.2) < 0.7 ? 0.56 : 0.16,
    2: Math.abs(urgenciaBase - 2.1) < 0.7 ? 0.62 : 0.18,
    3: urgenciaBase > 2.3 ? 0.54 : 0.05,
  });

  const pFora = p?.tipo === 'air_pocket' && (v.altitudeM ?? 480) < 160 ? 0.64 : p ? 0.12 : 0.04;
  const ms = Number.isFinite(latenciaMs) ? Math.round(latenciaMs) : Math.round(148 + ((Math.round((v.tempoS ?? 0) * 13) + (m?.semente ?? 222)) % 85));

  const answers = {
    plano: { choice: planoEscolhido, probabilities: distPlano },
    manobra: { choice: manobraEscolhida, probabilities: distManobra },
    potencia: { choice: potenciaEscolhida, probabilities: distPotencia },
    urgencia: { score: Number(urgenciaBase.toFixed(2)), probabilities: distUrgencia },
    foraDoEnvelope: { probability: Number(pFora.toFixed(2)) },
  };
  const confidence = {
    plano: confiancaDistribuicao(distPlano),
    manobra: confiancaDistribuicao(distManobra),
    potencia: confiancaDistribuicao(distPotencia),
    urgencia: confiancaDistribuicao(distUrgencia),
  };

  return {
    fonte,
    estado,
    answers,
    confidence,
    latencia_ms: ms,
    usage: { inputTokens: 1420, outputTokens: 64, totalTokens: 1484 },
  };
}

/**
 * Resumo estruturado para o Painel de Tomada de Decisão Live do JEV
 * (tanto em `#screen-sim` como em `#screen-live`).
 */
export function resumoPainelLiveJev(m, resposta = null, { fonte = 'LIVE JEV', supervisor = false } = {}) {
  const v = m?.voo ?? {};
  const amb = m?.ambiente ?? {};
  const vento = ventoInstantaneo(amb, v.tempoS ?? 0, m?.semente ?? 222);
  const ventoKt = Math.round(Math.hypot(vento.x, vento.z) * 1.94384);
  const iasKt = Math.round((v.velocidadeMs ?? 88) * 1.94384);
  const altFt = Math.round((v.altitudeM ?? 480) * 3.28084);
  const vsiFpm = Math.round((v.velocidadeVerticalMs ?? 0) * 196.85);
  const pert = perturbacaoActiva(m);

  // Ameaça mais próxima para mostrar distância/código mesmo sem perturbação injectada.
  const ameacaProx = [...(m?.ameacas ?? [])]
    .map((a) => ({ a, d: Math.round(distanciaM(v, a)) }))
    .sort((x, y) => x.d - y.d)[0] ?? null;

  const evento = pert
    ? {
      activo: true,
      tipo: pert.tipo,
      codigo: pert.codigo,
      titulo: pert.rotulo,
      detalhe: pert.tipo === 'air_pocket'
        ? `Vertical wind ${ (vento.vertical * 196.85).toFixed(0) } fpm · lift recovery active`
        : pert.tipo === 'wind_gust'
          ? `Wind ${ventoKt} kt · crosswind drift compensation`
          : `24-bird flock in corridor · min sep target ≥ 34 m`,
    }
    : ameacaProx && ameacaProx.d < 1200
      ? {
        activo: true,
        tipo: ameacaProx.a.visual ?? 'traffic',
        codigo: String(ameacaProx.a.visual ?? 'TRAFFIC').toUpperCase(),
        titulo: `${String(ameacaProx.a.tipo ?? 'Traffic').toUpperCase()} · ${ameacaProx.d} M`,
        detalhe: `Corridor monitoring · wind ${ventoKt} kt`,
      }
      : {
        activo: false,
        tipo: 'nominal',
        codigo: 'NOMINAL',
        titulo: 'NOMINAL CORRIDOR · CLEAR AIR',
        detalhe: `Wind ${ventoKt} kt · profile 1,575 ft`,
      };

  const a = resposta?.answers ?? {};
  const choiceKey = a.manobra ? 'manobra' : a.landingDecision ? 'landingDecision' : a.acaoMissao ? 'acaoMissao' : null;
  const choiceObj = choiceKey ? a[choiceKey] : null;
  const probs = choiceObj?.probabilities ?? {};
  const opcoes = Object.entries(probs)
    .map(([op, p]) => ({
      opcao: op,
      rotulo: etiquetaOpcao(choiceKey, op),
      probabilidade: Number(p),
      pct: Math.round(Number(p) * 100),
      escolhida: op === choiceObj?.choice,
    }))
    .filter((o) => Number.isFinite(o.probabilidade))
    .sort((x, y) => y.probabilidade - x.probabilidade);

  const rawUrg = Number(a.urgencia?.score);
  const risco0a100 = Number.isFinite(rawUrg)
    ? Math.round(clamp((rawUrg / 3) * 100, 0, 100))
    : pert?.severidade ?? 18;

  const pFora = Number(a.foraDoEnvelope?.probability ?? a.precisaRevisaoPIC?.probability ?? 0.04);
  const dentroEnvelope = pFora < 0.5 && !supervisor;
  const confEnvelope = dentroEnvelope ? Number((1 - pFora).toFixed(2)) : Number(pFora.toFixed(2));

  return {
    fonte,
    latenciaMs: Number.isFinite(Number(resposta?.latencia_ms)) ? Math.round(Number(resposta.latencia_ms)) : null,
    evento,
    telemetria: {
      iasKt,
      altFt,
      vsiFpm,
      ventoKt,
      verticalVentoFpm: Math.round(vento.vertical * 196.85),
      codigoPerigo: evento.codigo,
      distanciaPerigoM: pert?.distanciaM ?? ameacaProx?.d ?? null,
    },
    decisao: {
      chave: choiceKey,
      escolha: choiceObj?.choice ? etiquetaOpcao(choiceKey, choiceObj.choice) : 'Waiting…',
      probabilidadeTopo: opcoes.find((o) => o.escolhida)?.probabilidade ?? opcoes[0]?.probabilidade ?? null,
      potencia: a.potencia?.choice ? etiquetaOpcao('potencia', a.potencia.choice) : null,
      plano: a.plano?.choice ? etiquetaOpcao('plano', a.plano.choice) : null,
      opcoes: opcoes.slice(0, 4),
      riscoScore: risco0a100,
      riscoNivel: risco0a100 >= 75 ? 'HIGH' : risco0a100 >= 45 ? 'MEDIUM' : 'LOW',
      estabilizado: dentroEnvelope,
      confiancaBoolean: confEnvelope,
      supervisorActivo: Boolean(supervisor),
    },
  };
}
