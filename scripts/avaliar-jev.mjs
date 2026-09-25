/**
 * Banco de casos do JEV: casos estratégicos (os 15 eventos gravados, com as
 * acções aceites da rubrica, e 4 contrafactuais de resposta clara) e casos
 * tácticos rotulados (casos-tatico.mjs). Cada caso corre com as instruções em
 * português e em inglês; o estado é o mesmo. Mede acerto, massa de
 * probabilidade nas respostas aceites, Brier, calibração por faixa de
 * confiança, latência e tokens, e grava tudo em evidence/.
 *
 *   node --env-file=.env scripts/avaliar-jev.mjs
 *
 * Faz ~66 pedidos ao Gateway (a 0,042 USD por milhão de tokens de entrada,
 * cerca de 0,01 USD). A chave nunca é impressa.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { experimental_evaluate as evaluate } from 'ai';
import { estadoParaJev, MODELO_JEV } from '../lib/decisao.mjs';
import { PERGUNTAS_INCIDENTE, perguntasTatico } from '../lib/perguntas.mjs';
import { PERGUNTAS_INCIDENTE_EN, perguntasTaticoEn } from '../lib/perguntas-en.mjs';
import { pontuar, resumir } from '../lib/avaliacao-jev.mjs';
import { acoesAceites } from '../public/src/avaliacao-sim.js';
import { CASOS_TATICO } from './casos-tatico.mjs';

if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  console.error('Falta AI_GATEWAY_API_KEY: corre com node --env-file=.env scripts/avaliar-jev.mjs');
  process.exit(1);
}

const CENARIOS = ['porto', 'medevac', 'carga', 'sar'];

/** Contrafactuais com resposta clara, sobre a entrada gravada de um evento. */
const CONTRAFACTUAIS = [
  {
    id: 'porto/final_porto+pista_520', base: ['porto', 'final_porto'], aceites: ['desviar_alternativo', 'regressar_base'],
    nota: 'A pista do destino passa a 520 m, abaixo da necessária: prosseguir deixa de ser viável.',
    mudar(e) {
      e.ambiente.comprimento_pista_m = 520;
      const d = e.alternativas.find((a) => a.id === 'planeado');
      if (d) d.pista_m = 520;
    },
  },
  {
    id: 'medevac/relogio+240s', base: ['medevac', 'relogio'], aceites: ['desviar_alternativo'],
    nota: 'Restam 4 minutos de janela clínica; o hospital alternativo é o mais próximo.',
    mudar(e) { e.missao.relogio_s = 240; },
  },
  {
    id: 'carga/massa+integridade_30', base: ['carga', 'massa'], aceites: ['abortar_emergencia', 'regressar_base'],
    nota: 'Integridade da aeronave a 30 %.',
    mudar(e) { e.aeronave.integridade = 30; },
  },
  {
    id: 'porto/baloes+nunca_desviar', base: ['porto', 'baloes'], aceites: ['prosseguir', 'orbitar'],
    nota: 'O comandante proibiu desvios; os balões resolvem-se com a manobra.',
    mudar(e) { e.restricoes.nunca_desviar = true; },
  },
];

async function casosEstrategicos() {
  const replays = Object.fromEntries(await Promise.all(CENARIOS.map(async (id) => [
    id, JSON.parse(await readFile(new URL(`../public/replays/${id}.json`, import.meta.url))),
  ])));
  const gravados = CENARIOS.flatMap((cenario) => replays[cenario].percurso.map((p) => ({
    id: `${cenario}/${p.id}`,
    tipo: 'estrategico',
    nota: 'Evento gravado; acções aceites da rubrica do debrief.',
    aceites: acoesAceites(cenario, p.id),
    estado: estadoParaJev(p.entrada),
  })));
  const contrafactuais = CONTRAFACTUAIS.map((c) => {
    const entrada = structuredClone(replays[c.base[0]].percurso.find((p) => p.id === c.base[1]).entrada);
    c.mudar(entrada);
    return { id: c.id, tipo: 'estrategico', nota: c.nota, aceites: c.aceites, estado: estadoParaJev(entrada) };
  });
  return [...gravados, ...contrafactuais].filter((c) => c.aceites.length);
}

function variantes(caso) {
  if (caso.tipo === 'estrategico') {
    return { pt: PERGUNTAS_INCIDENTE, en: PERGUNTAS_INCIDENTE_EN, chave: 'acaoMissao' };
  }
  return { pt: perguntasTatico(caso.estado), en: perguntasTaticoEn(caso.estado), chave: 'manobraTactica' };
}

async function perguntar(estado, questions) {
  const inicio = Date.now();
  const r = await evaluate({ model: MODELO_JEV, state: estado, questions, maxRetries: 1, abortSignal: AbortSignal.timeout(15_000) });
  return {
    answers: r.answers,
    confidence: r.providerMetadata?.typesafe?.confidence ?? null,
    latencia_ms: Date.now() - inicio,
    tokens: Number(r.usage?.totalTokens ?? 0),
  };
}

const casos = [
  ...(await casosEstrategicos()),
  ...CASOS_TATICO.map((c) => ({ id: `tatico/${c.id}`, tipo: 'tatico', nota: c.nota, aceites: c.aceites, estado: c.estado })),
];

const resultados = [];
for (const caso of casos) {
  const v = variantes(caso);
  // PT e EN seguidos para o mesmo caso: a latência de ambos vê a mesma rede.
  for (const idioma of ['pt', 'en']) {
    try {
      const r = await perguntar(caso.estado, v[idioma]);
      const p = pontuar(r.answers, r.confidence, v.chave, caso.aceites);
      resultados.push({ caso: caso.id, tipo: caso.tipo, idioma, ...p, latencia_ms: r.latencia_ms, tokens: r.tokens, probabilidades: r.answers?.[v.chave]?.probabilities ?? null, fora_envelope: r.answers?.foraDoEnvelope?.probability ?? r.answers?.precisaRevisaoPIC?.probability ?? null });
      process.stdout.write(`${caso.id.padEnd(34)} ${idioma}  ${String(p.escolha).padEnd(20)} ${p.acerto ? 'certo ' : 'ERRADO'}  massa ${p.massa.toFixed(2)}  conf ${p.confianca ?? '—'}  ${r.latencia_ms} ms\n`);
    } catch (erro) {
      resultados.push({ caso: caso.id, tipo: caso.tipo, idioma, erro: String(erro?.message ?? erro).slice(0, 200) });
      process.stdout.write(`${caso.id.padEnd(34)} ${idioma}  erro: ${String(erro?.message ?? erro).slice(0, 120)}\n`);
    }
  }
}

const validos = resultados.filter((r) => !r.erro);
const resumo = {};
for (const idioma of ['pt', 'en']) {
  resumo[idioma] = {
    total: resumir(validos.filter((r) => r.idioma === idioma)),
    estrategico: resumir(validos.filter((r) => r.idioma === idioma && r.tipo === 'estrategico')),
    tatico: resumir(validos.filter((r) => r.idioma === idioma && r.tipo === 'tatico')),
  };
}

const data = new Date().toISOString().slice(0, 10);
await mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
const destino = new URL(`../evidence/avaliacao-jev-${data}.json`, import.meta.url);
await writeFile(destino, `${JSON.stringify({
  versao: 1,
  gravadoEm: new Date().toISOString(),
  modelo: MODELO_JEV,
  descricao: 'Banco de casos: instruções em português e em inglês sobre o mesmo estado.',
  casos: casos.map(({ id, tipo, nota, aceites }) => ({ id, tipo, nota, aceites })),
  resultados,
  erros: resultados.filter((r) => r.erro).length,
  resumo,
}, null, 2)}\n`);

for (const idioma of ['pt', 'en']) {
  const { total, estrategico, tatico } = resumo[idioma];
  console.log(`\n${idioma.toUpperCase()}  acerto ${total.acertos}/${total.casos} (estratégico ${estrategico.acertos}/${estrategico.casos}, táctico ${tatico.acertos}/${tatico.casos})  massa ${total.massa_media}  Brier ${total.brier}  p50 ${total.latencia_p50_ms} ms  p95 ${total.latencia_p95_ms} ms  tokens ${total.tokens_medios}`);
  console.log(`    confiança ≥0,9: ${total.confianca.alta.acertos}/${total.confianca.alta.n} · 0,5–0,9: ${total.confianca.media.acertos}/${total.confianca.media.n} · <0,5: ${total.confianca.baixa.acertos}/${total.confianca.baixa.n}`);
}
console.log(`\nGravado em ${destino.pathname}`);
