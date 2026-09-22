const CONTEXTO =
  'És a camada de decisão tipada do JEV a bordo de um LUS-222 (STOL bimotor português, CEiiA/EEA Aircraft). ' +
  'Não és um piloto de stick e não geras prosa. Avalias o estado partilhado e escolhes acções de missão e eixos de evasão. ' +
  'Aplicas a acção e os eixos de imediato — o LUS-222 desvia sozinho. Nunca esperas Accept/Reject do PIC. ' +
  'Isto não é Detect-and-Avoid certificável: a separação mínima continua fora deste modelo. ' +
  'Pondera combustível, payload, almas, relógio clínico, meteorologia, pista, voo actual, alternativas calculadas, restrições do comandante e geometria. ' +
  'A revisão do PIC é só um registo para o debriefing.';

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
      'Se o comandante marcou nunca_desviar, só desvies ou abortes quando a integridade ou as almas o exigirem.',
    criteria: {
      prosseguir: 'o plano aguenta — céu, fuel, pista e relógio permitem continuar',
      desviar_alternativo: 'o destino, o corredor ou um obstáculo já não servem — desviar já',
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
      'Vira para o lado com mais folga. Se o obstáculo está à esquerda, vai à direita.',
    criteria: {
      esquerda: 'melhor folga à esquerda, ou o obstáculo ocupa a direita / o eixo',
      direita: 'melhor folga à direita, ou o obstáculo ocupa a esquerda / o eixo',
      manter: 'sem ameaça lateral — rumo actual, órbita ou regresso tratam o resto',
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
      'Anota se um PIC humano deveria rever isto no debriefing. Nunca bloqueies o voo. ' +
      'Marca verdadeiro quando a probabilidade da melhor acção for baixa, quando vidas vs integridade colidem, ' +
      'quando o contacto visual é incerto, ou quando as restrições do comandante contradizem a acção. ' +
      'O JEV aplica na mesma a evasão e a acção de missão.',
    criteria: {
      true: 'incerto ou conflituoso — fica no log; o JEV já actuou',
      false: 'caso claro — só o registo da acção',
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

export function perguntasPara(momento) {
  return momento === 'briefing' ? PERGUNTAS_BRIEFING : PERGUNTAS_INCIDENTE;
}
