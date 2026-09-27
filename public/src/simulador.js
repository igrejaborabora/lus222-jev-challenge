import { PERFIL_PROGRESSIVO, novosControlos, ALTURA_TREM_M } from './voo-progressivo.js';
import { ambienteMeteorologico } from './meteorologia.js';
import { novoTreino } from './treino.js';
import { PERFIL } from './simulacao.js';
import { novoPiloto } from './piloto-sim.js';

/**
 * Voo livre sobre o Porto na noite de São João: circuito de pontos de
 * passagem, director de ameaças e o piloto aos comandos — humano ou JEV.
 * Usa o mesmo motor das missões (avancarMissao, passo fixo de 0,1 s), com a
 * lei de comando do simulador. Coordenadas da missão Porto (costa a oeste).
 */
export const CIRCUITO_PORTO = Object.freeze([
  { id: 'foz', tipo: 'ponto', nome: 'Foz do Douro', xM: -6600, zM: 152000, pistaM: 0 },
  { id: 'ponte', tipo: 'ponto', nome: 'Ponte D. Luís I', xM: -2200, zM: 152700, pistaM: 0 },
  { id: 'aeroporto', tipo: 'aeroporto', nome: 'Aeroporto Francisco Sá Carneiro', xM: 0, zM: 165000, pistaM: 3480, superficie: 'pavimentada' },
  { id: 'matosinhos', tipo: 'ponto', nome: 'Matosinhos', xM: -6200, zM: 157800, pistaM: 0 },
]);

export const NOMES_CIRCUITO = Object.freeze(Object.fromEntries(CIRCUITO_PORTO.map((p) => [p.id, p.nome])));

export function criarVooLivre(semente = 222, { piloto = 'humano' } = {}) {
  const fuel = 600;
  const payload = 400;
  return {
    versao: 1,
    modo: 'livre',
    cenario: 'porto',
    semente: Number(semente) || 222,
    perfil: PERFIL.versao,
    fase: 'em_rota',
    resultado: null,
    destinos: CIRCUITO_PORTO.map((p) => ({ ...p })),
    pistas: CIRCUITO_PORTO.filter((p) => p.pistaM > 0).map((p) => ({ ...p })),
    circuito: CIRCUITO_PORTO.map((p) => p.id),
    destinoId: 'foz',
    voltas: 0,
    pontosPassados: [],
    ambiente: { ventoMs: { x: 5, z: -4 }, tetoFt: 2200, visKm: 12, luzDia: false },
    voo: {
      xM: -4200, zM: 141000, altitudeM: 480, velocidadeMs: 88, velocidadeVerticalMs: 0,
      rumoRad: -0.2, bankRad: 0, pitchRad: 0, combustivelKg: fuel, payloadKg: payload,
      massaKg: PERFIL.massaVaziaKg + fuel + payload, distanciaPercorridaM: 0, tempoS: 0, integridade: 100,
      acelerador: 0.55, potencia: 0.55, modoVertical: 'manter', altitudeAlvoM: 480,
    },
    piloto: novoPiloto(piloto),
    diretor: { proximoS: 12, lancadas: 0, ultima: null },
    ameacas: [],
    proximaAmeaca: 1,
    separacoes: [],
    missao: { almas: 2, tempoLimiteS: 2800, prioridade: 'integridade' },
    restricoes: { nunca_desviar: false, preferir_stol: false, risco_maximo: 'medio', pic_disponivel: true },
    eventosPendentes: [],
    eventosTratados: [],
    comando: { acao: 'prosseguir', vertical: 'manter', lateral: 'manter', urgencia: 1, evasaoAteS: 0 },
    orbitaRestanteS: 0,
    ameacaAtiva: null,
    passo: 0,
    acumuladorS: 0,
    vooAnterior: null,
  };
}

/** Sessão interactiva nova; o construtor anterior fica intacto para replays históricos. */
export function criarVooProgressivo(semente = 222, { exercicio = 'livre', tempo = 'poucas_nuvens', ambiente = {} } = {}) {
  const m = criarVooLivre(semente);
  const controlos = { ...novosControlos(), modo:'avancado', protecao:false };
  let voo = { ...m.voo, xM: -4300, zM: 151500, rumoRad: 1.2, flaps: 0, emSolo: false, contacto: null };
  const treino = novoTreino(exercicio);
  if (exercicio === 'solo') {
    voo = { ...voo, xM: 0, zM: 163400, rumoRad: 0, altitudeM: 2 + ALTURA_TREM_M, altitudeAlvoM: null, velocidadeMs: 0, emSolo: true, acelerador: 0, potencia: 0, flaps: 0.35 };
    Object.assign(controlos, { flaps: 0.35, acelerador: 0, travao: 1, luzesAterragem: true });
  } else if (exercicio === 'aproximacao') {
    voo = { ...voo, xM: 0, zM: 159900, rumoRad: 0, altitudeM: 195, altitudeAlvoM: 195, velocidadeMs: 64, acelerador: 0.5, potencia: 0.5, flaps: 0.65 };
    Object.assign(controlos, { flaps: 0.65, luzesAterragem: true });
  }
  return { ...m, perfil: PERFIL_PROGRESSIVO, controlos, treino, voo,
    ambiente: ambienteMeteorologico(tempo, ambiente),
    pistas: m.pistas.map((p) => ({ ...p, raioPlanoM: 2000 })),
    diretor: treino ? null : m.diretor, circuito: treino ? null : m.circuito,
    destinoId: exercicio === 'solo' || exercicio === 'aproximacao' ? 'aeroporto' : m.destinoId,
    fase: voo.emSolo ? 'solo' : 'em_rota',
  };
}
