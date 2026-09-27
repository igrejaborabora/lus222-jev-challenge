import { instrumentosDeVoo, transformacaoHorizonte, anguloTrajectoria } from './instrumentos.js';

const numero = (n) => Math.round(n).toLocaleString('pt-PT');
const assinado = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${numero(Math.abs(n))}`;

/** Cache de elementos e actualizações de texto só quando o valor muda. */
export function criarInstrumentosUI(raiz) {
  const campos = new Map([...raiz.querySelectorAll('[data-instrumento]')].map((e) => [e.dataset.instrumento, e]));
  const horizonte = raiz.querySelector('#sim-horizonte-movel');
  const trajectoria = raiz.querySelector('#sim-trajectoria');
  const agulha = raiz.querySelector('#sim-vsi-agulha');
  const painel = raiz.querySelector('#sim-instrumentos');
  const aviso = raiz.querySelector('#sim-aviso-voo');
  const texto = (nome, valor) => {
    const e = campos.get(nome);
    if (e && e.textContent !== valor) e.textContent = valor;
  };
  return {
    atitude(v) {
      horizonte.setAttribute('transform', transformacaoHorizonte(v.pitchRad * 180 / Math.PI, v.bankRad * 180 / Math.PI));
      trajectoria.setAttribute('transform', `translate(0 ${-anguloTrajectoria(v) * 2.5})`);
    },
    actualizar(m, voo = m.voo) {
      const i = instrumentosDeVoo(m, voo);
      texto('velocidade', numero(i.velocidadeKt));
      texto('altitude', numero(i.altitudeFt));
      texto('vertical', assinado(Math.round(i.verticalFtMin / 10) * 10));
      texto('rumo', String(Math.round(i.rumoGraus) % 360).padStart(3, '0'));
      texto('agl', numero(i.aglFt));
      texto('potencia', numero(i.potenciaPct));
      texto('combustivel', numero(i.combustivelKg));
      texto('solo', numero(i.soloKt));
      texto('consumo', numero(i.consumoKgH));
      texto('autonomia', numero(i.autonomiaMin));
      texto('massa', numero(i.massaKg));
      texto('pitch', assinado(Math.round(i.pitchGraus)) + '°');
      texto('bank', numero(Math.abs(i.bankGraus)) + '° ' + (i.bankGraus > 0.5 ? 'D' : i.bankGraus < -0.5 ? 'E' : ''));
      texto('piloto', i.piloto);
      texto('autoridade', i.autoridade);
      texto('intencao', i.intencao);
      texto('movimento', i.movimento);
      texto('trajectoria', assinado(Math.round(i.trajectoriaGraus)) + '°');
      painel.dataset.movimento = i.movimento === 'A subir' ? 'subir' : i.movimento === 'A descer' ? 'descer' : 'nivelado';
      texto('alvo', i.altitudeAlvoFt == null ? '—' : numero(i.altitudeAlvoFt) + ' ft');
      texto('aviso', i.aviso);
      painel.classList.toggle('tem-aviso', Boolean(i.aviso));
      aviso.hidden = !i.aviso;
      // ±1500 ft/min na escala; o valor numérico continua sem truncamento.
      agulha.style.transform = `translateY(${-Math.max(-1500, Math.min(1500, i.verticalFtMin)) / 1500 * 22}px)`;
    },
  };
}
