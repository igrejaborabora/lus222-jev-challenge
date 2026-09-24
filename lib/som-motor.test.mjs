import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarSomMotor, parametrosSom } from './som-motor.mjs';

describe('som do motor', () => {
  it('a passagem das pás fica entre 110 e 134 Hz e sobe com a potência', () => {
    const ralenti = parametrosSom({ potencia: 0.24 });
    const cheia = parametrosSom({ potencia: 1 });
    assert.equal(Math.round(ralenti.fPas), 110);
    assert.equal(Math.round(cheia.fPas), 133);
    assert.ok(cheia.ganhoTom > ralenti.ganhoTom);
    assert.ok(cheia.batimentoHz > ralenti.batimentoHz, 'os motores desafinam mais com potência');
  });

  it('o vento abre o filtro com a velocidade e a distância abafa o conjunto', () => {
    assert.ok(parametrosSom({ velocidadeMs: 110 }).corteRuidoHz > parametrosSom({ velocidadeMs: 40 }).corteRuidoHz);
    const perto = parametrosSom({ distanciaCamaraM: 12 });
    const longe = parametrosSom({ distanciaCamaraM: 400 });
    assert.ok(longe.ganhoTotal < perto.ganhoTotal);
    assert.ok(longe.corteRuidoHz < perto.corteRuidoHz);
  });

  it('valores fora do voo não produzem NaN', () => {
    for (const v of Object.values(parametrosSom({ potencia: undefined, velocidadeMs: null, distanciaCamaraM: NaN }))) {
      assert.ok(Number.isFinite(v));
    }
  });

  it('sem Web Audio (Node) o controlador não falha', () => {
    const som = criarSomMotor();
    assert.equal(som.ligar(), false);
    som.actualizar({ potencia: 0.8 });
    som.suspender();
    som.retomar();
    som.silenciar(true);
    assert.equal(som.estado.contexto, 'inexistente');
  });
});
