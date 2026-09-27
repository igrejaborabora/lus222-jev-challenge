const limitar = (valor, min, max) => Math.max(min, Math.min(max, Number.isFinite(valor) ? valor : 0));

function eixo(valor, zonaMorta) {
  const v = limitar(valor, -1, 1);
  if (Math.abs(v) <= zonaMorta) return 0;
  return Math.sign(v) * (Math.abs(v) - zonaMorta) / (1 - zonaMorta);
}

function botao(gamepad, indice) {
  const b = gamepad.buttons?.[indice];
  return limitar(b?.value ?? (b?.pressed ? 1 : 0), 0, 1);
}

/**
 * Gamepad API, apenas mapping standard. Stick esquerdo: bank e puxar = subir;
 * stick direito horizontal: leme; LT/RT: diminuir/aumentar potência; A: travão.
 * Uma ligação sem input nunca pede controlo manual. Sem dependência de navigator,
 * para que desligar, valores inválidos e dead zone sejam testados sem browser.
 */
export function lerGamepad(gamepads, { zonaMorta = 0.12 } = {}) {
  const zona = Number.isFinite(zonaMorta) ? limitar(zonaMorta, 0, 0.95) : 0.12;
  let neutro = null;
  for (const pad of Array.from(gamepads ?? [])) {
    if (!pad || pad.connected === false || pad.mapping !== 'standard') continue;
    const entrada = {
      bankInput: eixo(pad.axes?.[0], zona),
      pitchInput: eixo(pad.axes?.[1], zona),
      rudder: eixo(pad.axes?.[2], zona),
      potenciaDelta: eixo(botao(pad, 7) - botao(pad, 6), zona),
      travao: botao(pad, 0),
    };
    const activo = Object.values(entrada).some((v) => Math.abs(v) > 0);
    const leitura = { activo, ...entrada };
    if (activo) return leitura;
    neutro ??= leitura;
  }
  return neutro;
}
