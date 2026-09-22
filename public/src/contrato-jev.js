import { ACOES, MANOBRAS_V, MANOBRAS_L, DESTINOS, CABINES, PRIORIDADES } from './decisao.js';

const INCIDENTE = {
  acaoMissao: ['choice', ACOES],
  manobraVertical: ['choice', MANOBRAS_V],
  manobraLateral: ['choice', MANOBRAS_L],
  destinoPreferido: ['choice', DESTINOS],
  urgencia: ['score', 3],
  riscoMeteorologico: ['score', 3],
  precisaRevisaoPIC: ['boolean'],
  continuarVoo: ['boolean'],
};
const BRIEFING = {
  configuracaoCabine: ['choice', CABINES],
  prioridadeOperacional: ['choice', PRIORIDADES],
  pistaAdequada: ['boolean'],
  combustivelSuficiente: ['boolean'],
};

export function validarRespostas(momento, answers) {
  const contrato = momento === 'briefing' ? BRIEFING : INCIDENTE;
  if (!answers || typeof answers !== 'object') return { ok: false, erro: 'Respostas ausentes' };
  for (const [nome, [tipo, dominio]] of Object.entries(contrato)) {
    const a = answers[nome];
    if (!a || typeof a !== 'object') return { ok: false, erro: `${nome}: resposta ausente` };
    if (tipo === 'choice') {
      if (!dominio.includes(a.choice)) return { ok: false, erro: `${nome}: escolha inválida` };
      if (a.probabilities != null) {
        if (typeof a.probabilities !== 'object' || Array.isArray(a.probabilities)) return { ok: false, erro: `${nome}: probabilidades inválidas` };
        for (const [opcao, p] of Object.entries(a.probabilities)) {
          if (!dominio.includes(opcao) || typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) {
            return { ok: false, erro: `${nome}: probabilidades inválidas` };
          }
        }
      }
    } else if (tipo === 'score') {
      if (!Number.isInteger(a.score) || a.score < 0 || a.score > dominio) return { ok: false, erro: `${nome}: score inválido` };
    } else if (typeof a.probability !== 'number' || !Number.isFinite(a.probability) || a.probability < 0 || a.probability > 1) {
      return { ok: false, erro: `${nome}: probabilidade inválida` };
    }
  }
  return { ok: true, erro: null };
}
