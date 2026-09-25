import { avancarMissao } from './simulacao.js';
import { criarVooLivre } from './simulador.js';
import { estadoPiloto } from './estado-piloto.js';
import { actuacaoDeManobra, darOrdem, RETENCAO_JEV_S } from './piloto-sim.js';
import { PERFIL } from './simulacao.js';

/**
 * Voos do JEV gravados e reproduzidos passo a passo. A simulação é
 * determinística pelo número de passos (relógio fixo), pela semente (director)
 * e pelas decisões aplicadas; por isso basta gravar, para cada resposta do
 * JEV, o passo em que foi pedida, o passo em que foi aplicada e a resposta.
 * O estado que o JEV leu refaz-se ao reproduzir.
 *
 * O gravador emula o voo ao vivo: pede no passo k com a simulação parada,
 * mede a latência real e aplica no passo k + ⌈ms/100⌉; o pedido seguinte sai
 * três passos (330 ms) depois do anterior, como no ecrã.
 */
export const VERSAO_VOO = 1;
export const PASSOS_ENTRE_PEDIDOS = 3;

/** A ordem que uma resposta dá ao piloto, aplicada num dado tempo de simulação. */
export function ordemDaResposta(piloto, answers, tempoS) {
  return darOrdem(piloto, { ...actuacaoDeManobra(answers.manobra.choice), potencia: answers.potencia.choice, fonte: 'jev' }, tempoS, RETENCAO_JEV_S);
}

/** Avança exactamente até ao passo `passo` (sem o ultrapassar). */
function irAtePasso(m, passo) {
  let s = m;
  while (s.passo < passo && !s.resultado) s = avancarMissao(s, (passo - s.passo) * PERFIL.passoS + 1e-9, { ate: passo });
  return s;
}

/**
 * Grava um voo livre com o JEV aos comandos. `perguntar(estado)` devolve a
 * resposta do JEV ({ answers, confidence, latencia_ms, usage }); no script é
 * o /api/jev, nos testes uma função determinística.
 */
export async function gravarVoo({ semente = 222, duracaoS = 180, ordens = '', perguntar, aoPasso = null }) {
  let m = { ...criarVooLivre(semente), piloto: { ...criarVooLivre(semente).piloto, tipo: 'jev', fonte: 'jev' } };
  const decisoes = [];
  const passos = Math.round(duracaoS / PERFIL.passoS);
  while (m.passo < passos && !m.resultado) {
    const passoDespacho = m.passo;
    const estado = estadoPiloto(m, { ordens });
    const r = await perguntar(estado);
    const passoAplicacao = passoDespacho + Math.max(1, Math.ceil((Number(r.latencia_ms) || 300) / 100));
    m = irAtePasso(m, passoAplicacao);
    if (m.resultado) break;
    m = { ...m, piloto: ordemDaResposta(m.piloto, r.answers, m.voo.tempoS) };
    decisoes.push({ k: passoDespacho, a: passoAplicacao, r: r.answers, c: r.confidence ?? null, ms: Math.round(Number(r.latencia_ms) || 0), tok: Number(r.usage?.inputTokens) || 0 });
    aoPasso?.(m, decisoes.at(-1));
    m = irAtePasso(m, Math.max(passoAplicacao, passoDespacho + PASSOS_ENTRE_PEDIDOS));
  }
  return {
    versao: VERSAO_VOO,
    perfil: PERFIL.versao,
    modo: 'livre',
    semente,
    ordens,
    duracaoS: Math.round(m.voo.tempoS),
    resultado: m.resultado,
    decisoes,
  };
}

/**
 * Reprodução: avança `segundos` de simulação e pára nos passos gravados — no
 * de leitura (k), para o painel mostrar exactamente o estado que o JEV leu, e
 * no de aplicação (a), para lá aplicar a decisão. O cursor é { i, lido }.
 * Devolve a missão, o cursor e os eventos desta chamada.
 */
export function reproduzir(m, gravacao, cursor, segundos) {
  let s = m;
  let { i, lido } = cursor;
  let tempo = Math.max(0, segundos);
  const eventos = [];
  for (;;) {
    if (s.resultado) break;
    const d = gravacao.decisoes[i];
    const alvo = !d ? Infinity : lido ? d.a : d.k;
    s = avancarMissao(s, tempo, Number.isFinite(alvo) ? { ate: alvo } : {});
    // O tempo já entrou no acumulador: as voltas seguintes só o gastam.
    tempo = 0;
    if (!d || s.passo < alvo || s.resultado) break;
    if (!lido) {
      eventos.push({ tipo: 'leitura', decisao: d, estado: estadoPiloto(s, { ordens: gravacao.ordens }) });
      lido = true;
      continue;
    }
    s = { ...s, piloto: ordemDaResposta(s.piloto, d.r, s.voo.tempoS) };
    eventos.push({ tipo: 'aplicacao', decisao: d, voo: s.voo });
    i += 1;
    lido = false;
  }
  return { m: s, cursor: { i, lido }, eventos };
}

/** Começo da reprodução: o mesmo voo livre, com o JEV (gravado) aos comandos. */
export function iniciarReproducao(gravacao) {
  const m = criarVooLivre(gravacao.semente);
  return { ...m, piloto: { ...m.piloto, tipo: 'jev-gravado', fonte: 'jev' } };
}
