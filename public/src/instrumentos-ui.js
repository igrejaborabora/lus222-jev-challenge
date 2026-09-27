import { instrumentosDeVoo, transformacaoHorizonte, anguloTrajectoria } from './instrumentos.js';

const numero = (n) => Math.round(n).toLocaleString('en-GB');
const assinado = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${numero(Math.abs(n))}`;

/** Cache de elementos e actualizações de texto só quando o valor muda. */
export function criarInstrumentosUI(raiz) {
  const campos = new Map();
  for(const e of raiz.querySelectorAll('[data-instrumento]')) campos.set(e.dataset.instrumento,[...(campos.get(e.dataset.instrumento)??[]),e]);
  const horizonte = raiz.querySelector('#sim-horizonte-movel');
  const trajectoria = raiz.querySelector('#sim-trajectoria');
  const agulha = raiz.querySelector('#sim-vsi-agulha');
  const painel = raiz.querySelector('#sim-instrumentos');
  const aviso = raiz.querySelector('#sim-aviso-voo');
  const compacto=raiz.querySelector('#sim-aviso-compacto');
  const texto = (nome, valor) => {
    for(const e of campos.get(nome)??[]) if(e.textContent !== valor) e.textContent = valor;
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
      texto('bank', numero(Math.abs(i.bankGraus)) + '° ' + (i.bankGraus > 0.5 ? 'R' : i.bankGraus < -0.5 ? 'L' : ''));
      texto('piloto', i.piloto);
      texto('autoridade', i.autoridade);
      texto('intencao', i.intencao);
      texto('movimento', i.movimento);
      texto('trajectoria', assinado(Math.round(i.trajectoriaGraus)) + '°');
      painel.dataset.movimento = i.movimento === 'Climbing' ? 'subir' : i.movimento === 'Descending' ? 'descer' : 'nivelado';
      texto('alvo', i.altitudeAlvoFt == null ? '—' : numero(i.altitudeAlvoFt) + ' ft');
      texto('aviso', i.aviso);
      painel.classList.toggle('tem-aviso', Boolean(i.aviso));
      aviso.hidden = !i.aviso;
      if(compacto)compacto.hidden=!i.aviso||!painel.hidden;
      // ±6000 ft/min; extreme dives remain readable in the unbounded numerical value.
      agulha.style.transform = `translateY(${-Math.max(-6000, Math.min(6000, i.verticalFtMin)) / 6000 * (agulha.parentElement.clientHeight/2-3)}px)`;
    },
  };
}
