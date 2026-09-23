import { mulberry32 } from './decisao.js';
import { aplicarEvasao } from './automato.js';

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

function coordenadasCurso(aviao) {
  const dx = Number(aviao?.x ?? ORIGEM.x) - ORIGEM.x;
  const dz = Number(aviao?.z ?? ORIGEM.z) - ORIGEM.z;
  return {
    aoLongo: Math.sin(ORIGEM.heading) * dx + Math.cos(ORIGEM.heading) * dz,
    lateral: Math.cos(ORIGEM.heading) * dx - Math.sin(ORIGEM.heading) * dz,
  };
}

function geometriaDoObstaculo(item, aviao, posicao) {
  const emFrente = item.ao_longo_m - posicao.aoLongo;
  const lateral = item.lateral_m - posicao.lateral;
  const distancia = Math.hypot(emFrente, lateral);
  const velocidade = Math.max(12, Number(aviao?.speed) || 38);
  const abreDireita = item.folga === 'direita';
  const abreEsquerda = item.folga === 'esquerda';
  const abreCima = item.folga === 'alta';
  return {
    id: item.id,
    tipo: item.tipo,
    visual: item.visual,
    em_rota: true,
    distancia_m: Math.max(0, Math.round(distancia)),
    segundos_ate_ao_contacto: arredondar(Math.max(0, emFrente) / velocidade, 1),
    folga_por_cima_m: abreCima ? 86 : 34,
    folga_por_baixo_m: -18,
    folga_pela_esquerda_m: abreEsquerda ? 64 : abreDireita ? -16 : 24,
    folga_pela_direita_m: abreDireita ? 64 : abreEsquerda ? -16 : 24,
    altura_m: item.visual === 'canyon' ? 120 : item.visual === 'guerra' ? 14 : 8,
    offset_lateral_m: arredondar(lateral),
    _offset_vertical_m: arredondar(item.altitude_m - (Number(aviao?.y) || 42)),
    _raio_protecao_m: item.raio_protecao_m,
  };
}

export function criarPercursoPiloto(semente = 222) {
  const seed = Number(semente) || 222;
  const rnd = mulberry32(seed);
  let aoLongo = 170;
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
    // Os dois últimos obstáculos são buffer: garantem 3–5 itens até à saída.
    distancia_total_m: obstaculos.at(-3).ao_longo_m + 40,
  };
}

export function obstaculosVisiveis(percurso, aviao) {
  const posicao = coordenadasCurso(aviao);
  return percurso.obstaculos
    .filter((item) => {
      const frente = item.ao_longo_m - posicao.aoLongo;
      return frente >= -40 && frente <= JANELA_OBSTACULOS_M;
    })
    .slice(0, 5)
    .map((item) => geometriaDoObstaculo(item, aviao, posicao));
}

export function folgasCandidatas(obstaculos) {
  const lista = Array.isArray(obstaculos) ? obstaculos : [];
  const candidatos = [
    ['esquerda-alta', 'subir', 'esquerda', -42, 34],
    ['centro-alta', 'subir', 'manter', 0, 42],
    ['direita-alta', 'subir', 'direita', 42, 34],
    ['esquerda-nivel', 'manter', 'esquerda', -52, 0],
    ['direita-nivel', 'manter', 'direita', 52, 0],
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
      altitude_m: arredondar(Number(aviao?.y) || 42),
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
  const altitude = Number(aviao?.y) || 42;
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
  const altitude = Number(aviao?.y) || 42;
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

export function novoControloPiloto({ duracaoManobraMs = 900 } = {}) {
  return {
    duracaoManobraMs,
    chave: null,
    iniciadaEm: null,
    actualizadoEm: null,
    neutralizada: true,
  };
}

export function aplicarOrdemPiloto(controlo, aviao, evasao, agoraMs, assinatura = '') {
  const chave = `${assinatura}|${evasao?.acao}|${evasao?.vertical}|${evasao?.lateral}`;
  if (chave === controlo.chave) return false;
  controlo.chave = chave;
  controlo.iniciadaEm = agoraMs;
  controlo.neutralizada = false;
  aplicarEvasao(aviao, evasao);
  return true;
}

export function suspenderControloPiloto(controlo, inicioMs, fimMs) {
  const duracao = Math.max(0, Number(fimMs) - Number(inicioMs));
  if (controlo.iniciadaEm != null) controlo.iniciadaEm += duracao;
  controlo.actualizadoEm = Number(fimMs);
}

export function actualizarOrdemPiloto(controlo, aviao, agoraMs) {
  const dt = controlo.actualizadoEm == null
    ? 0
    : Math.max(0, Math.min(0.12, (agoraMs - controlo.actualizadoEm) / 1000));
  controlo.actualizadoEm = agoraMs;
  let mudou = false;
  if (!controlo.neutralizada && controlo.iniciadaEm != null && agoraMs - controlo.iniciadaEm >= controlo.duracaoManobraMs) {
    aviao.acao = 'prosseguir';
    aviao.vertical = 'manter';
    aviao.lateral = 'manter';
    aviao.dodgeT = 0;
    controlo.neutralizada = true;
    mudou = true;
  }
  if (controlo.neutralizada && dt > 0) {
    const posicao = coordenadasCurso(aviao);
    const correccaoLateral = Math.max(-0.48, Math.min(0.48, posicao.lateral / 120));
    const alvo = ORIGEM.heading - correccaoLateral;
    const delta = Math.atan2(Math.sin(alvo - aviao.heading), Math.cos(alvo - aviao.heading));
    const maximo = 1.45 * dt;
    aviao.heading += Math.max(-maximo, Math.min(maximo, delta));
  }
  return mudou;
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
