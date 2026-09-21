export const CENARIOS = {
  medevac: {
    id: 'medevac',
    nome: 'MEDEVAC Açores',
    tese:
      'O JEV desvia do que vês e escolhe hospital, STOL ou órbita; a regra só vê céu livre.',
    paragrafo:
      'Um doente crítico na Terceira. Tecto baixo, pista curta não pavimentada, relógio clínico a correr. No corredor para o hospital o LUS-222 entra num canyon de torres e desvia.',
    origem: 'Lajes, Terceira',
    destino: 'Hospital de Ponta Delgada',
    defaults: {
      aeronave: {
        fuel_kg: 720,
        payload_kg: 380,
        config_cabine: 'medevac',
        tripulantes: 2,
        integridade: 100,
        alcance_restante_km: 520,
      },
      missao: {
        tipo: 'medevac',
        origem: 'Lajes, Terceira',
        destino: 'Hospital de Ponta Delgada',
        almas: 4,
        carga: '1 doente crítico + kit de evacuação',
        relogio_s: 2400,
        prioridade_comandante: 'tempo',
      },
      ambiente: {
        tecto_ft: 900,
        vis_km: 5,
        vento_kt: 18,
        superficie_pista: 'nao_pavimentada',
        comprimento_pista_m: 640,
        luz_dia: true,
      },
    },
  },
  carga: {
    id: 'carga',
    nome: 'Carga Ponte de Sor',
    tese:
      'O JEV recusa sobrecarga ou manda descarregar; a regra ignora a massa.',
    paragrafo:
      'Até 2700 kg pela rampa traseira, a partir da FAL em Ponte de Sor. À saída, um bando de aves cruza a rota. A geometria não pesa a aeronave.',
    origem: 'FAL Ponte de Sor',
    destino: 'Beja',
    defaults: {
      aeronave: {
        fuel_kg: 540,
        payload_kg: 2400,
        config_cabine: 'carga',
        tripulantes: 2,
        integridade: 100,
        alcance_restante_km: 310,
      },
      missao: {
        tipo: 'carga',
        origem: 'FAL Ponte de Sor',
        destino: 'Beja',
        almas: 2,
        carga: '2400 kg em paletes, rampa traseira',
        relogio_s: 0,
        prioridade_comandante: 'carga_critica',
      },
      ambiente: {
        tecto_ft: 3500,
        vis_km: 12,
        vento_kt: 22,
        superficie_pista: 'pavimentada',
        comprimento_pista_m: 1800,
        luz_dia: true,
      },
    },
  },
  sar: {
    id: 'sar',
    nome: 'SAR costa',
    tese:
      'O JEV escala ao PIC quando a probabilidade máxima é baixa; vidas contra integridade.',
    paragrafo:
      'Busca e salvamento ao largo, luz do dia a acabar, dois tripulantes. Bimotores e asa alta de época cruzam o sector. O contacto visual é incerto.',
    origem: 'Figueira da Foz',
    destino: 'Sector SAR oeste',
    defaults: {
      aeronave: {
        fuel_kg: 680,
        payload_kg: 220,
        config_cabine: 'mista',
        tripulantes: 2,
        integridade: 100,
        alcance_restante_km: 480,
      },
      missao: {
        tipo: 'sar',
        origem: 'Figueira da Foz',
        destino: 'Sector SAR oeste',
        almas: 2,
        carga: 'kit de salvamento e maca',
        relogio_s: 1500,
        prioridade_comandante: 'tempo',
      },
      ambiente: {
        tecto_ft: 1600,
        vis_km: 6,
        vento_kt: 16,
        superficie_pista: 'pavimentada',
        comprimento_pista_m: 1400,
        luz_dia: true,
      },
    },
  },
};

/** Ameaça visual de cada cenário — o que o comandante vê à frente do nariz. */
export const CENA_VISUAL = {
  medevac: 'canyon',
  carga: 'aves',
  sar: 'guerra',
};

export const LISTA_CENARIOS = ['medevac', 'carga', 'sar'].map((id) => CENARIOS[id]);

export function cenarioPorId(id) {
  return CENARIOS[id] ?? CENARIOS.medevac;
}
