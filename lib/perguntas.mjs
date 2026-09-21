const CONTEXTO =
  'És a camada de decisão tipada do JEV a bordo de um LUS-222 (STOL bimotor português, CEiiA/EEA Aircraft). ' +
  'Não és um piloto de stick e não geras prosa. Avalias o estado partilhado e escolhes acções de comandante de missão. ' +
  'Isto não é Detect-and-Avoid certificável: a separação mínima continua fora deste modelo. ' +
  'Pondera combustível, payload, almas, relógio clínico, meteorologia, pista, restrições do comandante e geometria. ' +
  'Automatiza o caso claro; se a situação for ambígua, pede revisão do PIC.';

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
      desviar_alternativo: 'o destino ou o corredor já não servem — ir a STOL, hospital ou alternativa',
      orbitar: 'comprar tempo: luz, contacto visual, PIC, ou meteorologia a mudar',
      regressar_base: 'voltar à origem — sobrecarga, fuel ou missão inviável em avançar',
      abortar_emergencia: 'terminar o voo já — integridade crítica ou emergência de missão',
    },
  },
  destinoPreferido: {
    type: 'choice',
    instructions:
      'Para onde deve ir o LUS-222 se a acção não for simplesmente prosseguir no plano? ' +
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
      'Urgência da decisão de missão (não de evasão de pixel). Olha o relógio MEDEVAC, a luz, a integridade e o incidente.',
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
      'O JEV deve bloquear a automação e pedir revisão ao piloto em comando? ' +
      'Pede revisão quando a probabilidade da melhor acção for baixa, quando vidas vs integridade colidem, ' +
      'quando o contacto visual é incerto, ou quando as restrições do comandante contradizem a acção óbvia. ' +
      'Não peças revisão num caso geométrico óbvio com céu livre e aeronave sã.',
    criteria: {
      true: 'incerto ou conflituoso — o PIC tem de ver isto',
      false: 'caso claro — o JEV pode automatizar a acção',
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
