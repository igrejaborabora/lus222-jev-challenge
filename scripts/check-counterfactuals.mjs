import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PERFIL } from '../public/src/simulacao.js';
import { validarRespostas } from '../public/src/contrato-jev.js';

const base = process.argv[2] ?? 'http://localhost:43123';
const resultados = [];

for (const cenario of ['porto', 'medevac', 'carga', 'sar']) {
  const replay = JSON.parse(await readFile(new URL(`../public/replays/${cenario}.json`, import.meta.url)));
  if (replay.perfil !== PERFIL.versao) throw new Error(`${cenario}: perfil de replay desatualizado`);
  const incidente = cenario === 'porto' ? replay.percurso.find((e) => e.id === 'final_porto') : replay.percurso[0];
  const entrada = structuredClone(incidente.entrada);
  const variavel = cenario === 'porto' ? 'comprimento_pista_m' : 'relogio_s';
  const anterior = variavel === 'comprimento_pista_m' ? entrada.ambiente.comprimento_pista_m : entrada.missao.relogio_s;
  const novo = variavel === 'comprimento_pista_m' ? 520 : Math.max(120, Math.round(anterior / 2));
  if (variavel === 'comprimento_pista_m') {
    entrada.ambiente.comprimento_pista_m = novo;
    entrada.alternativas.find((d) => d.id === entrada.missao.destino).pista_m = novo;
  } else entrada.missao.relogio_s = novo;
  const response = await fetch(`${base}/api/jev`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ momento: 'incidente', estado: entrada }),
  });
  const nova = await response.json();
  if (!response.ok || nova.fonte !== 'jev') throw new Error(`${cenario}: ${nova.mensagem ?? nova.erro}`);
  const contrato = validarRespostas('incidente', nova.answers);
  if (!contrato.ok) throw new Error(`${cenario}: ${contrato.erro}`);
  resultados.push({
    cenario, evento: incidente.id, perfil: PERFIL.versao,
    variavel, anterior, novo,
    original: { entrada: incidente.entrada, resposta: incidente.resposta },
    contrafactual: { entrada, resposta: nova },
  });
  process.stdout.write(`${cenario}: ${incidente.resposta.answers.acaoMissao.choice} / ${incidente.resposta.answers.destinoPreferido.choice} → ${nova.answers.acaoMissao.choice} / ${nova.answers.destinoPreferido.choice}\n`);
}

await mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
await writeFile(new URL('../evidence/contrafactuais-2026-09-22.json', import.meta.url), `${JSON.stringify({ data: new Date().toISOString(), resultados }, null, 2)}\n`);
