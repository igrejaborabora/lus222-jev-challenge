import { writeFile } from 'node:fs/promises';
import { CENARIOS_SIM, PERFIL, criarMissao, avancarMissao, aplicarDecisao, proximoEvento, estadoParaAvaliacao } from '../public/src/simulacao.js';
import { validarRespostas } from '../public/src/contrato-jev.js';

const base = process.argv[2] ?? 'http://localhost:43124';

async function avaliar(momento, estado) {
  const response = await fetch(`${base}/api/jev`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ momento, estado }),
  });
  const data = await response.json();
  if (!response.ok || data.fonte !== 'jev') throw new Error(`${momento}: ${data.mensagem ?? data.erro}`);
  const contrato = validarRespostas(momento, data.answers);
  if (!contrato.ok) throw new Error(`${momento}: ${contrato.erro}`);
  return data;
}

for (const cenario of Object.keys(CENARIOS_SIM)) {
  const restricoes = { payload_kg: CENARIOS_SIM[cenario].payloadKg, risco_maximo: 'medio', preferir_stol: false, nunca_desviar: false };
  const gravacao = { versao: 3, cenario, perfil: PERFIL.versao, semente: 222, restricoes, gravadoEm: new Date().toISOString(), briefing: null, eventos: {}, percurso: [], resultado: null };
  let missao = criarMissao(cenario, gravacao.semente, restricoes);
  gravacao.briefing = await avaliar('briefing', estadoParaAvaliacao(missao));
  for (let i = 0; i < 3000 && !missao.resultado; i++) {
    const evento = proximoEvento(missao);
    if (evento) {
      const entrada = estadoParaAvaliacao(missao, evento);
      const resposta = await avaliar('incidente', entrada);
      const antes = { ...missao.voo, destino: missao.destinoId };
      const aplicada = aplicarDecisao(missao, resposta.answers);
      missao = aplicada.missao;
      gravacao.eventos[evento.id] = resposta;
      gravacao.percurso.push({ id: evento.id, entrada, antes, resposta, supervisor: aplicada.supervisor, depois: { ...missao.voo, destino: missao.destinoId } });
      process.stdout.write(`${cenario} / ${evento.id} / ${resposta.answers.acaoMissao.choice} / ${missao.destinoId}\n`);
    }
    missao = avancarMissao(missao, 1);
  }
  gravacao.resultado = { tipo: missao.resultado, tempoS: Math.round(missao.voo.tempoS), destino: missao.destinoId, fuelKg: Math.round(missao.voo.combustivelKg) };
  if (!gravacao.resultado.tipo) throw new Error(`${cenario}: missão não terminou`);
  await writeFile(new URL(`../public/replays/${cenario}.json`, import.meta.url), `${JSON.stringify(gravacao, null, 2)}\n`);
  process.stdout.write(`${cenario} / ${gravacao.resultado.tipo} / ${gravacao.resultado.tempoS}s\n`);
}
