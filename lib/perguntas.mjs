import { MANOBRAS_TATICAS } from './decisao.mjs';

const CONTEXTO =
  'És a camada de decisão tipada do JEV a bordo de um LUS-222 (STOL bimotor português, CEiiA/EEA Aircraft). ' +
  'Não és um piloto de stick e não geras prosa. Avalias o estado partilhado e escolhes acções de missão e eixos de evasão. ' +
  'Aplicas a acção e os eixos de imediato — o LUS-222 desvia sozinho. ' +
  'Isto não é Detect-and-Avoid certificável: a separação mínima continua fora deste modelo. ' +
  'Pondera combustível, payload, almas, relógio clínico, meteorologia, pista, voo actual, alternativas calculadas, restrições do comandante e geometria. ';

export const PERGUNTAS_BRIEFING = {
  configuracaoCabine: {
    type: 'choice',
    instructions:
      CONTEXTO +
      'Escolhe a configuração de cabine mais adequada a este briefing, dadas a missão, a carga e as almas a bordo.',
    criteria: {
      medevac: 'evacuação médica — paciente crítico, espaço clínico, prioridade tempo',
      carga: 'carga / rampa traseira — payload e combustível dominam',
      passageiros: 'transporte de pessoas sem urgente clínico',
      mista: 'carga e pessoas, ou missão que não cabe numa só configuração',
    },
  },
  prioridadeOperacional: {
    type: 'choice',
    instructions:
      CONTEXTO +
      'Qual é a prioridade operacional deste briefing, à luz das restrições do comandante e do estado da aeronave?',
    criteria: {
      tempo: 'o relógio clínico ou a janela de luz mandam',
      combustivel: 'o alcance ou o combustível são o factor limitante',
      meteorologia: 'o tecto, a visibilidade ou o vento impedem o plano',
      integridade: 'a aeronave está degradada ou o risco estrutural manda',
      carga_critica: 'a massa, a rampa ou a carga útil são o factor decisivo',
    },
  },
  pistaAdequada: {
    type: 'boolean',
    instructions:
      'A pista anunciada (comprimento e superfície) é adequada a um LUS-222 nesta configuração e meteorologia? ' +
      'Uma pista não pavimentada curta exige STOL e margem; abaixo da tabela operacional não é adequada.',
    criteria: {
      true: 'comprimento e superfície chegam com margem para este peso e vento',
      false: 'pista curta, não pavimentada sem margem, ou tecto/vento incompatíveis',
    },
  },
  combustivelSuficiente: {
    type: 'boolean',
    instructions:
      'O combustível e o alcance restante chegam ao destino planeado com reserva, dados o vento e o payload?',
    criteria: {
      true: 'há combustível e alcance com reserva até ao destino',
      false: 'o vento, o payload ou o alcance tornam o destino planeado inviável sem descarregar ou desviar',
    },
  },
};

export const PERGUNTAS_INCIDENTE = {
  acaoMissao: {
    type: 'choice',
    instructions:
      CONTEXTO +
      'Escolhe a acção de missão agora. Não é uma correcção de pixel: é a decisão do comandante. ' +
      'Uma evasão lateral ou vertical pontual pode preservar o destino: nesse caso escolhe prosseguir e indica a manobra. ' +
      'Desviar_alternativo muda o aeroporto de destino e só se justifica se a rota ou chegada persistirem inviáveis. ' +
      'Se o comandante marcou nunca_desviar, só desvies ou abortes quando a integridade ou as almas o exigirem.',
    criteria: {
      prosseguir: 'o plano aguenta — céu, fuel, pista e relógio permitem continuar, mesmo que uma manobra pontual separe uma ameaça',
      desviar_alternativo: 'o destino ou o corredor continuam inviáveis depois de uma manobra pontual — mudar de aeroporto',
      orbitar: 'comprar tempo: luz, contacto visual ou meteorologia a mudar',
      regressar_base: 'voltar à origem — sobrecarga, fuel ou missão inviável em avançar',
      abortar_emergencia: 'terminar o voo já — integridade crítica ou emergência de missão',
    },
  },
  manobraVertical: {
    type: 'choice',
    instructions:
      CONTEXTO +
      'Escolhe o eixo vertical da evasão agora. O LUS-222 aplica já. ' +
      'Sobe se a melhor folga for por cima (torres do corredor, bando, tráfego baixo). ' +
      'Desce só com margem abaixo e sem terreno. Mantém se não houver ameaça vertical.',
    criteria: {
      subir: 'melhor folga por cima, ou obstáculo abaixo do tecto da aeronave',
      descer: 'melhor folga por baixo e terreno livre',
      manter: 'sem ameaça vertical — a acção de missão basta, ou o tecto impede subir',
    },
  },
  manobraLateral: {
    type: 'choice',
    instructions:
      CONTEXTO +
      'Escolhe o eixo lateral da evasão agora. O LUS-222 aplica já. ' +
      'Esquerda e direita são do ponto de vista do piloto; offset_lateral_m positivo = obstáculo à direita. ' +
      'Compara folga_pela_esquerda_m com folga_pela_direita_m do obstáculo mais próximo e vira para a maior.',
    criteria: {
      esquerda: 'folga_pela_esquerda_m é maior do que folga_pela_direita_m e positiva',
      direita: 'folga_pela_direita_m é maior do que folga_pela_esquerda_m e positiva',
      manter: 'sem obstáculo próximo, ou as duas folgas laterais são piores do que manter o rumo',
    },
  },
  destinoPreferido: {
    type: 'choice',
    instructions:
      'Para onde deve ir o LUS-222 se a acção não for simplesmente prosseguir no plano? Lê as alternativas e não escolhas pistas abaixo de pista_necessaria_m nem destinos sem reserva de combustível. ' +
      'Se o comandante prefere STOL, privilegia stol_proximo quando fizer sentido operacional.',
    criteria: {
      planeado: 'manter o destino do briefing',
      stol_proximo: 'pista curta / STOL mais próxima com margem',
      hospital_alternativo: 'infraestrutura clínica alternativa (MEDEVAC)',
      aeroporto_alternativo: 'aeroporto regional alternativo com pista e reserva suficientes (Porto)',
      origem: 'regresso à origem ou FAL',
    },
  },
  urgencia: {
    type: 'score',
    instructions:
      'Urgência da manobra e da decisão de missão. Olha o tempo até ao contacto, o relógio MEDEVAC, a luz e a integridade. ' +
      'Uma ameaça geométrica próxima é prioritária ou emergência — o LUS-222 tem de desviar já.',
    criteria: [
      'vigiar: a situação é estável; a decisão pode esperar o próximo incidente',
      'actuar: há uma janela a fechar (meteo, fuel ou relógio) mas sem emergência',
      'prioritário: a janela clínica ou operacional fecha em minutos',
      'emergência de missão: almas, integridade ou combustível exigem acção imediata',
    ],
  },
  riscoMeteorologico: {
    type: 'score',
    instructions:
      'Avalia o risco meteorológico para este LUS-222 neste instante: tecto, visibilidade, vento e luz do dia.',
    criteria: [
      'calmo: tecto e visibilidade folgados, vento leve, luz de dia',
      'atenção: tecto a baixar ou vento a crescer, ainda voável',
      'adverso: tecto baixo, vis reduzida ou vento que penaliza STOL/payload',
      'impedimento: voo visual ou aterragem no plano deixaram de ser defensáveis',
    ],
  },
  precisaRevisaoPIC: {
    type: 'boolean',
    instructions:
      'Esta situação sai do envelope normal da missão? Marca verdadeiro quando os dados se contradizem, ' +
      'quando vidas e integridade da aeronave colidem, quando o contacto visual é incerto, ' +
      'ou quando as restrições do comandante contradizem o que a situação pede. Julga só a situação descrita no estado.',
    criteria: {
      true: 'fora do envelope — um PIC humano deve rever',
      false: 'dentro do envelope — caso de rotina',
    },
  },
  continuarVoo: {
    type: 'boolean',
    instructions:
      'O voo deve continuar (mesmo que desviado ou em órbita)? Junta integridade, meteorologia e combustível — não só o obstáculo.',
    criteria: {
      true: 'a aeronave e o ambiente permitem continuar o voo com uma acção de missão',
      false: 'integridade, fuel ou meteo tornam o voo indefensável — abortar',
    },
  },
};

const CONTEXTO_PILOTO =
  ' No piloto contínuo recebes três a cinco obstáculos ordenados e geometria.folgas_candidatas. ' +
  'Escolhe os eixos que maximizam a folga mínima do corredor, não apenas a distância ao primeiro obstáculo. ' +
  'A resposta fica ligada ao snapshot que a originou; o controlador mantém a última ordem enquanto chegam até dois pedidos em pipeline.';

export function perguntasPara(momento, estado = null) {
  if (momento === 'briefing') return PERGUNTAS_BRIEFING;
  if (estado?.voo?.fase !== 'piloto_continuo') return PERGUNTAS_INCIDENTE;
  return Object.fromEntries(Object.entries(PERGUNTAS_INCIDENTE).map(([chave, pergunta]) => [
    chave,
    {
      ...pergunta,
      instructions: ['acaoMissao', 'manobraVertical', 'manobraLateral', 'urgencia'].includes(chave)
        ? `${pergunta.instructions}${CONTEXTO_PILOTO}`
        : pergunta.instructions,
    },
  ]));
}

const CONTEXTO_TATICO =
  'És a camada de decisão táctica do JEV a bordo de um LUS-222 (bimotor STOL). A cada segundo escolhes a manobra para o segundo seguinte. ' +
  'As contas já estão feitas: para cada manobra candidata, o estado traz a separação prevista a todas as ameaças nos próximos 30 s, ' +
  'a regra do ar, a entrada em nuvem, o terreno, o desvio de rota e o conforto. O supervisor determinístico veta conflitos; tu escolhes entre o que resta. ';

const DESCRICAO_MANOBRA = {
  manter: 'manter rumo e altitude',
  esquerda: 'virar à esquerda (esquerda do piloto)',
  direita: 'virar à direita (direita do piloto)',
  subir: 'subir sem virar',
  descer: 'descer sem virar',
  esquerda_subir: 'virar à esquerda e subir',
  direita_subir: 'virar à direita e subir',
};

/**
 * Perguntas do ciclo táctico. As opções de manobra são só as candidatas que o
 * estado traz (descer sai perto do destino) e as ameaças candidatas a
 * prioritária são as do estado, pela ordem de nascimento (a1, a2…).
 */
export function perguntasTatico(estado) {
  const manobras = MANOBRAS_TATICAS.filter((m) => estado?.manobras?.[m]);
  const ameacas = Array.isArray(estado?.ameacas) ? estado.ameacas : [];
  return {
    manobraTactica: {
      type: 'choice',
      instructions:
        CONTEXTO_TATICO +
        'Escolhe a manobra agora. Prioridades: primeiro a separação (nunca «conflito» havendo alternativa; «folgada» vale mais do que «marginal»); ' +
        'depois a regra do ar («cumpre» ou «neutra» antes de «incumpre»); depois evitar nuvem e terreno; por fim o menor desvio de rota e, com doente a bordo, manobras suaves.',
      criteria: Object.fromEntries(manobras.map((m) => [m, DESCRICAO_MANOBRA[m]])),
    },
    // Uma escolha precisa de duas opções (o Gateway recusa uma só): com uma ameaça, é essa.
    ...(ameacas.length >= 2 ? {
      ameacaPrioritaria: {
        type: 'choice',
        instructions:
          CONTEXTO_TATICO +
          'Qual das ameaças determina a manobra deste segundo? A que tem menor tempo até ao CPA com CPA em conflito ou marginal; em empate, a que converge.',
        criteria: Object.fromEntries(ameacas.map((a) => [a.id, `${a.tipo}, às ${a.posicao}, ${a.movimento}`])),
      },
    } : {}),
    urgencia: {
      type: 'score',
      instructions: CONTEXTO_TATICO + 'Urgência da manobra: quanto tempo falta até à ameaça mais crítica e quão pequena fica a separação se nada mudar.',
      criteria: [
        'vigiar: nenhuma ameaça em conflito',
        'actuar: conflito com tempo longo até ao CPA',
        'prioritário: conflito com tempo curto até ao CPA',
        'imediato: conflito com tempo imediato até ao CPA',
      ],
    },
    foraDoEnvelope: {
      type: 'boolean',
      instructions:
        CONTEXTO_TATICO +
        'A situação sai do envelope que as manobras candidatas cobrem? Verdadeiro quando nenhuma manobra evita o conflito, ' +
        'quando as ameaças se contradizem, ou quando todas as manobras seguras violam a regra do ar ou entram em nuvem.',
      criteria: {
        true: 'fora do envelope — o PIC deve decidir',
        false: 'há pelo menos uma manobra segura e aceitável',
      },
    },
  };
}


// ── JEV piloto (simulador): instruções em inglês, estado em português ──────
// O banco de casos (evidence/avaliacao-jev-2026-09-25.json) mostrou menos
// tokens, melhor Brier e erros com menos confiança com as instruções em EN.
const CONTEXT_PILOT =
  'You are JEV flying a LUS-222 (Portuguese twin-engine STOL aircraft) in real time over Porto on São João night. ' +
  "About three times per second you choose the controls for the next moment, as a pilot's hands on the stick and throttle. " +
  'The maths is already done in the state: route direction to the next waypoint, altitude and speed against the profile, each threat as a clock position, ' +
  'and for each candidate manoeuvre the predicted separation over the next 30 s, the rule of the air, cloud, terrain, route deviation, altitude correction and comfort. ' +
  "A deterministic supervisor (TCAS/GPWS) vetoes collisions; you fly everything else. Follow the commander's orders when they do not compromise separation. ";

const MANOEUVRE_EN = {
  manter: 'keep heading and altitude',
  esquerda: 'bank left (pilot left)',
  direita: 'bank right (pilot right)',
  subir: 'climb without turning',
  descer: 'descend without turning',
  esquerda_subir: 'bank left and climb',
  direita_subir: 'bank right and climb',
};

export function perguntasPiloto(estado) {
  const manobras = MANOBRAS_TATICAS.filter((m) => estado?.manobras?.[m]);
  const ameacas = Array.isArray(estado?.ameacas) ? estado.ameacas : [];
  return {
    plano: {
      type: 'choice',
      instructions:
        CONTEXT_PILOT +
        'What plan drives this moment? Avoid when a converging threat makes keeping the heading «conflito» or «marginal»; follow the route when the sky is clear; ' +
        "stabilise when altitude or speed are off the profile; follow the order when the commander asked for something specific and it is safe.",
      criteria: {
        seguir_rota: 'follow the route to the next waypoint and hold the profile',
        evitar: 'a threat drives this moment: avoid it',
        estabilizar: 'bring altitude or speed back to the profile',
        cumprir_ordem: "the commander's order drives this moment",
      },
    },
    manobra: {
      type: 'choice',
      instructions:
        CONTEXT_PILOT +
        'Choose the manoeuvre for the next moment. Priorities: first separation (never «conflito» when there is an alternative; «folgada» beats «marginal»); ' +
        'then the rule of the air («cumpre» or «neutra» before «incumpre»); then avoid cloud and terrain; then fly the route (rota «aproxima» beats «mantém» beats «afasta») ' +
        "and hold the altitude profile (altitude «corrige» beats «afasta»); honour the commander's orders; prefer smooth manoeuvres. " +
        'When two manoeuvres are equally good, keep the one in progress (voo.manobra_em_curso): a pilot does not flip the stick every moment.',
      criteria: Object.fromEntries(manobras.map((m) => [m, MANOEUVRE_EN[m]])),
    },
    potencia: {
      type: 'choice',
      instructions:
        CONTEXT_PILOT +
        'Choose the throttle for the next moment: more when speed is «lenta», or «cruzeiro» and «a abrandar», or a climb is needed; ' +
        'less when speed is «rápida», or «cruzeiro» and «a acelerar», or the commander asked to save fuel and the speed allows it; otherwise keep.',
      criteria: {
        mais: 'more power',
        manter: 'keep the throttle',
        menos: 'less power',
      },
    },
    // Uma escolha precisa de duas opções (o Gateway recusa uma só): com uma ameaça, é essa.
    ...(ameacas.length >= 2 ? {
      ameacaPrioritaria: {
        type: 'choice',
        instructions:
          CONTEXT_PILOT +
          "Which threat drives this moment's manoeuvre? The one whose cpa_se_manter is «conflito» or «marginal» with the shortest tempo_ate_cpa; on a tie, the converging one.",
        criteria: Object.fromEntries(ameacas.map((a) => [a.id, `${a.tipo} at ${a.posicao}, ${a.movimento}`])),
      },
    } : {}),
    urgencia: {
      type: 'score',
      instructions: CONTEXT_PILOT + 'Urgency of this moment: how soon the most critical threat arrives and how small the separation gets if nothing changes.',
      criteria: [
        'monitor: no threat in conflict',
        'act: conflict with a long time to CPA',
        'priority: conflict with a short time to CPA',
        'immediate: conflict with an immediate time to CPA',
      ],
    },
    foraDoEnvelope: {
      type: 'boolean',
      instructions:
        CONTEXT_PILOT +
        'Is this moment outside the envelope the candidate manoeuvres cover? True when no manoeuvre avoids the conflict, or every safe manoeuvre breaks the rule of the air, enters cloud or goes near terrain.',
      criteria: {
        true: 'outside the envelope — the supervisor or a human must take over',
        false: 'at least one safe and acceptable manoeuvre exists',
      },
    },
  };
}
