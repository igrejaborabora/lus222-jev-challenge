import { mulberry32 } from './decisao.js';

export const INTERVALO_DECISAO_MS = 400;
export const MAX_PEDIDOS_EM_VOO = 2;
export const JANELA_OBSTACULOS_M = 760;

const ORIGEM = Object.freeze({ x: -80, z: 40, heading: 0.7 });
const VISUAIS = ['canyon', 'aves', 'guerra', 'canyon', 'aves', 'guerra', 'canyon', 'guerra'];

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
      folga,
    };
  });
  return {
    semente: seed,
    origem: ORIGEM,
    obstaculos,
    separacoes: new Map(),
    distancia_total_m: obstaculos.at(-1).ao_longo_m + 180,
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
    ['esquerda-alta', 'subir', 'esquerda', 'folga_pela_esquerda_m', 'folga_por_cima_m'],
    ['centro-alta', 'subir', 'manter', 'folga_por_cima_m', 'folga_por_cima_m'],
    ['direita-alta', 'subir', 'direita', 'folga_pela_direita_m', 'folga_por_cima_m'],
    ['esquerda-nivel', 'manter', 'esquerda', 'folga_pela_esquerda_m', 'folga_pela_esquerda_m'],
    ['direita-nivel', 'manter', 'direita', 'folga_pela_direita_m', 'folga_pela_direita_m'],
  ];
  return candidatos
    .map(([id, vertical, lateral, eixoA, eixoB]) => ({
      id,
      vertical,
      lateral,
      folga_min_m: lista.length
        ? Math.round(Math.min(...lista.map((o) => Math.max(-500, Math.min(Number(o[eixoA]) || 0, Number(o[eixoB]) || 0)))))
        : 80,
    }))
    .sort((a, b) => b.folga_min_m - a.folga_min_m);
}

export function assinaturaObstaculos(obstaculos) {
  return (Array.isArray(obstaculos) ? obstaculos : [])
    .map((o) => `${o.id}:${Math.round((Number(o.distancia_m) || 0) / 40)}`)
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
  return resposta;
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
    const distancia = Math.hypot(aoLongo, item.lateral_m - posicao.lateral, item.altitude_m - altitude);
    const anterior = percurso.separacoes.get(item.id);
    if (!Number.isFinite(anterior) || distancia < anterior) percurso.separacoes.set(item.id, arredondar(distancia, 1));
  }
  return percurso.separacoes;
}

export function percursoConcluido(percurso, aviao) {
  return coordenadasCurso(aviao).aoLongo >= percurso.distancia_total_m;
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
  const novoObstaculo = assinatura && assinatura !== pipeline.ultimaAssinatura;
  return novoObstaculo || agoraMs >= pipeline.proximoEm;
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

export function metricasPiloto(pipeline, agoraMs) {
  const validos = pipeline.historico.filter((item) => !item.erro);
  const latencias = validos.map((item) => Number(item.latencia_ms)).filter(Number.isFinite);
  const separacoes = validos.map((item) => Number(item.separacao_min_m)).filter(Number.isFinite);
  const duracaoMs = Math.max(1, agoraMs - (pipeline.iniciadoEm ?? agoraMs));
  return {
    decisoes: validos.length,
    decisoes_por_minuto: Math.round((validos.length * 60_000) / duracaoMs),
    latencia_mediana_ms: percentil(latencias, 50),
    latencia_p95_ms: percentil(latencias, 95),
    separacao_min_m: separacoes.length ? Math.min(...separacoes) : null,
  };
}
