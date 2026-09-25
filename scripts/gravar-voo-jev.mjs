/**
 * Grava um voo livre do JEV aos comandos do simulador, com respostas reais do
 * /api/jev (momento piloto), para quem abre o site sem voo ao vivo.
 *
 *   node scripts/gravar-voo-jev.mjs [url-base] [semente] [segundos]
 *   (por omissão http://localhost:43200, semente 222, 240 s)
 *
 * Cada decisão guarda o passo em que foi pedida, o passo em que foi aplicada
 * (com a latência medida) e a resposta; a reprodução refaz tudo o resto.
 * ~2,5 pedidos por segundo de voo, ~0,02 USD por minuto.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { gravarVoo } from '../public/src/voo-gravado.js';
import { POTENCIAS } from '../public/src/piloto-sim.js';

const base = process.argv[2] ?? 'http://localhost:43200';
const semente = Number(process.argv[3] ?? 222);
const duracaoS = Number(process.argv[4] ?? 240);

async function perguntar(estado) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch(`${base}/api/jev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ momento: 'piloto', estado }) });
    const d = await r.json().catch(() => ({}));
    const valida = r.ok && d.fonte === 'jev' && estado.manobras[d.answers?.manobra?.choice] && POTENCIAS.includes(d.answers?.potencia?.choice);
    if (valida) return d;
    process.stdout.write(`  pedido sem resposta válida (${r.status} ${d.erro ?? ''}); nova tentativa\n`);
  }
  throw new Error('O JEV não respondeu três vezes seguidas.');
}

let ultimoSegundo = -1;
const gravacao = await gravarVoo({
  semente,
  duracaoS,
  perguntar,
  aoPasso: (m, d) => {
    const s = Math.floor(m.voo.tempoS / 10) * 10;
    if (s !== ultimoSegundo) {
      ultimoSegundo = s;
      process.stdout.write(`${String(Math.round(m.voo.tempoS)).padStart(4)} s · ${d.r.manobra.choice.padEnd(14)} · ameaças ${m.ameacas.length} · passadas ${m.separacoes.length} · ${d.ms} ms\n`);
    }
  },
});

const saida = { ...gravacao, gravadoEm: new Date().toISOString(), modelo: 'typesafe-ai/jev', cenario: 'Porto, noite de São João' };
await mkdir(new URL('../public/voos/', import.meta.url), { recursive: true });
const destino = new URL(`../public/voos/porto-sao-joao-${semente}.json`, import.meta.url);
await writeFile(destino, `${JSON.stringify(saida)}\n`);
const tokens = gravacao.decisoes.reduce((s, d) => s + d.tok, 0);
console.log(`\n${gravacao.decisoes.length} decisões em ${gravacao.duracaoS} s · resultado ${gravacao.resultado ?? 'em voo'} · ${tokens} tokens ≈ ${(tokens * 0.042e-6).toFixed(4)} USD\nGravado em ${destino.pathname}`);
