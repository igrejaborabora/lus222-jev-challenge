const screen = document.getElementById('screen-splash');
const canvas = document.getElementById('hero-particles');
const ctx = canvas?.getContext('2d', { alpha: true });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

if (ctx && screen) {
  let points = [];
  let width = 0;
  let height = 0;
  let lastFrame = 0;

  function build() {
    const bounds = screen.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const scale = Math.min(devicePixelRatio || 1, 2);
    width = bounds.width;
    height = bounds.height;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const sample = document.createElement('canvas');
    sample.width = Math.round(width);
    sample.height = Math.round(height);
    const pen = sample.getContext('2d', { willReadFrequently: true });
    const mobile = width < 760;
    const size = mobile ? Math.min(98, width * 0.23) : Math.min(240, width * 0.16);
    pen.fillStyle = '#fff';
    pen.font = `700 ${size}px "Space Grotesk", sans-serif`;
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    pen.fillText('J·EV', mobile ? width * 0.5 : width * 0.77, mobile ? height * 0.22 : height * 0.33);
    const pixels = pen.getImageData(0, 0, sample.width, sample.height).data;
    const step = mobile ? 5 : 4;
    points = [];
    for (let y = 0; y < sample.height; y += step) {
      for (let x = 0; x < sample.width; x += step) {
        if (pixels[(y * sample.width + x) * 4 + 3] < 90) continue;
        const i = points.length;
        const phase = i * 2.39996;
        points.push({
          x: x + Math.sin(phase) * 18,
          y: y + Math.cos(phase * 1.3) * 18,
          tx: x, ty: y, phase,
          radius: i % 7 === 0 ? 2 : 1.3,
        });
      }
    }
    draw(0);
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f4f6f8';
    for (const p of points) {
      const float = reducedMotion.matches ? 0 : Math.sin(time * 0.00085 + p.phase) * 2.4;
      p.x += (p.tx + float - p.x) * (reducedMotion.matches ? 1 : 0.075);
      p.y += (p.ty + float * 0.7 - p.y) * (reducedMotion.matches ? 1 : 0.075);
      ctx.globalAlpha = p.radius > 1.5 ? 0.98 : 0.8;
      ctx.fillRect(p.x, p.y, p.radius, p.radius);
    }
    ctx.globalAlpha = 1;
  }

  function frame(time) {
    if (screen.classList.contains('active') && !reducedMotion.matches && time - lastFrame > 30) {
      lastFrame = time;
      draw(time);
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', build);
  document.fonts.ready.then(build);
  reducedMotion.addEventListener('change', build);
  new MutationObserver(() => { if (screen.classList.contains('active')) build(); })
    .observe(screen, { attributes: true, attributeFilter: ['class'] });
  build();
  requestAnimationFrame(frame);
}
