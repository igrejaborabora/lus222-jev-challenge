import { mulberry32 } from './decisao.js';

export const INTERVALO_DECISAO_MS = 400;
export const MAX_PEDIDOS_EM_VOO = 2;
export const JANELA_OBSTACULOS_M = 760;

const ORIGEM = Object.freeze({ x: -80, z: 40, heading: 0.7 });
const VISUAIS = ['canyon', 'aves', 'guerra', 'canyon', 'aves', 'guerra', 'canyon', 'guerra'];
const RAIO_PROTECAO = Object.freeze({ canyon: 52, aves: 20, guerra: 28 });

function arredondar(valor, casas = 0) {
  const escala = 10 ** casas;
  return Math.round(valor * escala) / escala;
}

// Deslocamentos que o controlador consegue numa manobra: os mesmos para as
// folgas por obstáculo e para as folgas candidatas.
const DESLOCAMENTO_LATERAL_M = 52;
const DESLOCAMENTO_SUBIDA_M = 40;
const DESLOCAMENTO_DESCIDA_M = 24;
const ALTITUDE_MINIMA_M = 16;

/**
 * Coordenadas no referencial do corredor. Lateral positivo = direita do
 * piloto, como `offset_lateral_m` em decisao.js. No automato, heading a subir
 * vira à esquerda, por isso a direita é −d(posição)/d(heading).
 */
function coordenadasCurso(aviao) {
  const dx = Number(aviao?.x ?? ORIGEM.x) - ORIGEM.x;
  const dz = Number(aviao?.z ?? ORIGEM.z) - ORIGEM.z;
  return {
    aoLongo: Math.sin(ORIGEM.heading) * dx + Math.cos(ORIGEM.heading) * dz,
    lateral: Math.sin(ORIGEM.heading) * dz - Math.cos(ORIGEM.heading) * dx,
  };
}

/** Inverso de coordenadasCurso: lateral positivo = direita do piloto. */
function pontoNoMundo(item) {
  const h = ORIGEM.heading;
  return {
    mundo_x: arredondar(ORIGEM.x + Math.sin(h) * item.ao_longo_m - Math.cos(h) * item.lateral_m, 1),
    mundo_z: arredondar(ORIGEM.z + Math.cos(h) * item.ao_longo_m + Math.sin(h) * item.lateral_m, 1),
    mundo_y: item.altitude_m,
    mundo_rumo: h,
  };
}

function altitudeDe(aviao) {
  const y = Number(aviao?.y);
  return Number.isFinite(y) ? y : 42;
}

/** Folga ao perímetro de protecção depois de deslocar o avião (dl, dv). */
function folgaComDeslocamento(relativo, dl, dv) {
  return Math.hypot(dl - relativo.lateral, dv - relativo.vertical) - relativo.raio;
}

function geometriaDoObstaculo(item, aviao, posicao) {
  const emFrente = item.ao_longo_m - posicao.aoLongo;
  const altitude = altitudeDe(aviao);
  const relativo = {
    lateral: item.lateral_m - posicao.lateral,
    vertical: item.altitude_m - altitude,
    raio: item.raio_protecao_m,
  };
  const distancia = Math.hypot(emFrente, relativo.lateral);
  const velocidade = Math.max(12, Number(aviao?.speed) || 38);
  const descida = Math.min(DESLOCAMENTO_DESCIDA_M, Math.max(0, altitude - ALTITUDE_MINIMA_M));
  // As folgas saem da geometria actual: mudam com a posição do avião e usam
  // os mesmos deslocamentos das folgas candidatas.
  return {
    id: item.id,
    tipo: item.tipo,
    visual: item.visual,
    em_rota: true,
    distancia_m: Math.max(0, Math.round(distancia)),
    segundos_ate_ao_contacto: arredondar(Math.max(0, emFrente) / velocidade, 1),
    folga_por_cima_m: Math.round(folgaComDeslocamento(relativo, 0, DESLOCAMENTO_SUBIDA_M)),
    folga_por_baixo_m: Math.round(folgaComDeslocamento(relativo, 0, -descida)),
    folga_pela_esquerda_m: Math.round(folgaComDeslocamento(relativo, -DESLOCAMENTO_LATERAL_M, 0)),
    folga_pela_direita_m: Math.round(folgaComDeslocamento(relativo, DESLOCAMENTO_LATERAL_M, 0)),
    altura_m: Math.round(item.altitude_m + item.raio_protecao_m),
    offset_lateral_m: arredondar(relativo.lateral),
    // Posição no corredor, independente do rumo do avião. A vista usa isto
    // para não voltar a colar a cidade, o bando ou a formação ao nariz.
    ...pontoNoMundo(item),
    _offset_vertical_m: arredondar(relativo.vertical),
    _raio_protecao_m: item.raio_protecao_m,
  };
}

export function criarPercursoPiloto(semente = 222) {
  const seed = Number(semente) || 222;
  const rnd = mulberry32(seed);
  // O primeiro obstáculo fica a ~11 s: com a curva coordenada suave, o
  // avião precisa desse tempo para ganhar deslocamento, mesmo com 1,5 s de
  // latência na primeira resposta.
  let aoLongo = 420;
  const obstaculos = VISUAIS.map((visual, indice) => {
    const intervalo = indice === 0 ? 0 : 150 + Math.round(rnd() * 45);
    aoLongo += intervalo;
    const folga = indice % 3 === 0 ? 'direita' : indice % 3 === 1 ? 'esquerda' : 'alta';
    const lateral = folga === 'direita' ? -24 : folga === 'esquerda' ? 24 : 0;
    return {
      id: `passo-${String(indice + 1).padStart(2, '0')}`,
      tipo: visual === 'canyon' ? 'torres do corredor' : visual === 'aves' ? 'bando de aves' : 'tráfego de época',
      visual,
      ao_longo_m: aoLongo,
      lateral_m: lateral,
      altitude_m: visual === 'canyon' ? 58 : 46 + (indice % 2) * 8,
      raio_protecao_m: RAIO_PROTECAO[visual],
      folga,
    };
  });
  return {
    semente: seed,
    origem: ORIGEM,
    obstaculos,
    separacoes: new Map(),
    // Os dois últimos obstáculos são buffer: garantem 3–5 itens à frente até à
    // saída, que coincide com a passagem do último obstáculo pontuado.
    distancia_total_m: obstaculos.at(-3).ao_longo_m,
  };
}

export function obstaculosVisiveis(percurso, aviao) {
  const posicao = coordenadasCurso(aviao);
  return percurso.obstaculos
    .filter((item) => {
      const frente = item.ao_longo_m - posicao.aoLongo;
      // Só o que ainda está à frente: um obstáculo já ultrapassado não pode
      // ser o primeiro da lista nem pesar nas folgas candidatas.
      return frente > 0 && frente <= JANELA_OBSTACULOS_M;
    })
    .slice(0, 5)
    .map((item) => geometriaDoObstaculo(item, aviao, posicao));
}

/** Cenário desenhado: mais largo que a janela do JEV, para a cidade não
 * desaparecer enquanto o avião ainda a atravessa. */
export function obstaculosCenario(percurso, aviao) {
  const posicao = coordenadasCurso(aviao);
  return percurso.obstaculos
    .filter((item) => {
      const frente = item.ao_longo_m - posicao.aoLongo;
      return frente >= -240 && frente <= 900;
    })
    .map((item) => geometriaDoObstaculo(item, aviao, posicao));
}

export function folgasCandidatas(obstaculos) {
  const lista = Array.isArray(obstaculos) ? obstaculos : [];
  const candidatos = [
    ['esquerda-alta', 'subir', 'esquerda', -42, 34],
    ['centro-alta', 'subir', 'manter', 0, DESLOCAMENTO_SUBIDA_M],
    ['direita-alta', 'subir', 'direita', 42, 34],
    ['esquerda-nivel', 'manter', 'esquerda', -DESLOCAMENTO_LATERAL_M, 0],
    ['direita-nivel', 'manter', 'direita', DESLOCAMENTO_LATERAL_M, 0],
  ];
  return candidatos
    .map(([id, vertical, lateral, deslocamentoLateral, deslocamentoVertical]) => ({
      id,
      vertical,
      lateral,
      folga_min_m: lista.length
        ? Math.round(Math.min(...lista.map((o) => {
          const lateralRelativo = Number(o.offset_lateral_m) || 0;
          const verticalRelativo = Number(o._offset_vertical_m) || 0;
          const raio = Number(o._raio_protecao_m) || 20;
          return Math.max(-500, Math.min(500, Math.hypot(
            deslocamentoLateral - lateralRelativo,
            deslocamentoVertical - verticalRelativo,
          ) - raio));
        })))
        : 80,
    }))
    .sort((a, b) => b.folga_min_m - a.folga_min_m);
}

export function assinaturaObstaculos(obstaculos) {
  return (Array.isArray(obstaculos) ? obstaculos : [])
    .map((o) => o.id)
    .join('|');
}

export function selecionarRespostaReplay(replays, visual) {
  const origem = {
    canyon: ['medevac', 'relevo'],
    aves: ['carga', 'aves'],
    guerra: ['sar', 'trafego'],
  }[visual] ?? ['medevac', 'relevo'];
  const resposta = replays?.[origem[0]]?.eventos?.[origem[1]];
  if (resposta?.fonte !== 'jev' || !resposta?.answers) throw new Error('replay_jev_invalido');
  return {
    ...structuredClone(resposta),
    replay_source: {
      cenario: origem[0],
      evento: origem[1],
      gravado_em: replays?.[origem[0]]?.gravadoEm ?? null,
    },
  };
}

export function estadoPassoPiloto(percurso, aviao, base = {}) {
  const obstaculos = obstaculosVisiveis(percurso, aviao);
  const posicao = coordenadasCurso(aviao);
  return {
    aeronave: {
      tipo: 'LUS-222',
      fuel_kg: 620,
      payload_kg: 540,
      config_cabine: 'mista',
      tripulantes: 2,
      integridade: 100,
      alcance_restante_km: 320,
      ...(base.aeronave ?? {}),
    },
    missao: {
      tipo: 'porto',
      origem: 'Porto',
      destino: 'corredor de demonstração',
      almas: 2,
      carga: 'instrumentação',
      relogio_s: 900,
      prioridade_comandante: 'integridade',
      ...(base.missao ?? {}),
    },
    ambiente: {
      tecto_ft: 3200,
      vis_km: 12,
      vento_kt: 10,
      superficie_pista: 'pavimentada',
      comprimento_pista_m: 3180,
      luz_dia: false,
      ...(base.ambiente ?? {}),
    },
    voo: {
      posicao_x_m: arredondar(posicao.lateral),
      posicao_z_m: arredondar(posicao.aoLongo),
      altitude_m: arredondar(altitudeDe(aviao)),
      velocidade_ms: arredondar(Number(aviao?.speed) || 38, 1),
      subida_ms: arredondar(-(Number(aviao?.pitch) || 0) * 10, 1),
      rumo_rad: arredondar(Number(aviao?.heading) || ORIGEM.heading, 3),
      tempo_s: arredondar(posicao.aoLongo / Math.max(1, Number(aviao?.speed) || 38)),
      fase: 'piloto_continuo',
    },
    geometria: {
      obstaculos,
      folgas_candidatas: folgasCandidatas(obstaculos),
    },
    restricoes: {
      nunca_desviar: false,
      preferir_stol: false,
      risco_maximo: 'medio',
      pic_disponivel: true,
      ...(base.restricoes ?? {}),
    },
    incidente: {
      id: obstaculos[0]?.id ?? 'corredor-livre',
      tipo: 'piloto_continuo',
      resumo: obstaculos.length
        ? `${obstaculos.length} obstáculos na janela de 760 m. Escolher folga e manter separação.`
        : 'Corredor livre até à saída da prova.',
    },
  };
}

export function actualizarSeparacoes(percurso, aviao) {
  const posicao = coordenadasCurso(aviao);
  const altitude = altitudeDe(aviao);
  for (const item of percurso.obstaculos) {
    const aoLongo = item.ao_longo_m - posicao.aoLongo;
    if (aoLongo < -120 || aoLongo > JANELA_OBSTACULOS_M) continue;
    const distancia = Math.max(0, Math.hypot(
      aoLongo,
      item.lateral_m - posicao.lateral,
      item.altitude_m - altitude,
    ) - item.raio_protecao_m);
    const anterior = percurso.separacoes.get(item.id);
    if (!Number.isFinite(anterior) || distancia < anterior) percurso.separacoes.set(item.id, arredondar(distancia, 1));
  }
  return percurso.separacoes;
}

export function separacaoInstantanea(percurso, aviao) {
  const posicao = coordenadasCurso(aviao);
  const altitude = altitudeDe(aviao);
  const proximos = percurso.obstaculos
    .map((item) => Math.max(0, Math.hypot(
      item.ao_longo_m - posicao.aoLongo,
      item.lateral_m - posicao.lateral,
      item.altitude_m - altitude,
    ) - item.raio_protecao_m))
    .filter(Number.isFinite);
  return proximos.length ? arredondar(Math.min(...proximos), 1) : null;
}

export function percursoConcluido(percurso, aviao) {
  return coordenadasCurso(aviao).aoLongo >= percurso.distancia_total_m;
}

export function deveDespacharNoPercurso(percurso, aviao) {
  return !percursoConcluido(percurso, aviao) && obstaculosVisiveis(percurso, aviao).length >= 3;
}

// Alvos que uma ordem do JEV fixa no referencial do corredor.
export const ALTITUDE_CRUZEIRO_M = 46;
const LATERAL_ALVO_M = { esquerda: -DESLOCAMENTO_LATERAL_M, direita: DESLOCAMENTO_LATERAL_M, manter: 0 };
const ALTITUDE_ALVO_M = {
  subir: ALTITUDE_CRUZEIRO_M + DESLOCAMENTO_SUBIDA_M,
  descer: ALTITUDE_CRUZEIRO_M - DESLOCAMENTO_DESCIDA_M,
  manter: ALTITUDE_CRUZEIRO_M,
};
const RUMO_MAX_RAD = 0.5;

/**
 * O JEV confirma a ordem a cada ~400 ms. Uma ordem fixa um alvo de posição
 * (lateral e altitude no corredor), não um impulso de pranchamento: repetir a
 * mesma ordem mantém o alvo, uma ordem nova muda-o, e sem confirmações durante
 * `retencaoMs` o avião regressa ao eixo. O rumo nunca se afasta mais de
 * RUMO_MAX_RAD do corredor, por isso um desvio não vira uma curva permanente.
 */
export function novoControloPiloto({ retencaoMs = 1600, ganhoLateralM = 60, antecipacaoS = 3 } = {}) {
  return {
    retencaoMs,
    ganhoLateralM,
    antecipacaoS,
    chave: null,
    ultimaOrdemEm: null,
    lateralAlvoM: 0,
    altitudeAlvoM: ALTITUDE_CRUZEIRO_M,
    neutralizada: true,
  };
}

export function aplicarOrdemPiloto(controlo, aviao, evasao, agoraMs) {
  const lateral = evasao?.lateral in LATERAL_ALVO_M ? evasao.lateral : 'manter';
  const vertical = evasao?.vertical in ALTITUDE_ALVO_M ? evasao.vertical : 'manter';
  const chave = `${lateral}|${vertical}`;
  const nova = controlo.neutralizada || chave !== controlo.chave;
  controlo.chave = chave;
  controlo.ultimaOrdemEm = agoraMs;
  controlo.neutralizada = false;
  controlo.lateralAlvoM = LATERAL_ALVO_M[lateral];
  controlo.altitudeAlvoM = ALTITUDE_ALVO_M[vertical];
  // O autómato só segue rumo e altitude: a acção de missão fica no registo,
  // porque orbitar ou regressar não fazem sentido num slalom.
  aviao.acao = 'prosseguir';
  aviao.lateral = 'manter';
  aviao.vertical = 'manter';
  const u = Number(evasao?.urgencia);
  aviao.urgencia = Number.isFinite(u) ? Math.min(3, Math.max(0, Math.round(u))) : 1;
  return nova;
}

export function suspenderControloPiloto(controlo, inicioMs, fimMs) {
  const duracao = Math.max(0, Number(fimMs) - Number(inicioMs));
  if (controlo.ultimaOrdemEm != null) controlo.ultimaOrdemEm += duracao;
}

export function actualizarOrdemPiloto(controlo, aviao, agoraMs) {
  let expirou = false;
  if (!controlo.neutralizada && agoraMs - controlo.ultimaOrdemEm > controlo.retencaoMs) {
    controlo.neutralizada = true;
    controlo.chave = null;
    controlo.lateralAlvoM = 0;
    controlo.altitudeAlvoM = ALTITUDE_CRUZEIRO_M;
    expirou = true;
  }
  const posicao = coordenadasCurso(aviao);
  // Lateral positivo = direita; virar à direita baixa o heading. A curva
  // coordenada atrasa o rumo, por isso o erro usa a lateral prevista daqui a
  // antecipacaoS — sem isto o avião passa do alvo e oscila à volta do eixo.
  const velocidadeLateral = -(Number(aviao.speed) || 0) * Math.sin((Number(aviao.heading) || ORIGEM.heading) - ORIGEM.heading);
  const prevista = posicao.lateral + velocidadeLateral * controlo.antecipacaoS;
  const erro = (prevista - controlo.lateralAlvoM) / controlo.ganhoLateralM;
  aviao.rumoAlvo = ORIGEM.heading + Math.max(-RUMO_MAX_RAD, Math.min(RUMO_MAX_RAD, erro));
  aviao.altitudeAlvo = controlo.altitudeAlvoM;
  return expirou;
}

export function novoPipelinePiloto({
  intervaloMs = INTERVALO_DECISAO_MS,
  maxEmVoo = MAX_PEDIDOS_EM_VOO,
} = {}) {
  return {
    intervaloMs,
    maxEmVoo,
    proximoEm: 0,
    proximaSequencia: 0,
    ultimoAplicado: -1,
    ultimaAssinatura: null,
    emVoo: new Map(),
    historico: [],
    iniciadoEm: null,
  };
}

export function deveDespacharPasso(pipeline, agoraMs, assinatura = '') {
  if (pipeline.emVoo.size >= pipeline.maxEmVoo) return false;
  void assinatura;
  return agoraMs >= pipeline.proximoEm;
}

export function reservarPasso(pipeline, entrada, agoraMs, assinatura = '') {
  if (pipeline.emVoo.size >= pipeline.maxEmVoo) throw new Error('pipeline_cheio');
  const sequencia = pipeline.proximaSequencia++;
  const ticket = {
    id: `passo-${sequencia}`,
    sequencia,
    entrada,
    iniciadoEm: agoraMs,
    assinatura,
  };
  pipeline.emVoo.set(ticket.id, ticket);
  pipeline.proximoEm = agoraMs + pipeline.intervaloMs;
  pipeline.ultimaAssinatura = assinatura;
  if (pipeline.iniciadoEm == null) pipeline.iniciadoEm = agoraMs;
  return ticket;
}

export function concluirPasso(pipeline, ticketId, resposta, agoraMs, extra = {}) {
  const ticket = pipeline.emVoo.get(ticketId);
  if (!ticket) return { aplicar: false, motivo: 'ticket_desconhecido' };
  pipeline.emVoo.delete(ticketId);
  const aplicar = ticket.sequencia > pipeline.ultimoAplicado;
  if (aplicar) pipeline.ultimoAplicado = ticket.sequencia;
  const registo = {
    sequencia: ticket.sequencia,
    entrada: ticket.entrada,
    resposta,
    latencia_ms: Number.isFinite(Number(resposta?.latencia_ms))
      ? Number(resposta.latencia_ms)
      : Math.max(0, agoraMs - ticket.iniciadoEm),
    aplicar,
    ...extra,
  };
  pipeline.historico.push(registo);
  return { aplicar, registo, ticket };
}

export function falharPasso(pipeline, ticketId, erro, agoraMs) {
  const ticket = pipeline.emVoo.get(ticketId);
  if (!ticket) return null;
  pipeline.emVoo.delete(ticketId);
  const registo = {
    sequencia: ticket.sequencia,
    entrada: ticket.entrada,
    erro: String(erro?.message ?? erro),
    latencia_ms: Math.max(0, agoraMs - ticket.iniciadoEm),
    aplicar: false,
  };
  pipeline.historico.push(registo);
  return registo;
}

function percentil(valores, percentagem) {
  const ordenados = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!ordenados.length) return null;
  const indice = Math.ceil((percentagem / 100) * ordenados.length) - 1;
  return ordenados[Math.max(0, Math.min(ordenados.length - 1, indice))];
}

function mediana(valores) {
  const ordenados = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!ordenados.length) return null;
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[meio]
    : Math.round((ordenados[meio - 1] + ordenados[meio]) / 2);
}

export function metricasPiloto(pipeline, agoraMs) {
  const validos = pipeline.historico.filter((item) => !item.erro);
  const latencias = validos.map((item) => Number(item.latencia_ms)).filter(Number.isFinite);
  const separacoes = validos
    .filter((item) => item.separacao_min_m != null)
    .map((item) => Number(item.separacao_min_m))
    .filter(Number.isFinite);
  const duracaoMs = Math.max(1, agoraMs - (pipeline.iniciadoEm ?? agoraMs));
  return {
    decisoes: validos.length,
    decisoes_por_minuto: Math.round((validos.length * 60_000) / duracaoMs),
    latencia_mediana_ms: mediana(latencias),
    latencia_p95_ms: percentil(latencias, 95),
    separacao_min_m: separacoes.length ? Math.min(...separacoes) : null,
  };
}
