import { deveEscalarPIC, etiquetarAcao, maxProbabilidade } from './decisao.js';

export function teseCumprida(tese, answers, escalou) {
  if (!tese) return false;
  const acao = answers?.acaoMissao?.choice;
  const destino = answers?.destinoPreferido?.choice;

  let acaoOk = true;
  if (tese.acao || tese.acoesAceites) {
    const aceites = new Set([tese.acao, ...(tese.acoesAceites ?? [])].filter(Boolean));
    acaoOk = aceites.has(acao);
  }

  let destinoOk = true;
  if (tese.destino || tese.destinosAceites) {
    const aceites = new Set([tese.destino, ...(tese.destinosAceites ?? [])].filter(Boolean));
    destinoOk = aceites.has(destino);
  }

  return acaoOk && destinoOk;
}

export function escalacaoCorrecta(tese, escalou) {
  if (!tese) return false;
  const deveria = tese.deveEscalar === true;
  return deveria === Boolean(escalou);
}

function mediana(valores) {
  const v = valores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

export function resumirMissao({
  cenario,
  semente,
  restricoes,
  briefing = null,
  incidentes = [],
  incompleta = false,
  motivoIncompleta = null,
}) {
  const tesesOk = incidentes.filter((i) => i.tese_ok).length;
  const tesesN = incidentes.filter((i) => i.tese).length;
  const escalacoesOk = incidentes.filter((i) => i.escalacao_ok).length;
  const latencias = incidentes.map((i) => i.jev?.latencia_ms).filter((n) => Number.isFinite(n));
  if (briefing?.jev?.latencia_ms) latencias.unshift(briefing.jev.latencia_ms);

  const usage = incidentes.reduce(
    (acc, i) => {
      const u = i.jev?.usage ?? {};
      acc.input += Number(u.inputTokens ?? u.promptTokens ?? 0);
      acc.output += Number(u.outputTokens ?? u.completionTokens ?? 0);
      return acc;
    },
    { input: 0, output: 0 },
  );
  if (briefing?.jev?.usage) {
    usage.input += Number(briefing.jev.usage.inputTokens ?? briefing.jev.usage.promptTokens ?? 0);
    usage.output += Number(briefing.jev.usage.outputTokens ?? briefing.jev.usage.completionTokens ?? 0);
  }

  const veredicto = incompleta
    ? `A missão ficou incompleta — ${motivoIncompleta || 'o Gateway falhou'}. A comparação JEV / regra não é válida.`
    : montarVeredicto(cenario, incidentes);

  return {
    versao: 2,
    produto: 'JEV comanda o LUS-222',
    fonte: incompleta ? 'bloqueio' : 'typesafe-ai/jev',
    cenario: cenario?.id ?? cenario,
    semente,
    restricoes,
    incompleta,
    motivo_incompleta: motivoIncompleta,
    briefing,
    incidentes,
    veredicto,
    metricas: {
      teses_acertadas: tesesN ? tesesOk / tesesN : 0,
      teses_acertadas_pct: tesesN ? Math.round((100 * tesesOk) / tesesN) : 0,
      teses_n: tesesN,
      escalacoes_correctas: tesesN ? escalacoesOk / tesesN : 0,
      escalacoes_correctas_pct: tesesN ? Math.round((100 * escalacoesOk) / tesesN) : 0,
      latencia_mediana_ms: mediana(latencias),
      usage,
    },
  };
}

function montarVeredicto(cenario, incidentes) {
  const prova = incidentes.find((i) => {
    const acaoJev = i.jev?.answers?.acaoMissao?.choice;
    const acaoRegra = i.baseline?.answers?.acaoMissao?.choice;
    return acaoJev && acaoRegra && acaoJev !== acaoRegra && i.tese_ok;
  });

  if (prova) {
    const nome = prova.resumo?.split('.')[0] ?? prova.id;
    return (
      `No incidente «${nome}», o JEV escolheu ${etiquetarAcao(prova.jev.answers.acaoMissao.choice).toLowerCase()}; ` +
      `a regra só viu geometria e mandou ${etiquetarAcao(prova.baseline.answers.acaoMissao.choice).toLowerCase()}. ` +
      `${cenario?.tese ?? ''}`.trim()
    );
  }

  const divergiu = incidentes.find((i) => {
    const a = i.jev?.answers?.acaoMissao?.choice;
    const b = i.baseline?.answers?.acaoMissao?.choice;
    return a && b && a !== b;
  });

  if (divergiu) {
    return (
      `O JEV e a regra divergiram em «${divergiu.id}», mas a tese deste cenário não se cumpriu na íntegra. ` +
      `${cenario?.tese ?? ''}`.trim()
    );
  }

  return (
    'JEV e regra coincidiram nas acções. Neste semente a geometria chegou — a comparação continua honesta, sem inventar uma vitória.'
  );
}

export function registarIncidente({ estado, incidente, jev, baseline, pic }) {
  const answers = jev?.answers ?? {};
  const escalouModelo = deveEscalarPIC(answers);
  const escalou = Boolean(pic?.forcado || pic?.oferecido || escalouModelo);
  const tese = incidente.tese ?? null;
  return {
    id: incidente.id,
    tipo: incidente.tipo,
    resumo: incidente.resumo,
    estado_resumo: resumirEstado(estado),
    tese,
    tese_ok: teseCumprida(tese, answers, escalou),
    escalacao_ok: escalacaoCorrecta(tese, escalou),
    escalou,
    max_prob: maxProbabilidade(answers.acaoMissao),
    pic: pic ?? null,
    jev,
    baseline,
  };
}

export function resumirEstado(estado) {
  const a = estado?.aeronave ?? {};
  const m = estado?.missao ?? {};
  const e = estado?.ambiente ?? {};
  const nObs = estado?.geometria?.obstaculos?.length ?? 0;
  const emRota = (estado?.geometria?.obstaculos ?? []).some((o) => o.em_rota);
  return {
    fuel_kg: a.fuel_kg,
    payload_kg: a.payload_kg,
    integridade: a.integridade,
    almas: m.almas,
    relogio_s: m.relogio_s,
    tecto_ft: e.tecto_ft,
    vis_km: e.vis_km,
    vento_kt: e.vento_kt,
    pista_m: e.comprimento_pista_m,
    superficie: e.superficie_pista,
    luz_dia: e.luz_dia,
    obstaculos: nObs,
    obstaculo_em_rota: emRota,
  };
}
