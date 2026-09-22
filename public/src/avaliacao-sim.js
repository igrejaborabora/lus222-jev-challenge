const RUBRICA = {
  porto: {
    baloes: { acoes: ['prosseguir', 'orbitar', 'desviar_alternativo'], lateral: ['direita'], pic: false },
    trafego_porto: { acoes: ['prosseguir', 'orbitar', 'desviar_alternativo'], lateral: ['esquerda'], pic: false },
    anoitecer: { acoes: ['prosseguir', 'orbitar', 'desviar_alternativo'], pic: false },
    vento_porto: { acoes: ['prosseguir', 'orbitar', 'desviar_alternativo'], pic: false },
    final_porto: { acoes: ['prosseguir', 'desviar_alternativo'], pic: true },
  },
  medevac: {
    frente: { acoes: ['desviar_alternativo', 'orbitar'], pic: false },
    relevo: { acoes: ['desviar_alternativo', 'orbitar'], lateral: ['direita'], pic: false },
    relogio: { acoes: ['desviar_alternativo', 'orbitar'], pic: true },
  },
  carga: {
    massa: { acoes: ['regressar_base', 'desviar_alternativo'], pic: false },
    aves: { acoes: ['desviar_alternativo', 'orbitar'], lateral: ['direita'], pic: false },
    vento: { acoes: ['regressar_base', 'desviar_alternativo', 'orbitar'], pic: false },
  },
  sar: {
    luz: { acoes: ['orbitar', 'regressar_base'], pic: true },
    contacto: { acoes: ['orbitar', 'prosseguir'], pic: true },
    trafego: { acoes: ['desviar_alternativo', 'orbitar'], lateral: ['esquerda'], pic: false },
    reserva: { acoes: ['regressar_base', 'desviar_alternativo'], pic: true },
  },
};

export function avaliarLinha(linha) {
  const a = linha?.jev?.answers ?? {};
  const rubrica = RUBRICA[linha?.cenario]?.[linha?.id] ?? null;
  const acao = a.acaoMissao?.choice;
  // A pergunta destinoPreferido é condicional: em «prosseguir» vale o destino
  // atual, e em «regressar» vale a origem. Só o desvio aplica a preferência.
  const destino = acao === 'prosseguir' ? linha?.entrada?.missao?.destino
    : acao === 'regressar_base' ? 'origem'
      : acao === 'desviar_alternativo' ? a.destinoPreferido?.choice : null;
  const alt = linha?.entrada?.alternativas?.find((d) => d.id === destino);
  const pistaCurta = Boolean(alt && alt.pista_m < alt.pista_necessaria_m);
  const fuelCurto = Boolean(alt && alt.combustivel_necessario_kg > (linha?.entrada?.aeronave?.fuel_kg ?? Infinity));
  const picSugerido = Number(a.precisaRevisaoPIC?.probability ?? 0) >= 0.55;
  const picHumano = Boolean(linha?.pic?.interveio);
  const alertas = [];
  if (pistaCurta) alertas.push(`Pista insuficiente: ${alt.pista_m} m para ${alt.pista_necessaria_m} m calculados.`);
  if (fuelCurto) alertas.push('Destino sem reserva de combustível calculada.');
  if (linha?.supervisor?.interveio) alertas.push(`Supervisor: ${linha.supervisor.motivo}.`);
  return {
    acao: !rubrica?.acoes ? 'não avaliado' : rubrica.acoes.includes(acao) ? 'conforme' : 'divergente',
    destino: !alt ? 'não avaliado' : pistaCurta || fuelCurto ? 'incompatível' : 'viável',
    manobra: !rubrica?.lateral ? 'não avaliada' : rubrica.lateral.includes(a.manobraLateral?.choice) ? 'conforme' : 'divergente',
    limites: linha?.supervisor?.interveio ? 'bloqueado' : 'conforme',
    picSugerido,
    picHumano,
    picConforme: rubrica ? picSugerido === rubrica.pic : null,
    alertas,
  };
}

export function resumirLinhas(linhas = []) {
  const avaliadas = linhas.map(avaliarLinha);
  return {
    total: avaliadas.length,
    acoesConformes: avaliadas.filter((a) => a.acao === 'conforme').length,
    destinosIncompativeis: avaliadas.filter((a) => a.destino === 'incompatível').length,
    manobrasConformes: avaliadas.filter((a) => a.manobra === 'conforme').length,
    limitesBloqueados: avaliadas.filter((a) => a.limites === 'bloqueado').length,
    picExcessivo: avaliadas.filter((a) => a.picSugerido && a.picConforme === false).length,
    picConforme: avaliadas.filter((a) => a.picConforme === true).length,
    alertas: avaliadas.flatMap((a) => a.alertas),
  };
}
