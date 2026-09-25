/**
 * Casos tácticos rotulados para o banco de casos (avaliar-jev.mjs). Fixam o
 * formato do estado táctico que tatico.js vai produzir:
 *
 *   voo:      fase (em_rota | aproximacao | orbita), margem_terreno (folgada | curta),
 *             nuvens (sem nuvens | acima | no nível | abaixo)
 *   missao:   tipo, prioridade, almas, doente_a_bordo, risco_maximo
 *   ameacas:  id (a1…), tipo, posicao (horas de relógio), movimento (converge | afasta | paralelo),
 *             tempo_ate_cpa (imediato | curto | longo), cpa_se_manter (conflito | marginal | folgada),
 *             altura_relativa (acima | mesmo nível | abaixo), intencao (constante | a virar para nós | errática)
 *   manobras: por candidata — separacao (conflito | marginal | folgada), ameaca_critica (aN | nenhuma),
 *             regra_do_ar (cumpre | neutra | incumpre), nuvem (livre | entra), terreno (livre | perto),
 *             desvio_rota (nenhum | pequeno | grande), conforto (suave | brusca)
 *
 * `aceites` são as manobras defensáveis segundo as prioridades das instruções:
 * separação, depois regra do ar, depois nuvem e terreno, depois desvio e conforto.
 */

const VOO = { fase: 'em_rota', margem_terreno: 'folgada', nuvens: 'sem nuvens' };
const MISSAO = { tipo: 'porto', prioridade: 'integridade', almas: 8, doente_a_bordo: false, risco_maximo: 'medio' };

function m(separacao, regra_do_ar, desvio_rota, conforto = 'suave', extra = {}) {
  return {
    separacao,
    ameaca_critica: extra.critica ?? (separacao === 'folgada' ? 'nenhuma' : 'a1'),
    regra_do_ar,
    nuvem: extra.nuvem ?? 'livre',
    terreno: extra.terreno ?? 'livre',
    desvio_rota,
    conforto,
  };
}

function ameaca(id, tipo, posicao, movimento, tempo_ate_cpa, cpa_se_manter, altura_relativa = 'mesmo nível', intencao = 'constante') {
  return { id, tipo, posicao, movimento, tempo_ate_cpa, cpa_se_manter, altura_relativa, intencao };
}

function caso(id, nota, { voo = {}, missao = {}, ameacas, manobras, aceites }) {
  return {
    id,
    nota,
    aceites,
    estado: {
      momento: 'tatico',
      voo: { ...VOO, ...voo },
      missao: { ...MISSAO, ...missao },
      ameacas,
      manobras,
    },
  };
}

export const CASOS_TATICO = [
  caso('frente_mesmo_nivel', 'Tráfego de frente ao mesmo nível: a regra manda virar à direita.', {
    ameacas: [ameaca('a1', 'avião ligeiro', '12 horas', 'converge', 'curto', 'conflito')],
    manobras: {
      manter: m('conflito', 'incumpre', 'nenhum'),
      esquerda: m('folgada', 'incumpre', 'pequeno'),
      direita: m('folgada', 'cumpre', 'pequeno'),
      subir: m('marginal', 'neutra', 'nenhum'),
      descer: m('marginal', 'neutra', 'nenhum'),
      esquerda_subir: m('folgada', 'incumpre', 'pequeno', 'brusca'),
      direita_subir: m('folgada', 'cumpre', 'pequeno', 'brusca'),
    },
    aceites: ['direita', 'direita_subir'],
  }),
  caso('convergente_direita', 'Helicóptero a convergir pela direita: o LUS-222 dá passagem, passando-lhe por trás.', {
    ameacas: [ameaca('a1', 'helicóptero', '2 horas', 'converge', 'curto', 'conflito')],
    manobras: {
      manter: m('conflito', 'incumpre', 'nenhum'),
      esquerda: m('marginal', 'incumpre', 'pequeno'),
      direita: m('folgada', 'cumpre', 'pequeno'),
      subir: m('folgada', 'neutra', 'nenhum'),
      descer: m('marginal', 'neutra', 'nenhum'),
      esquerda_subir: m('folgada', 'incumpre', 'pequeno', 'brusca'),
      direita_subir: m('folgada', 'cumpre', 'pequeno', 'brusca'),
    },
    aceites: ['direita', 'subir', 'direita_subir'],
  }),
  caso('convergente_esquerda', 'Tráfego a convergir pela esquerda: é ele que dá passagem; manter é o que a regra pede.', {
    ameacas: [ameaca('a1', 'avião ligeiro', '10 horas', 'converge', 'curto', 'marginal')],
    manobras: {
      manter: m('marginal', 'cumpre', 'nenhum'),
      esquerda: m('conflito', 'incumpre', 'pequeno'),
      direita: m('folgada', 'neutra', 'pequeno'),
      subir: m('folgada', 'neutra', 'nenhum'),
      descer: m('marginal', 'neutra', 'nenhum'),
      esquerda_subir: m('marginal', 'incumpre', 'pequeno', 'brusca'),
      direita_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
    },
    aceites: ['manter', 'direita', 'subir', 'direita_subir'],
  }),
  caso('baloes_nuvem_acima', 'Lanternas de São João à frente; nuvens logo acima: subir entra na nuvem.', {
    voo: { nuvens: 'acima' },
    ameacas: [ameaca('a1', 'balões iluminados', '12 horas', 'converge', 'curto', 'conflito', 'mesmo nível', 'errática')],
    manobras: {
      manter: m('conflito', 'neutra', 'nenhum'),
      esquerda: m('marginal', 'neutra', 'pequeno'),
      direita: m('folgada', 'neutra', 'pequeno'),
      subir: m('folgada', 'neutra', 'nenhum', 'suave', { nuvem: 'entra' }),
      descer: m('folgada', 'neutra', 'nenhum'),
      esquerda_subir: m('marginal', 'neutra', 'pequeno', 'brusca', { nuvem: 'entra' }),
      direita_subir: m('folgada', 'neutra', 'pequeno', 'brusca', { nuvem: 'entra' }),
    },
    aceites: ['direita', 'descer'],
  }),
  caso('aves_abaixo', 'Bando de aves ligeiramente abaixo, à frente.', {
    ameacas: [ameaca('a1', 'bando de aves', '12 horas', 'converge', 'curto', 'marginal', 'abaixo', 'errática')],
    manobras: {
      manter: m('marginal', 'neutra', 'nenhum'),
      esquerda: m('marginal', 'neutra', 'pequeno'),
      direita: m('marginal', 'neutra', 'pequeno'),
      subir: m('folgada', 'neutra', 'nenhum'),
      descer: m('conflito', 'neutra', 'nenhum'),
      esquerda_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
      direita_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
    },
    aceites: ['subir', 'esquerda_subir', 'direita_subir'],
  }),
  caso('duas_ameacas', 'Helicóptero pela direita (dar passagem) e aves à direita, baixas: virar à direita cai nas aves.', {
    ameacas: [
      ameaca('a1', 'helicóptero', '2 horas', 'converge', 'curto', 'conflito'),
      ameaca('a2', 'bando de aves', '1 hora', 'converge', 'curto', 'marginal', 'abaixo', 'errática'),
    ],
    manobras: {
      manter: m('conflito', 'incumpre', 'nenhum'),
      esquerda: m('marginal', 'incumpre', 'pequeno'),
      direita: m('conflito', 'cumpre', 'pequeno', 'suave', { critica: 'a2' }),
      subir: m('folgada', 'neutra', 'nenhum'),
      descer: m('conflito', 'neutra', 'nenhum', 'suave', { critica: 'a2' }),
      esquerda_subir: m('folgada', 'incumpre', 'pequeno', 'brusca'),
      direita_subir: m('marginal', 'cumpre', 'pequeno', 'brusca', { critica: 'a2' }),
    },
    aceites: ['subir'],
  }),
  caso('celula_a_direita', 'Célula de trovoada à frente e à direita, a derivar para a rota.', {
    voo: { nuvens: 'no nível' },
    ameacas: [ameaca('a1', 'célula meteorológica', '1 hora', 'converge', 'curto', 'conflito', 'mesmo nível', 'constante')],
    manobras: {
      manter: m('conflito', 'neutra', 'nenhum', 'suave', { nuvem: 'entra' }),
      esquerda: m('folgada', 'neutra', 'pequeno'),
      direita: m('conflito', 'neutra', 'pequeno', 'suave', { nuvem: 'entra' }),
      subir: m('marginal', 'neutra', 'nenhum', 'suave', { nuvem: 'entra' }),
      descer: m('marginal', 'neutra', 'nenhum'),
      esquerda_subir: m('folgada', 'neutra', 'pequeno', 'brusca', { nuvem: 'entra' }),
      direita_subir: m('conflito', 'neutra', 'pequeno', 'brusca', { nuvem: 'entra' }),
    },
    aceites: ['esquerda'],
  }),
  caso('a_afastar', 'Tráfego já a afastar-se, CPA passado com folga.', {
    ameacas: [ameaca('a1', 'avião comercial', '8 horas', 'afasta', 'longo', 'folgada', 'acima')],
    manobras: {
      manter: m('folgada', 'neutra', 'nenhum'),
      esquerda: m('folgada', 'neutra', 'pequeno'),
      direita: m('folgada', 'neutra', 'pequeno'),
      subir: m('folgada', 'neutra', 'nenhum'),
      descer: m('folgada', 'neutra', 'nenhum'),
      esquerda_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
      direita_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
    },
    aceites: ['manter'],
  }),
  caso('sem_ameacas', 'Corredor livre.', {
    ameacas: [],
    manobras: {
      manter: m('folgada', 'neutra', 'nenhum'),
      esquerda: m('folgada', 'neutra', 'pequeno'),
      direita: m('folgada', 'neutra', 'pequeno'),
      subir: m('folgada', 'neutra', 'nenhum'),
      descer: m('folgada', 'neutra', 'nenhum'),
      esquerda_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
      direita_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
    },
    aceites: ['manter'],
  }),
  caso('medevac_conforto', 'MEDEVAC com doente a bordo; um drone à frente. Subir resolve sem desvio e com suavidade.', {
    missao: { tipo: 'medevac', prioridade: 'tempo', almas: 4, doente_a_bordo: true },
    ameacas: [ameaca('a1', 'drone', '12 horas', 'converge', 'curto', 'conflito', 'mesmo nível', 'errática')],
    manobras: {
      manter: m('conflito', 'neutra', 'nenhum'),
      esquerda: m('folgada', 'neutra', 'pequeno', 'brusca'),
      direita: m('folgada', 'neutra', 'pequeno', 'brusca'),
      subir: m('folgada', 'neutra', 'nenhum'),
      descer: m('marginal', 'neutra', 'nenhum'),
      esquerda_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
      direita_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
    },
    aceites: ['subir'],
  }),
  caso('final_trafego', 'Na final, um helicóptero cruza baixo à frente; descer não é candidata perto da pista.', {
    voo: { fase: 'aproximacao' },
    ameacas: [ameaca('a1', 'helicóptero', '1 hora', 'converge', 'curto', 'conflito', 'abaixo')],
    manobras: {
      manter: m('conflito', 'neutra', 'nenhum'),
      esquerda: m('marginal', 'neutra', 'grande'),
      direita: m('marginal', 'neutra', 'grande'),
      subir: m('folgada', 'neutra', 'pequeno'),
      esquerda_subir: m('folgada', 'neutra', 'grande', 'brusca'),
      direita_subir: m('folgada', 'neutra', 'grande', 'brusca'),
    },
    aceites: ['subir'],
  }),
  caso('relevo_frente', 'Crista de relevo à frente, margem ao terreno curta.', {
    voo: { margem_terreno: 'curta' },
    ameacas: [ameaca('a1', 'crista de relevo', '12 horas', 'converge', 'curto', 'conflito', 'acima')],
    manobras: {
      manter: m('conflito', 'neutra', 'nenhum', 'suave', { terreno: 'perto' }),
      esquerda: m('marginal', 'neutra', 'pequeno', 'suave', { terreno: 'perto' }),
      direita: m('folgada', 'neutra', 'pequeno'),
      subir: m('folgada', 'neutra', 'nenhum'),
      descer: m('conflito', 'neutra', 'nenhum', 'suave', { terreno: 'perto' }),
      esquerda_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
      direita_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
    },
    aceites: ['direita', 'subir', 'esquerda_subir', 'direita_subir'],
  }),
  caso('ultrapassagem', 'Tráfego mais rápido a ultrapassar por trás e à esquerda: é ele que se afasta; manter cumpre a regra.', {
    ameacas: [ameaca('a1', 'avião ligeiro', '7 horas', 'converge', 'curto', 'marginal')],
    manobras: {
      manter: m('marginal', 'cumpre', 'nenhum'),
      esquerda: m('conflito', 'incumpre', 'pequeno'),
      direita: m('folgada', 'neutra', 'pequeno'),
      subir: m('folgada', 'neutra', 'nenhum'),
      descer: m('marginal', 'neutra', 'nenhum'),
      esquerda_subir: m('marginal', 'incumpre', 'pequeno', 'brusca'),
      direita_subir: m('folgada', 'neutra', 'pequeno', 'brusca'),
    },
    aceites: ['manter', 'direita', 'subir'],
  }),
  caso('compromisso', 'Sem opção limpa: a direita cumpre mas fica marginal, subir fica folgado mas entra na nuvem. Serve para ver a confiança baixar.', {
    voo: { nuvens: 'acima' },
    ameacas: [ameaca('a1', 'avião ligeiro', '12 horas', 'converge', 'curto', 'conflito')],
    manobras: {
      manter: m('conflito', 'incumpre', 'nenhum'),
      esquerda: m('folgada', 'incumpre', 'pequeno'),
      direita: m('marginal', 'cumpre', 'pequeno'),
      subir: m('folgada', 'neutra', 'nenhum', 'suave', { nuvem: 'entra' }),
      descer: m('conflito', 'neutra', 'nenhum', 'suave', { terreno: 'perto' }),
      esquerda_subir: m('folgada', 'incumpre', 'pequeno', 'brusca', { nuvem: 'entra' }),
      direita_subir: m('marginal', 'cumpre', 'pequeno', 'brusca', { nuvem: 'entra' }),
    },
    aceites: ['subir', 'direita'],
  }),
];
