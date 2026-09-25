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

function validarDistribuicao(probabilities, dominio) {
  if (probabilities == null) return true;
  if (typeof probabilities !== 'object' || Array.isArray(probabilities)) return false;
  const entries = Object.entries(probabilities);
  if (!entries.length) return false;
  if (entries.some(([opcao, p]) => !dominio.includes(opcao) || typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1)) return false;
  return Math.abs(entries.reduce((soma, [, p]) => soma + p, 0) - 1) <= 0.05;
}

export function validarRespostas(momento, answers) {
  const contrato = momento === 'briefing' ? BRIEFING : INCIDENTE;
  if (!answers || typeof answers !== 'object') return { ok: false, erro: 'Respostas ausentes' };
  for (const [nome, [tipo, dominio]] of Object.entries(contrato)) {
    const a = answers[nome];
    if (!a || typeof a !== 'object') return { ok: false, erro: `${nome}: resposta ausente` };
    if (tipo === 'choice') {
      if (!dominio.includes(a.choice)) return { ok: false, erro: `${nome}: escolha inválida` };
      if (!validarDistribuicao(a.probabilities, dominio) || (a.probabilities && !(a.choice in a.probabilities))) return { ok: false, erro: `${nome}: probabilidades inválidas` };
    } else if (tipo === 'score') {
      if (typeof a.score !== 'number' || !Number.isFinite(a.score) || a.score < 0 || a.score > dominio) return { ok: false, erro: `${nome}: score inválido` };
      if (!validarDistribuicao(a.probabilities, Array.from({ length: dominio + 1 }, (_, i) => String(i)))) return { ok: false, erro: `${nome}: probabilidades inválidas` };
    } else if (typeof a.probability !== 'number' || !Number.isFinite(a.probability) || a.probability < 0 || a.probability > 1) {
      return { ok: false, erro: `${nome}: probabilidade inválida` };
    }
  }
  return { ok: true, erro: null };
}

/**
 * Contrato de perguntas com domínios dinâmicos (JEV piloto): cada resposta tem
 * de cair nas opções que a pergunta enviada tinha, com probabilidades válidas.
 */
export function validarRespostasDinamicas(answers, questions) {
  if (!answers || typeof answers !== 'object') return { ok: false, erro: 'Respostas ausentes' };
  for (const [nome, q] of Object.entries(questions ?? {})) {
    const a = answers[nome];
    if (!a || typeof a !== 'object') return { ok: false, erro: `${nome}: resposta ausente` };
    if (q.type === 'choice') {
      const dominio = Object.keys(q.criteria ?? {});
      if (!dominio.includes(a.choice)) return { ok: false, erro: `${nome}: escolha inválida` };
      if (!validarDistribuicao(a.probabilities, dominio)) return { ok: false, erro: `${nome}: probabilidades inválidas` };
    } else if (q.type === 'score') {
      const max = (q.criteria?.length ?? 2) - 1;
      if (typeof a.score !== 'number' || !Number.isFinite(a.score) || a.score < 0 || a.score > max) return { ok: false, erro: `${nome}: score inválido` };
      if (!validarDistribuicao(a.probabilities, Array.from({ length: max + 1 }, (_, i) => String(i)))) return { ok: false, erro: `${nome}: probabilidades inválidas` };
    } else if (typeof a.probability !== 'number' || !Number.isFinite(a.probability) || a.probability < 0 || a.probability > 1) {
      return { ok: false, erro: `${nome}: probabilidade inválida` };
    }
  }
  return { ok: true, erro: null };
}

