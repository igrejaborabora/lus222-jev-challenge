import { gerarPercurso, criarCena, actualizarCamara, redimensionar, DIFICULDADES, DISTANCIA_ALVO, CORREDOR } from './world.js';
import { novaRonda, passo, pilotar, pontuar, lerSensores } from './pilots.js';

const $ = (id) => document.getElementById(id);
const PASSO = 1 / 120;

const PILOTOS = [
  { id: 'humano', nome: 'HUMANO', cor: '#35d6a4' },
  { id: 'baseline', nome: 'BASELINE', cor: '#7aa7ff' },
  { id: 'jev', nome: 'JEV', cor: '#ffb547' },
];

const estado = {
  ecra: 'briefing',
  percurso: null,
  mundo: null,
  seed: 222,
  dificuldade: 'entrega',
  ritmo: 250,
  ordem: [],
  passo: 0,
  ronda: null,
  resultados: {},
  pausado: false,
  raf: 0,
  ultimo: 0,
  acumulador: 0,
};

// ---------------------------------------------------------------- ecrãs

function mostrarEcra(nome) {
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('is-active');
  $(`screen-${nome}`).classList.add('is-active');
  estado.ecra = nome;
  if (nome === 'flight') ajustarCanvas();
}

function ajustarCanvas() {
  if (!estado.mundo) return;
  const canvas = $('canvas');
  const largura = canvas.clientWidth || window.innerWidth;
  const altura = canvas.clientHeight || Math.round(largura * 9 / 16);
  redimensionar(estado.mundo, largura, altura);
}

addEventListener('resize', ajustarCanvas);

// ---------------------------------------------------------------- rondas

function arrancar() {
  estado.seed = Number($('input-seed').value) || 222;
  estado.dificuldade = $('select-dificuldade').value;
  estado.ritmo = Number($('select-ritmo').value);
  estado.percurso = gerarPercurso(estado.seed, estado.dificuldade);
  estado.resultados = {};
  estado.ordem = PILOTOS.map((p) => p.id);
  estado.passo = 0;

  if (estado.mundo) {
    estado.mundo.renderer.dispose();
    estado.mundo = null;
  }
  estado.mundo = criarCena($('canvas'), estado.percurso);

  iniciarRonda(estado.ordem[0]);
}

function iniciarRonda(pilotoId) {
  // repõe o estado dos portões para que a ronda seja idêntica para todos
  for (const p of estado.percurso.portoes) p.atingido = false;

  estado.ronda = novaRonda(estado.percurso, pilotoId, estado.seed + 11);
  estado.pausado = false;
  estado.ultimo = performance.now();
  estado.acumulador = 0;

  const info = PILOTOS.find((p) => p.id === pilotoId);
  $('hud-piloto-nome').textContent = info.nome;
  $('hud-piloto-nome').style.color = info.cor;
  $('painel-decisao').hidden = pilotoId === 'humano';
  $('painel-titulo').textContent = pilotoId === 'jev' ? 'typesafe-ai/jev' : 'baseline geométrico';
  $('dica-controlos').hidden = pilotoId !== 'humano';
  $('overlay').hidden = true;

  mostrarEcra('flight');
  cancelAnimationFrame(estado.raf);
  estado.raf = requestAnimationFrame(ciclo);
}

function ciclo(agora) {
  const r = estado.ronda;
  if (!r) return;

  if (!estado.pausado) {
    let dt = (agora - estado.ultimo) / 1000;
    if (dt > 0.25) dt = 0.25;
    estado.acumulador += dt;

    pilotar(r, agora, estado.ritmo);

    while (estado.acumulador >= PASSO) {
      passo(r, PASSO);
      estado.acumulador -= PASSO;
      if (r.terminada) break;
    }
    actualizarCamara(estado.mundo, { x: r.x, y: r.y, s: r.s, vx: r.vx, vy: r.vy }, dt);
  }
  estado.ultimo = agora;

  estado.mundo.renderer.render(estado.mundo.scene, estado.mundo.camera);
  actualizarHud(r);

  if (r.terminada) { terminarRonda(r); return; }
  estado.raf = requestAnimationFrame(ciclo);
}

function terminarRonda(r) {
  estado.resultados[r.piloto] = pontuar(r);
  estado.passo++;

  if (estado.passo >= estado.ordem.length) { mostrarResultados(); return; }

  const seguinte = estado.ordem[estado.passo];
  const info = PILOTOS.find((p) => p.id === seguinte);
  const res = estado.resultados[r.piloto];

  $('overlay').hidden = false;
  $('overlay-title').textContent = {
    entregue: 'Carga entregue',
    abortada: 'Missão abortada',
    perdida: 'Aeronave perdida',
  }[res.desfecho] ?? 'Ronda concluída';
  $('overlay-text').innerHTML =
    `<strong>${PILOTOS.find((p) => p.id === r.piloto).nome}</strong>: ${res.distancia} m, ` +
    `${res.portoes} portões limpos, ${res.embates} embate(s), integridade ${res.integridade}%.` +
    `<br><br>A seguir, o mesmo corredor voado por <strong>${info.nome}</strong>.`;
  $('overlay-btn').textContent = `Lançar a ronda ${info.nome}`;
  $('overlay-btn').onclick = () => iniciarRonda(seguinte);
}

// ---------------------------------------------------------------- HUD

function actualizarHud(r) {
  $('hud-dist').textContent = Math.round(r.s);
  $('hud-portoes').textContent = r.portoesLimpos;
  $('hud-integridade').textContent = `${Math.round(r.integridade)}%`;
  $('hud-integridade').classList.toggle('baixo', r.integridade <= 40);
  $('hud-altitude').textContent = `${Math.round(r.y)} m`;

  const barra = $('barra-progresso');
  if (barra) barra.style.width = `${(r.s / DISTANCIA_ALVO) * 100}%`;

  if (r.piloto === 'humano') return;

  const a = r.jev.ultima?.answers;
  if (a && !a.manobraVertical) return;
  $('painel-latencia').textContent = r.piloto === 'baseline'
    ? 'local'
    : (r.jev.ultima?.latencia_ms != null ? `${r.jev.ultima.latencia_ms} ms` : '—');
  if (!a) return;

  const barras = (probs, chaves) => chaves.map((k) => {
    const v = Math.min(1, Math.max(0, Number(probs?.[k] ?? 0)));
    return `<div class="bar-row"><span class="bar-name">${k}</span>` +
      `<span class="bar-track"><span class="bar-fill" style="width:${(v * 100).toFixed(0)}%"></span></span>` +
      `<span class="bar-val">${(v * 100).toFixed(0)}</span></div>`;
  }).join('');

  $('painel-manobra-v').textContent = a.manobraVertical.choice;
  $('painel-barras-v').innerHTML = barras(a.manobraVertical.probabilities, ['subir', 'manter', 'descer']);
  $('painel-manobra-l').textContent = a.manobraLateral.choice;
  $('painel-barras-l').innerHTML = barras(a.manobraLateral.probabilities, ['esquerda', 'manter', 'direita']);

  const urg = ['sem risco', 'vigiar', 'actuar já', 'emergência'];
  const s = Math.min(3, Math.max(0, Math.round(a.urgencia?.score ?? 0)));
  $('painel-urgencia').textContent = `${urg[s]} (${(a.urgencia?.score ?? 0).toFixed(2)})`;
  $('painel-colisao').textContent = `${((a.colisaoIminente?.probability ?? 0) * 100).toFixed(0)}%`;
  $('painel-abortar').textContent = `${((a.abortarMissao?.probability ?? 0) * 100).toFixed(0)}%`;
  $('painel-nota').textContent = r.jev.aviso || '';
}

// ---------------------------------------------------------------- resultados

function mostrarResultados() {
  const r = estado.resultados;
  const vencedor = PILOTOS
    .map((p) => ({ id: p.id, total: r[p.id]?.total ?? 0 }))
    .sort((a, b) => b.total - a.total)[0];

  $('tabela-resultados').innerHTML = PILOTOS.map((p) => {
    const d = r[p.id];
    if (!d) return '';
    const ganhou = p.id === vencedor.id;
    return `
      <div class="score-col${ganhou ? ' winner' : ''}">
        <h3 style="color:${p.cor}">${p.nome}</h3>
        <div class="score-total">${d.total.toLocaleString('pt-PT')}</div>
        <dl>
          <div><dt>Desfecho</dt><dd>${d.desfecho}</dd></div>
          <div><dt>Distância</dt><dd>${d.distancia.toLocaleString('pt-PT')} m</dd></div>
          <div><dt>Portões limpos</dt><dd>${d.portoes}</dd></div>
          <div><dt>Embates</dt><dd>${d.embates}</dd></div>
          <div><dt>Integridade</dt><dd>${d.integridade}%</dd></div>
          ${p.id === 'jev'
            ? `<div><dt>Avaliações</dt><dd>${d.chamadas}</dd></div>
               <div><dt>Latência mediana</dt><dd>${d.latencia != null ? d.latencia + ' ms' : '—'}</dd></div>`
            : p.id === 'baseline'
              ? `<div><dt>Decisões</dt><dd>${d.chamadas}, locais</dd></div>
                 <div><dt>Latência</dt><dd>0 ms</dd></div>`
              : `<div><dt>Energia de comando</dt><dd>${d.energia}</dd></div>`}
        </dl>
      </div>`;
  }).join('');

  $('verdict').innerHTML = escreverVeredicto(r);
  const empatados = PILOTOS.filter((p) => (r[p.id]?.total ?? -1) === vencedor.total);
  $('result-title').textContent = empatados.length > 1
    ? `Empate entre ${empatados.map((p) => p.nome).join(' e ')}`
    : `${PILOTOS.find((p) => p.id === vencedor.id).nome} com a melhor pontuação`;
  mostrarEcra('results');
}

/**
 * O veredicto diz o que os números mostram, incluindo quando o modelo perde.
 * Uma demo que só sabe ganhar não serve para falar com engenheiros.
 */
function escreverVeredicto(r) {
  const h = r.humano, b = r.baseline, j = r.jev;
  const linhas = [];

  if (j && b) {
    const dif = j.total - b.total;
    if (dif > 0) {
      linhas.push(`O Jev superou o baseline determinístico por <strong>${dif.toLocaleString('pt-PT')} pontos</strong>, com ${j.chamadas} avaliações e mediana de ${j.latencia ?? '—'} ms.`);
    } else if (dif < 0) {
      linhas.push(`O baseline determinístico superou o Jev por <strong>${Math.abs(dif).toLocaleString('pt-PT')} pontos</strong> — o esperado num problema puramente geométrico. O Jev decidiu ${j.chamadas} vezes, com mediana de ${j.latencia ?? '—'} ms.`);
    } else {
      linhas.push('Jev e baseline empataram.');
    }
  }
  if (h && j) {
    const dif = j.total - h.total;
    linhas.push(dif >= 0
      ? `Face ao piloto humano, o Jev ficou ${dif.toLocaleString('pt-PT')} pontos acima.`
      : `O piloto humano ficou ${Math.abs(dif).toLocaleString('pt-PT')} pontos acima do Jev.`);
  }

  linhas.push(
    'Como se comparou: ambos os decisores automáticos receberam as mesmas amostras de sensor, com o mesmo ruído e à mesma cadência. ' +
    'Num sistema real a regra determinística correria localmente a 60 Hz, com latência e custo nulos — uma vantagem que aqui lhe foi retirada de propósito para isolar o decisor.',
    'O que esta pista não mede: a evasão geométrica é exactamente o caso em que a regra determinística deve ganhar, e num sistema real é ela que tem de decidir a separação mínima. ' +
    'O valor do modelo aparece na decisão de <em>abortar</em>, que depende do contexto da missão, e na triagem em volume — cada resposta traz a probabilidade por opção, registável e reproduzível.',
  );

  if (j?.aviso) linhas.push(`<span class="aviso">${j.aviso}</span>`);
  return linhas.map((l) => `<p>${l}</p>`).join('');
}

function descarregarLog() {
  const payload = {
    gerado_em: new Date().toISOString(),
    semente: estado.seed,
    dificuldade: estado.dificuldade,
    ritmo_ms: estado.ritmo,
    corredor: { ...CORREDOR, distancia_alvo_m: DISTANCIA_ALVO },
    resultados: Object.fromEntries(
      Object.entries(estado.resultados).map(([k, v]) => [k, { ...v, log: undefined }]),
    ),
    decisoes: Object.fromEntries(
      Object.entries(estado.resultados).map(([k, v]) => [k, v.log]),
    ),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `jev-decisoes-seed${estado.seed}-${estado.dificuldade}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------- controlos

const teclas = new Set();

addEventListener('keydown', (e) => {
  if (estado.ecra !== 'flight') return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd'].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key === 'Escape') { alternarPausa(); return; }
  teclas.add(e.key.toLowerCase());
  aplicarTeclas();
});
addEventListener('keyup', (e) => { teclas.delete(e.key.toLowerCase()); aplicarTeclas(); });
addEventListener('blur', () => { teclas.clear(); aplicarTeclas(); });

function aplicarTeclas() {
  const r = estado.ronda;
  if (!r || r.piloto !== 'humano') return;
  const sobe = teclas.has('arrowup') || teclas.has('w');
  const desce = teclas.has('arrowdown') || teclas.has('s');
  const esq = teclas.has('arrowleft') || teclas.has('a');
  const dir = teclas.has('arrowright') || teclas.has('d');
  r.cmdY = sobe && !desce ? 1 : desce && !sobe ? -1 : 0;
  r.cmdX = dir && !esq ? 1 : esq && !dir ? -1 : 0;
  r.intensidade = 1;
}

// toque: arrastar move o drone na direcção do gesto
let toqueBase = null;
const canvas = $('canvas');
canvas.addEventListener('pointerdown', (e) => {
  if (estado.ronda?.piloto !== 'humano') return;
  canvas.setPointerCapture(e.pointerId);
  toqueBase = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', (e) => {
  const r = estado.ronda;
  if (!toqueBase || !r || r.piloto !== 'humano') return;
  const dx = e.clientX - toqueBase.x;
  const dy = e.clientY - toqueBase.y;
  r.cmdX = Math.abs(dx) > 16 ? Math.sign(dx) : 0;
  r.cmdY = Math.abs(dy) > 16 ? -Math.sign(dy) : 0;
  r.intensidade = 1;
});
const largarToque = () => {
  toqueBase = null;
  const r = estado.ronda;
  if (r && r.piloto === 'humano') { r.cmdX = 0; r.cmdY = 0; }
};
canvas.addEventListener('pointerup', largarToque);
canvas.addEventListener('pointercancel', largarToque);

function alternarPausa() {
  if (!estado.ronda || estado.ronda.terminada) return;
  estado.pausado = !estado.pausado;
  $('overlay').hidden = !estado.pausado;
  if (estado.pausado) {
    $('overlay-title').textContent = 'Pausa';
    $('overlay-text').textContent = 'O corredor continua onde o deixaste.';
    $('overlay-btn').textContent = 'Continuar';
    $('overlay-btn').onclick = alternarPausa;
  } else {
    estado.ultimo = performance.now();
    estado.raf = requestAnimationFrame(ciclo);
  }
}

// ---------------------------------------------------------------- arranque

async function verificarGateway() {
  const dot = $('dot-gateway');
  const txt = $('txt-gateway');
  try {
    const r = await fetch('/api/jev');
    const j = await r.json();
    if (j.gateway_configurado) {
      dot.classList.add('ok');
      txt.textContent = `AI Gateway ligado · ${j.modelo}`;
    } else {
      dot.classList.add('warn');
      txt.textContent = 'AI Gateway sem credenciais — a ronda JEV corre com o baseline geométrico.';
    }
  } catch {
    dot.classList.add('warn');
    txt.textContent = 'Endpoint /api/jev indisponível — a ronda JEV corre com o baseline geométrico.';
  }
}

$('btn-start').addEventListener('click', arrancar);
$('btn-seed').addEventListener('click', () => {
  $('input-seed').value = String(Math.floor(Math.random() * 999999));
});
$('btn-again').addEventListener('click', () => mostrarEcra('briefing'));
$('btn-log').addEventListener('click', descarregarLog);

if (location.search.includes('debug')) window.__saam = estado;

verificarGateway();
