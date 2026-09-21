import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarIncidente, complementoVisual, estadoInicial, gerarFita } from './fita.mjs';

describe('gerarFita', () => {
  it('a mesma semente reproduz a mesma fita', () => {
    const a = gerarFita('medevac', 222);
    const b = gerarFita('medevac', 222);
    assert.deepEqual(a.incidentes.map((i) => i.id), b.incidentes.map((i) => i.id));
    assert.equal(a.incidentes[0].resumo, b.incidentes[0].resumo);
  });

  it('sementes diferentes podem mudar parâmetros, não a tese escondida', () => {
    const a = gerarFita('medevac', 222);
    const b = gerarFita('medevac', 333);
    assert.equal(a.incidentes.length, b.incidentes.length);
    assert.ok(a.incidentes.every((i) => i.tese && i.tese.nota));
  });

  it('cada cenário tem 5–8 incidentes e a ameaça visual própria em rota', () => {
    const assinatura = { medevac: 'canyon', carga: 'aves', sar: 'guerra' };
    for (const id of ['medevac', 'carga', 'sar']) {
      const f = gerarFita(id, 222);
      assert.ok(f.incidentes.length >= 5 && f.incidentes.length <= 8, id);
      assert.ok(f.incidentes.some((i) => i.tese?.nota), id);
      const visuais = f.incidentes.flatMap((i) => i.patch?.geometria?.obstaculos ?? []);
      const emRota = visuais.filter((o) => o.visual === assinatura[id] && o.em_rota);
      assert.ok(emRota.length >= 2, id);
      assert.ok(emRota.every((o) => o.distancia_m > 40), id);
    }
  });

  it('um beat sem geometria ganha a cena à frente, sem a meter no estado', () => {
    const f = gerarFita('carga', 222);
    const vazio = f.incidentes.find((i) => (i.patch?.geometria?.obstaculos ?? []).length === 0);
    assert.ok(vazio);
    const estado = aplicarIncidente(estadoInicial('carga', { semente: 222 }), vazio);
    assert.equal(estado.geometria.obstaculos.length, 0);
    const vista = complementoVisual('carga', estado.geometria.obstaculos);
    assert.equal(vista.filter((o) => o.visual === 'aves').length, 1);
    assert.equal(vista[0].em_rota, false);
    const comBando = f.incidentes.find((i) => i.patch.geometria.obstaculos.some((o) => o.visual === 'aves'));
    const semDup = complementoVisual('carga', comBando.patch.geometria.obstaculos);
    assert.equal(semDup.filter((o) => o.visual === 'aves').length, 1);
  });

  it('a tese não viaja no estado enviado ao JEV', () => {
    const fita = gerarFita('carga', 222);
    const estado = aplicarIncidente(estadoInicial('carga', { semente: 222 }), fita.incidentes[0]);
    assert.equal(estado.incidente.id, fita.incidentes[0].id);
    assert.ok(!('tese' in estado));
    assert.ok(!('tese' in estado.incidente));
    assert.match(JSON.stringify(estado), /^(?!.*Recusar a sobrecarga).*$/);
  });
});

describe('estadoInicial', () => {
  it('aplica restrições do comandante', () => {
    const e = estadoInicial('medevac', {
      nunca_desviar: true,
      preferir_stol: true,
      risco_maximo: 'baixo',
      tripulantes: 1,
      config_cabine: 'medevac',
    });
    assert.equal(e.restricoes.nunca_desviar, true);
    assert.equal(e.restricoes.preferir_stol, true);
    assert.equal(e.restricoes.risco_maximo, 'baixo');
    assert.equal(e.aeronave.tripulantes, 1);
    assert.equal(e.aeronave.config_cabine, 'medevac');
    assert.equal(e.missao.tipo, 'medevac');
  });
});
