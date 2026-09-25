import {
  etiquetarAcao,
  etiquetarDestino,
  etiquetarManobraL,
  etiquetarManobraV,
  etiquetarRiscoMeteo,
  etiquetarUrgencia,
} from './decisao.js';

/** Nome curto de cada pergunta tipada, no painel e no debrief. */
export const ROTULOS_PERGUNTAS = Object.freeze({
  configuracaoCabine: 'Cabine',
  prioridadeOperacional: 'Prioridade',
  pistaAdequada: 'Pista adequada',
  combustivelSuficiente: 'Combustível suficiente',
  acaoMissao: 'Acção de missão',
  manobraVertical: 'Vertical',
  manobraLateral: 'Lateral',
  destinoPreferido: 'Destino se mudar rota',
  urgencia: 'Urgência',
  riscoMeteorologico: 'Risco meteorológico',
  precisaRevisaoPIC: 'Fora do envelope',
  continuarVoo: 'Continuar voo',
  plano: 'Plano',
  manobra: 'Manobra',
  potencia: 'Potência',
  ameacaPrioritaria: 'Ameaça prioritária',
  foraDoEnvelope: 'Fora do envelope',
  manobraTactica: 'Manobra',
});

const MANOBRAS = { manter: 'Manter', esquerda: 'Esquerda', direita: 'Direita', subir: 'Subir', descer: 'Descer', esquerda_subir: 'Esquerda + subir', direita_subir: 'Direita + subir' };
const PLANOS = { seguir_rota: 'Seguir rota', evitar: 'Evitar', estabilizar: 'Estabilizar', cumprir_ordem: 'Cumprir ordem' };
const POTENCIAS = { mais: 'Mais', manter: 'Manter', menos: 'Menos' };

const ETIQUETAS_OPCAO = {
  acaoMissao: etiquetarAcao,
  manobraVertical: etiquetarManobraV,
  manobraLateral: etiquetarManobraL,
  destinoPreferido: etiquetarDestino,
  urgencia: (nivel) => etiquetarUrgencia(Number(nivel)),
  riscoMeteorologico: (nivel) => etiquetarRiscoMeteo(Number(nivel)),
  manobra: (m) => MANOBRAS[m] ?? m,
  manobraTactica: (m) => MANOBRAS[m] ?? m,
  plano: (p) => PLANOS[p] ?? p,
  potencia: (p) => POTENCIAS[p] ?? p,
};

/** «0,97»: probabilidades e confianças com vírgula, duas casas. */
export function decimal(valor) {
  return Number.isFinite(Number(valor)) ? Number(valor).toFixed(2).replace('.', ',') : '—';
}

export function etiquetaOpcao(chave, opcao) {
  const etiquetar = ETIQUETAS_OPCAO[chave];
  if (etiquetar) return etiquetar(opcao);
  const texto = String(opcao ?? '—').replaceAll('_', ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function distribuicaoDe(chave, probabilities, escolhida) {
  if (!probabilities || typeof probabilities !== 'object') return [];
  // Pela ordem em que o JEV a devolveu: a barra não salta quando a escolha muda.
  return Object.entries(probabilities)
    .map(([opcao, p]) => ({ opcao, rotulo: etiquetaOpcao(chave, opcao), p: Number(p), escolhida: opcao === String(escolhida) }))
    .filter((d) => Number.isFinite(d.p));
}

/**
 * Uma linha por pergunta: a escolha, a distribuição inteira e a confiança.
 * A confiança só existe em choice e score e mede a concentração da
 * distribuição; não é a probabilidade da opção escolhida.
 */
export function linhasPainel(answers, confidence = null) {
  return Object.entries(answers ?? {}).map(([chave, a]) => {
    const rotulo = ROTULOS_PERGUNTAS[chave] ?? chave;
    const c = Number(confidence?.[chave]);
    const confianca = Number.isFinite(c) ? c : null;
    if (typeof a?.choice === 'string') {
      const distribuicao = distribuicaoDe(chave, a.probabilities, a.choice);
      const p = distribuicao.find((d) => d.escolhida)?.p ?? null;
      return { chave, rotulo, tipo: 'choice', escolha: etiquetaOpcao(chave, a.choice), p, confianca, distribuicao };
    }
    if (Number.isFinite(Number(a?.score))) {
      const score = Number(a.score);
      const nivel = Math.round(score);
      const distribuicao = distribuicaoDe(chave, a.probabilities, nivel);
      const maximo = distribuicao.length > 1 ? distribuicao.length - 1 : 3;
      return { chave, rotulo, tipo: 'score', escolha: `${etiquetaOpcao(chave, nivel)} · ${decimal(score)}/${maximo}`, p: null, confianca, distribuicao };
    }
    if (Number.isFinite(Number(a?.probability))) {
      const p = Number(a.probability);
      const sim = p >= 0.5;
      // A probabilidade ao lado da escolha é a da resposta escolhida: «Não 0,59», nunca «Não 0,41».
      return {
        chave, rotulo, tipo: 'boolean', escolha: sim ? 'Sim' : 'Não', p: sim ? p : 1 - p, confianca: null,
        distribuicao: [
          { opcao: 'true', rotulo: 'Sim', p, escolhida: sim },
          { opcao: 'false', rotulo: 'Não', p: 1 - p, escolhida: !sim },
        ],
      };
    }
    return { chave, rotulo, tipo: 'desconhecido', escolha: '—', p: null, confianca, distribuicao: [] };
  });
}

function milhares(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',').replace(/,0$/, '')} mil` : String(n);
}

/** «8 perguntas em paralelo · 412 ms · 3,1 mil tokens» — o que custou esta resposta. */
export function resumoCabecalho(resposta, { replay = false } = {}) {
  const n = Object.keys(resposta?.answers ?? {}).length;
  const partes = [`${n} ${n === 1 ? 'pergunta' : 'perguntas em paralelo'}`];
  const ms = Number(resposta?.latencia_ms);
  if (Number.isFinite(ms)) partes.push(`${Math.round(ms)} ms${replay ? ' gravados' : ''}`);
  const u = resposta?.usage;
  const tokens = Number(u?.totalTokens ?? (Number(u?.inputTokens) + Number(u?.outputTokens)));
  if (Number.isFinite(tokens) && tokens > 0) partes.push(`${milhares(Math.round(tokens))} tokens`);
  return partes.join(' · ');
}

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto != null) e.textContent = String(texto);
  return e;
}

function linhaDom(l) {
  const row = el('div', 'typed-row');
  const cabeca = el('div', 'typed-head');
  cabeca.append(el('span', 'typed-name', l.rotulo), el('b', 'typed-choice', l.p == null ? l.escolha : `${l.escolha} ${decimal(l.p)}`));
  if (l.confianca != null) cabeca.append(el('span', 'conf-chip', `conf ${decimal(l.confianca)}`));
  row.append(cabeca);
  if (l.distribuicao.length > 1) {
    const legenda = l.distribuicao.map((d) => `${d.rotulo} ${decimal(d.p)}`).join(' · ');
    const barra = el('div', 'typed-dist');
    barra.setAttribute('role', 'img');
    barra.setAttribute('aria-label', `${l.rotulo}: ${legenda}`);
    for (const d of l.distribuicao) {
      const seg = el('span', d.escolhida ? 'typed-seg is-on' : 'typed-seg');
      seg.style.width = `${Math.max(0, Math.min(1, d.p)) * 100}%`;
      seg.title = `${d.rotulo} ${decimal(d.p)}`;
      barra.append(seg);
    }
    row.append(barra);
    // Só as opções com peso: a legenda completa está no aria-label e no title.
    const visiveis = l.distribuicao.filter((d) => d.p >= 0.03).slice(0, 4);
    row.append(el('div', 'typed-legend', visiveis.map((d) => `${d.rotulo} ${decimal(d.p)}`).join(' · ')));
  }
  return row;
}

/** Cabeçalho e uma linha por pergunta, com a distribuição completa sempre à vista. */
export function pintarPainel(meta, host, resposta, opcoes = {}) {
  if (meta) meta.textContent = resumoCabecalho(resposta, opcoes);
  host.replaceChildren(...linhasPainel(resposta?.answers, resposta?.confidence).map(linhaDom));
}

/** Uma só pergunta, por exemplo a acção de missão quando o JEV pede o PIC. */
export function pintarPergunta(host, resposta, chave) {
  const answers = resposta?.answers?.[chave] ? { [chave]: resposta.answers[chave] } : {};
  host.replaceChildren(...linhasPainel(answers, resposta?.confidence).map(linhaDom));
}

/**
 * Como pintarPainel, mas reaproveita as linhas: as larguras mudam e a
 * transição CSS anima as barras a cada resposta (o JEV piloto responde ~3 vezes
 * por segundo). Uma linha cujas opções mudaram é refeita.
 */
export function actualizarPainel(meta, host, resposta, opcoes = {}) {
  if (meta) meta.textContent = resumoCabecalho(resposta, opcoes);
  const linhas = linhasPainel(resposta?.answers, resposta?.confidence);
  const vivas = new Set(linhas.map((l) => l.chave));
  for (const row of [...host.children]) if (!vivas.has(row.dataset.chave)) row.remove();
  linhas.forEach((l, i) => {
    const existente = [...host.children].find((r) => r.dataset.chave === l.chave);
    const opcoesIguais = existente && existente.dataset.opcoes === l.distribuicao.map((d) => d.opcao).join('|');
    if (!opcoesIguais) {
      const nova = linhaDom(l);
      nova.dataset.chave = l.chave;
      nova.dataset.opcoes = l.distribuicao.map((d) => d.opcao).join('|');
      if (existente) existente.replaceWith(nova);
      else host.insertBefore(nova, host.children[i] ?? null);
      return;
    }
    existente.querySelector('.typed-choice').textContent = l.p == null ? l.escolha : `${l.escolha} ${decimal(l.p)}`;
    const chip = existente.querySelector('.conf-chip');
    if (chip) chip.textContent = l.confianca == null ? '' : `conf ${decimal(l.confianca)}`;
    const segs = existente.querySelectorAll('.typed-seg');
    l.distribuicao.forEach((d, k) => {
      const seg = segs[k];
      if (!seg) return;
      seg.style.width = `${Math.max(0, Math.min(1, d.p)) * 100}%`;
      seg.classList.toggle('is-on', d.escolhida);
      seg.title = `${d.rotulo} ${decimal(d.p)}`;
    });
    const legenda = existente.querySelector('.typed-legend');
    if (legenda) legenda.textContent = l.distribuicao.filter((d) => d.p >= 0.03).slice(0, 4).map((d) => `${d.rotulo} ${decimal(d.p)}`).join(' · ');
  });
}

