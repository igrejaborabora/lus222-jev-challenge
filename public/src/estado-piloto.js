import { cpa } from './ameacas.js';
import { actuacaoDeManobra } from './piloto-sim.js';
import { alturaChaoM, preverActuacao } from './simulacao.js';
import { MANOBRAS_TATICAS } from './decisao.js';

/**
 * O que o JEV lê quando pilota: o estado do voo em categorias, com as contas
 * feitas em código (o JEV é fraco a comparar números, forte a ponderar
 * categorias). Para cada manobra candidata, a previsão a 30 s (aplicada 8 s,
 * depois estabilizada) dá separação, regra do ar, nuvem, terreno, desvio de
 * rota, correcção de altitude e conforto. É o mesmo formato validado no banco
 * de casos (14/14 nos tácticos).
 */
export const PERFIL_ALTITUDE_M = 480;
export const MAX_AMEACAS_ESTADO = 5;
const MARGEM_MARGINAL_M = 150;
const AGL_SEM_DESCER_M = 150;

export const ENUMS_PILOTO = Object.freeze({
  altitude: ['abaixo do perfil', 'no perfil', 'acima do perfil'],
  chao: ['folgado', 'perto'],
  velocidade: ['lenta', 'cruzeiro', 'rápida'],
  tendencia: ['a abrandar', 'estável', 'a acelerar'],
  potencia: ['baixa', 'média', 'alta'],
  direcao: ['à esquerda', 'em frente', 'à direita'],
  desvio: ['nenhum', 'pequeno', 'grande'],
  distancia: ['perto', 'média', 'longe'],
  movimento: ['converge', 'afasta', 'paralelo'],
  tempo_ate_cpa: ['imediato', 'curto', 'longo'],
  cpa_se_manter: ['conflito', 'marginal', 'folgada'],
  altura_relativa: ['acima', 'mesmo nível', 'abaixo'],
  intencao: ['constante', 'a mudar de rumo', 'errática', 'com o vento'],
  separacao: ['conflito', 'marginal', 'folgada'],
  regra_do_ar: ['cumpre', 'neutra', 'incumpre'],
  nuvem: ['livre', 'entra'],
  terreno: ['livre', 'perto'],
  rota: ['aproxima', 'mantém', 'afasta'],
  altitude_manobra: ['corrige', 'mantém', 'afasta'],
  conforto: ['suave', 'brusca'],
});
export const TIPOS_AMEACA = Object.freeze(['avião ligeiro', 'helicóptero', 'balões de São João', 'bando de gaivotas', 'célula de trovoada']);
export const PONTOS_CIRCUITO = Object.freeze(['Foz do Douro', 'Ponte D. Luís I', 'Aeroporto Francisco Sá Carneiro', 'Matosinhos']);

const angulo = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const graus = (r) => (r * 180) / Math.PI;

/** Posição em horas de relógio: 12 à frente, 3 à direita, 9 à esquerda. */
export function horasDeRelogio(voo, xM, zM) {
  const rel = angulo(Math.atan2(xM - voo.xM, zM - voo.zM) - voo.rumoRad);
  const hora = (((Math.round(graus(rel) / 30)) % 12) + 12) % 12 || 12;
  return `${hora} ${hora === 1 ? 'hora' : 'horas'}`;
}

/** Geometria do tráfego para as regras do ar: de frente, pela direita, pela esquerda ou a ultrapassar. */
function geometriaTrafego(voo, a) {
  const rel = graus(angulo(Math.atan2(a.xM - voo.xM, a.zM - voo.zM) - voo.rumoRad));
  const relRumo = graus(angulo(Math.atan2(a.vxMs, a.vzMs) - voo.rumoRad));
  if (Math.abs(rel) <= 25 && Math.abs(relRumo) >= 150) return 'frente';
  if (Math.abs(rel) >= 110) return 'ultrapassagem';
  return rel > 0 ? 'direita' : 'esquerda';
}

/** Regra do ar de uma manobra face à geometria: de frente e pela direita vira-se à direita; pela esquerda e a ultrapassar mantém-se. */
export function regraDoAr(geometria, manobra) {
  const { lateral } = actuacaoDeManobra(manobra);
  if (geometria === 'frente' || geometria === 'direita') {
    if (lateral === 'direita') return 'cumpre';
    if (lateral === 'esquerda' || manobra === 'manter') return 'incumpre';
    return 'neutra';
  }
  if (geometria === 'esquerda') return manobra === 'manter' ? 'cumpre' : lateral === 'esquerda' ? 'incumpre' : 'neutra';
  if (geometria === 'ultrapassagem') return manobra === 'manter' ? 'cumpre' : 'neutra';
  return 'neutra';
}

function classeMargem(margemM) {
  if (!Number.isFinite(margemM)) return 'folgada';
  if (margemM < 0) return 'conflito';
  return margemM < MARGEM_MARGINAL_M ? 'marginal' : 'folgada';
}

function intencaoDe(a) {
  const c = a.comportamento?.tipo;
  if (c === 'vagueio') return 'errática';
  if (c === 'vento' || c === 'celula' || c === 'deriva') return 'com o vento';
  const base = Math.atan2(a.comportamento?.baseVx ?? a.vxMs, a.comportamento?.baseVz ?? a.vzMs);
  return Math.abs(angulo(Math.atan2(a.vxMs, a.vzMs) - base)) > 0.15 ? 'a mudar de rumo' : 'constante';
}

function erroDeRota(voo, alvo) {
  return graus(angulo(Math.atan2(alvo.xM - voo.xM, alvo.zM - voo.zM) - voo.rumoRad));
}

/** Estado do JEV piloto a partir da missão do simulador e das ordens do comandante. */
export function estadoPiloto(m, { ordens = '' } = {}) {
  const v = m.voo;
  // Tendência da velocidade no último passo (m/s por segundo).
  const tendencia = m.vooAnterior ? (v.velocidadeMs - m.vooAnterior.velocidadeMs) / 0.1 : 0;
  const agl = v.altitudeM - alturaChaoM(m, v.xM, v.zM);
  const alvo = m.destinos.find((d) => d.id === m.destinoId) ?? m.destinos[0];
  const erro = erroDeRota(v, alvo);
  const distanciaKm = Math.hypot(alvo.xM - v.xM, alvo.zM - v.zM) / 1000;
  const tetoM = (m.ambiente.tetoFt ?? 3000) / 3.28084;
  const candidatas = MANOBRAS_TATICAS.filter((c) => c !== 'descer' || agl >= AGL_SEM_DESCER_M);
  const previsoes = Object.fromEntries(candidatas.map((c) => [c, preverActuacao(m, { ...actuacaoDeManobra(c), potencia: 'manter' })]));
  const semManobra = previsoes.manter;

  // As ameaças mais críticas primeiro (margem se mantiver), no máximo cinco.
  const visiveis = [...(m.ameacas ?? [])]
    .sort((a, b) => (semManobra.margens[a.id] ?? Infinity) - (semManobra.margens[b.id] ?? Infinity))
    .slice(0, MAX_AMEACAS_ESTADO);
  const ameacas = visiveis.map((a) => {
    const c = cpa(v, a, m.ambiente.ventoMs);
    const dy = a.cilindro ? 0 : a.altitudeM - v.altitudeM;
    return {
      id: a.id,
      tipo: a.tipo,
      posicao: horasDeRelogio(v, a.xM, a.zM),
      movimento: c.movimento === 'afasta' ? 'afasta' : c.tcpaS > 90 ? 'paralelo' : 'converge',
      tempo_ate_cpa: c.movimento === 'afasta' ? 'longo' : c.tcpaS < 10 ? 'imediato' : c.tcpaS < 30 ? 'curto' : 'longo',
      cpa_se_manter: classeMargem(semManobra.margens[a.id]),
      altura_relativa: dy > 60 ? 'acima' : dy < -60 ? 'abaixo' : 'mesmo nível',
      intencao: intencaoDe(a),
    };
  });

  // A regra do ar vem do tráfego que mais aperta e ainda converge.
  const trafego = visiveis.find((a) => a.visual === 'trafego' && classeMargem(semManobra.margens[a.id]) !== 'folgada' && cpa(v, a, m.ambiente.ventoMs).movimento === 'converge');
  const geometria = trafego ? geometriaTrafego(v, trafego) : null;
  const erroAltAgora = Math.abs(v.altitudeM - PERFIL_ALTITUDE_M);
  const manobras = Object.fromEntries(candidatas.map((c) => {
    const p = previsoes[c];
    const separacao = visiveis.length ? classeMargem(p.margemM) : 'folgada';
    // A rota avalia-se a 3 s: com a curva aplicada 8 s, manter e virar davam o mesmo desvio.
    const erroDepois = Math.abs(erroDeRota(p.vooAmostra, alvo));
    const erroAltDepois = Math.abs(p.vooFinal.altitudeM - PERFIL_ALTITUDE_M);
    return [c, {
      separacao,
      ameaca_critica: separacao === 'folgada' ? 'nenhuma' : p.critica,
      regra_do_ar: geometria ? regraDoAr(geometria, c) : 'neutra',
      nuvem: p.vooFinal.altitudeM > tetoM - 20 ? 'entra' : 'livre',
      terreno: p.aglMinM < 120 ? 'perto' : 'livre',
      rota: erroDepois < Math.abs(erro) - 1.5 ? 'aproxima' : erroDepois > Math.abs(erro) + 1.5 ? 'afasta' : 'mantém',
      altitude: erroAltDepois < erroAltAgora - 5 ? 'corrige' : erroAltDepois > erroAltAgora + 5 ? 'afasta' : 'mantém',
      conforto: c.includes('_') ? 'brusca' : 'suave',
    }];
  }));

  return {
    momento: 'piloto',
    voo: {
      altitude: v.altitudeM < PERFIL_ALTITUDE_M - 40 ? 'abaixo do perfil' : v.altitudeM > PERFIL_ALTITUDE_M + 40 ? 'acima do perfil' : 'no perfil',
      chao: agl < AGL_SEM_DESCER_M ? 'perto' : 'folgado',
      velocidade: v.velocidadeMs < 80 ? 'lenta' : v.velocidadeMs > 96 ? 'rápida' : 'cruzeiro',
      tendencia: tendencia > 0.25 ? 'a acelerar' : tendencia < -0.25 ? 'a abrandar' : 'estável',
      potencia: (v.acelerador ?? 0.55) < 0.45 ? 'baixa' : (v.acelerador ?? 0.55) > 0.8 ? 'alta' : 'média',
    },
    rota: {
      proximo_ponto: alvo.nome ?? alvo.id,
      direcao: erro < -10 ? 'à esquerda' : erro > 10 ? 'à direita' : 'em frente',
      desvio: Math.abs(erro) <= 10 ? 'nenhum' : Math.abs(erro) <= 45 ? 'pequeno' : 'grande',
      distancia: distanciaKm < 2 ? 'perto' : distanciaKm < 8 ? 'média' : 'longe',
    },
    missao: { tipo: 'voo livre', prioridade: 'integridade', almas: m.missao?.almas ?? 2 },
    ordens_do_comandante: limparOrdens(ordens) || 'sem ordens',
    ameacas,
    manobras,
  };
}

/** Texto livre das ordens: sem caracteres de controlo, espaços colapsados, até 120. */
export function limparOrdens(texto) {
  const semControlo = Array.from(String(texto ?? ''), (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('');
  return semControlo.replace(/\s+/g, ' ').trim().slice(0, 120);
}

const um = (valor, lista, fallback) => (lista.includes(valor) ? valor : fallback);

/**
 * Filtro do servidor: reconstrói o estado só com valores das listas, ids aN,
 * horas de relógio válidas e as ordens limpas. Nada do cliente passa tal e qual.
 */
/** Uma escolha precisa de duas opções (o Gateway recusa uma só): o estado tem de trazer pelo menos duas manobras. */
export function estadoPilotoCompleto(estado) {
  return Object.keys(estado?.manobras ?? {}).length >= 2;
}

export function lerEstadoPiloto(raw) {
  const e = raw && typeof raw === 'object' ? raw : {};
  const v = e.voo ?? {};
  const r = e.rota ?? {};
  // Ids válidos e únicos: ids repetidos faziam da ameaça prioritária uma escolha de uma opção só.
  const ameacas = (Array.isArray(e.ameacas) ? e.ameacas : [])
    .filter((a) => /^a\d{1,4}$/.test(String(a?.id)))
    .filter((a, i, lista) => lista.findIndex((b) => String(b?.id) === String(a.id)) === i)
    .slice(0, MAX_AMEACAS_ESTADO)
    .map((a) => ({
      id: String(a.id),
      tipo: um(a.tipo, TIPOS_AMEACA, 'desconhecido'),
      posicao: /^(1[0-2]|[1-9]) horas?$/.test(String(a.posicao)) ? String(a.posicao) : '12 horas',
      movimento: um(a.movimento, ENUMS_PILOTO.movimento, 'converge'),
      tempo_ate_cpa: um(a.tempo_ate_cpa, ENUMS_PILOTO.tempo_ate_cpa, 'longo'),
      cpa_se_manter: um(a.cpa_se_manter, ENUMS_PILOTO.cpa_se_manter, 'folgada'),
      altura_relativa: um(a.altura_relativa, ENUMS_PILOTO.altura_relativa, 'mesmo nível'),
      intencao: um(a.intencao, ENUMS_PILOTO.intencao, 'constante'),
    }));
  const ids = new Set(ameacas.map((a) => a.id));
  const manobras = Object.fromEntries(MANOBRAS_TATICAS.filter((c) => e.manobras?.[c]).map((c) => {
    const x = e.manobras[c];
    return [c, {
      separacao: um(x.separacao, ENUMS_PILOTO.separacao, 'folgada'),
      ameaca_critica: ids.has(x.ameaca_critica) ? x.ameaca_critica : 'nenhuma',
      regra_do_ar: um(x.regra_do_ar, ENUMS_PILOTO.regra_do_ar, 'neutra'),
      nuvem: um(x.nuvem, ENUMS_PILOTO.nuvem, 'livre'),
      terreno: um(x.terreno, ENUMS_PILOTO.terreno, 'livre'),
      rota: um(x.rota, ENUMS_PILOTO.rota, 'mantém'),
      altitude: um(x.altitude, ENUMS_PILOTO.altitude_manobra, 'mantém'),
      conforto: um(x.conforto, ENUMS_PILOTO.conforto, 'suave'),
    }];
  }));
  if (!manobras.manter) manobras.manter = { separacao: 'folgada', ameaca_critica: 'nenhuma', regra_do_ar: 'neutra', nuvem: 'livre', terreno: 'livre', rota: 'mantém', altitude: 'mantém', conforto: 'suave' };
  return {
    momento: 'piloto',
    voo: {
      altitude: um(v.altitude, ENUMS_PILOTO.altitude, 'no perfil'),
      chao: um(v.chao, ENUMS_PILOTO.chao, 'folgado'),
      velocidade: um(v.velocidade, ENUMS_PILOTO.velocidade, 'cruzeiro'),
      tendencia: um(v.tendencia, ENUMS_PILOTO.tendencia, 'estável'),
      potencia: um(v.potencia, ENUMS_PILOTO.potencia, 'média'),
    },
    rota: {
      proximo_ponto: um(r.proximo_ponto, PONTOS_CIRCUITO, PONTOS_CIRCUITO[0]),
      direcao: um(r.direcao, ENUMS_PILOTO.direcao, 'em frente'),
      desvio: um(r.desvio, ENUMS_PILOTO.desvio, 'nenhum'),
      distancia: um(r.distancia, ENUMS_PILOTO.distancia, 'média'),
    },
    missao: { tipo: 'voo livre', prioridade: 'integridade', almas: Math.max(1, Math.min(22, Math.round(Number(e.missao?.almas) || 2))) },
    ordens_do_comandante: limparOrdens(e.ordens_do_comandante) || 'sem ordens',
    ameacas,
    manobras,
  };
}

/** O estado em linhas curtas, para o painel «O que o JEV lê». */
export function textoEstado(e) {
  const linhas = [
    `ROTA   ${e.rota.proximo_ponto} · ${e.rota.direcao} · desvio ${e.rota.desvio} · ${e.rota.distancia}`,
    `VOO    altitude ${e.voo.altitude} · ${e.voo.velocidade} (${e.voo.tendencia}) · potência ${e.voo.potencia} · chão ${e.voo.chao}`,
    `ORDEM  ${e.ordens_do_comandante}`,
  ];
  for (const a of e.ameacas) linhas.push(`${a.id.padEnd(6)} ${a.tipo} · ${a.posicao} · ${a.movimento} · CPA ${a.tempo_ate_cpa} · ${a.cpa_se_manter} se manter · ${a.altura_relativa} · ${a.intencao}`);
  for (const [c, x] of Object.entries(e.manobras)) {
    const extras = [x.regra_do_ar !== 'neutra' ? `regra ${x.regra_do_ar}` : null, x.nuvem === 'entra' ? 'entra na nuvem' : null, x.terreno === 'perto' ? 'terreno perto' : null, `rota ${x.rota}`, `alt ${x.altitude}`].filter(Boolean).join(', ');
    linhas.push(`${c.padEnd(14)} ${x.separacao}${x.ameaca_critica !== 'nenhuma' ? `(${x.ameaca_critica})` : ''} · ${extras}`);
  }
  return linhas.join('\n');
}
