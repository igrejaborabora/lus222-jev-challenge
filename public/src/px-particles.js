/**
 * PX da Pixelgrammar. Adaptado de botffett/web/components/landing/px-particles.tsx:
 * mesmos glifos, molas, cores, repulsão e varrimento luminoso.
 * A dispersão acontece apenas durante interação, mantendo legível a autoria.
 * Canvas 2D independente de React; só anima enquanto a abertura está visível.
 */
const W = 520;
const H = 230;
const MAX_PARTICULAS = 2400;
const RAIO_PONTEIRO = 90;

function amostrar() {
  const amostra = document.createElement('canvas');
  amostra.width = W;
  amostra.height = H;
  const ctx = amostra.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(H * 0.82)}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.fillText('PX', W / 2, H / 2 + 4);
  const { data } = ctx.getImageData(0, 0, W, H);
  const alvos = [];
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      if (data[(y * W + x) * 4 + 3] > 128) alvos.push({ x, y });
    }
  }
  const passo = alvos.length / MAX_PARTICULAS;
  return passo <= 1 ? alvos : Array.from({ length: MAX_PARTICULAS }, (_, i) => alvos[Math.floor(i * passo)]);
}

function iniciar(canvas) {
  const ctx = canvas.getContext('2d');
  const alvos = amostrar();
  if (!ctx || !alvos.length) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const marca = canvas.closest('.px-brand');
  const ecran = canvas.closest('.screen');
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)');
  const ponteiro = { x: 0, y: 0, activo: false };
  const particulas = alvos.map((a, i) => {
    const angulo = i / alvos.length * Math.PI * 2;
    const raio = 220 + i % 7 * 26;
    return { x: marca?.closest('.lab-header') ? a.x : W / 2 + Math.cos(angulo) * raio, y: marca?.closest('.lab-header') ? a.y : H / 2 + Math.sin(angulo) * raio * 0.6,
      vx: 0, vy: 0, tx: a.x, ty: a.y, size: marca?.closest('.lab-header') ? 3.2 : 1.5 + i % 5 * 0.3, hue: i % 9 === 0,
      pull: 0.014 + i % 11 * 0.0018, flash: 0 };
  });
  let frame = 0;
  let visivel = true;
  let tick = 0;
  let ultimo = 0;
  let dispersaoS = 0;

  function baseLegivel() {
    if(!marca.closest('.lab-header'))return;
    ctx.save();ctx.globalCompositeOperation='source-over';ctx.fillStyle='rgba(120,230,255,.38)';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 ${Math.round(H*.82)}px "IBM Plex Sans",system-ui,sans-serif`;
    ctx.fillText('PX',W/2,H/2+4);ctx.restore();
  }
  function estatico() {
    ctx.clearRect(0, 0, W, H);
    baseLegivel();
    ctx.globalCompositeOperation = 'source-over';
    for (const [i, a] of alvos.entries()) {
      ctx.fillStyle = i % 9 === 0 ? '#bea0ff' : '#78e6ff';
      const size=marca.closest('.lab-header')?3.8:2;ctx.fillRect(a.x,a.y,size,size);
    }
  }

  function dispersar() {
    for (const p of particulas) {
      const dx = p.x - W / 2;
      const dy = p.y - H / 2;
      const dist = Math.hypot(dx, dy) || 1;
      const forca = 7 + p.size % 1 * 9;
      p.vx += dx / dist * forca;
      p.vy += dy / dist * forca * 0.7;
    }
  }

  function desenhar(agora) {
    frame = 0;
    const dt = ultimo ? Math.min((agora - ultimo) / (1000 / 60), 2) : 1;
    ultimo = agora;
    tick += dt;
    dispersaoS += dt / 60;
    if (ponteiro.activo && dispersaoS >= 12) { dispersar(); dispersaoS = 0; }
    const sweepX = (tick * 1.4) % (W + 300) - 150;
    ctx.clearRect(0, 0, W, H);
    baseLegivel();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particulas) {
      p.vx += ((p.tx - p.x) * p.pull + Math.sin(tick * 0.01 + p.ty * 0.05) * 0.012) * dt;
      p.vy += ((p.ty - p.y) * p.pull + Math.cos(tick * 0.01 + p.tx * 0.05) * 0.012) * dt;
      if (ponteiro.activo) {
        const dx = p.x - ponteiro.x;
        const dy = p.y - ponteiro.y;
        const dist = Math.hypot(dx, dy);
        if (dist < RAIO_PONTEIRO && dist > 0.01) {
          const forca = (1 - dist / RAIO_PONTEIRO) * 2.4 * dt;
          p.vx += dx / dist * forca;
          p.vy += dy / dist * forca;
        }
      }
      p.vx *= 0.86 ** dt;
      p.vy *= 0.86 ** dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.flash = Math.abs(p.x - sweepX) < 12 ? 1 : p.flash * 0.92 ** dt;
      const speed = Math.min(Math.hypot(p.vx, p.vy) / 6 + p.flash * 0.6, 1);
      ctx.fillStyle = p.hue ? `rgba(190,160,255,${0.7 + speed * 0.3})`
        : `rgba(${120 + speed * 120},${230 - speed * 20},255,${0.8 + speed * 0.2})`;
      ctx.fillRect(p.x, p.y, p.size + speed * 1.5, p.size + speed * 1.5);
    }
    ctx.fillStyle = 'rgba(120,230,255,0.06)';
    ctx.fillRect(sweepX, 0, 2, H);
    frame = requestAnimationFrame(desenhar);
  }

  function actualizar() {
    cancelAnimationFrame(frame);
    frame = 0;
    ultimo = 0;
    ponteiro.activo = false;
    if (reduzido.matches) { estatico(); return; }
    if (visivel && !document.hidden && ecran.classList.contains('active')) frame = requestAnimationFrame(desenhar);
  }

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    ponteiro.x = (e.clientX - r.left) / r.width * W;
    ponteiro.y = (e.clientY - r.top) / r.height * H;
    ponteiro.activo = true;
  });
  const limpar = () => { ponteiro.activo = false; };
  canvas.addEventListener('pointerleave', limpar);
  canvas.addEventListener('pointercancel', limpar);
  canvas.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') limpar(); });
  new IntersectionObserver(([e]) => { visivel = e.isIntersecting; actualizar(); }).observe(canvas);
  new MutationObserver(actualizar).observe(ecran, { attributes: true, attributeFilter: ['class'] });
  reduzido.addEventListener('change', actualizar);
  document.addEventListener('visibilitychange', actualizar);
  window.addEventListener('pagehide', () => cancelAnimationFrame(frame));
  window.addEventListener('pageshow', actualizar);
  // Fallback textual só desaparece depois de existir um monograma desenhado.
  estatico();
  marca.classList.add('px-ready');
  actualizar();
}

const canvas = document.getElementById('px-particles');
if (canvas) document.fonts.ready.then(() => iniciar(canvas));
