# JEV comanda o LUS-222

Isto **não** é um simulador de voo. É o modelo [`typesafe-ai/jev`](https://vercel.com/ai-gateway/models/jev) (TypeSafe AI, via **Vercel AI Gateway**) a decidir uma missão do **LUS-222** — o STOL português do CEiiA / EEA Aircraft. O humano é **comandante de missão**: escolhe o cenário e as restrições, aceita ou rejeita escalações ao PIC. Não há joystick.

O software é o JEV. O LUS-222 é o cenário. A regra geométrica corre em paralelo, cega a meteo, hospital, payload e relógio, só para o debriefing mostrar o que a geometria não vê.

---

## Âmbito, dito à cabeça

Demo **independente**. **Não** é Detect-and-Avoid certificável, **não** é autopiloto, **não** é produto oficial da EEA Aircraft ou do CEiiA salvo autorização escrita. A separação mínima e a terminação de voo continuam a pertencer a lógica determinística verificável.

A comparação **JEV vs regra só é válida com AI Gateway**. Sem chave, a missão JEV **não arranca**. A reserva geométrica **nunca** se apresenta como JEV.

## O que o JEV faz aqui

O Jev não gera prosa. Recebe um **estado** e devolve, no mesmo pedido:

| Momento | Perguntas |
|---|---|
| Briefing (1×) | `configuracaoCabine` · `prioridadeOperacional` · `pistaAdequada` · `combustivelSuficiente` |
| Cada incidente | `acaoMissao` · `destinoPreferido` · `urgencia` · `riscoMeteorologico` · `precisaRevisaoPIC` · `continuarVoo` |

`precisaRevisaoPIC` é a feature que um LLM de texto e uma regra de folgas não vendem: se P(true) é alta ou se a melhor escolha fica abaixo de 0,55, a UI **bloqueia a automação** e pede o comandante.

A fita (5–8 incidentes) nasce de uma semente. MEDEVAC Açores, carga Ponte de Sor e SAR costa partilham o motor e diferem na tese.

## Arquitectura

```
lib/                   contrato + testes sem rede (reexportam public/src)
api/jev.js             Vercel Function — só responde fonte: 'jev' ou bloqueio
public/index.html      splash → comandante → missão → debriefing
public/src/decisao.js  estado + baseline cego
public/src/fita.js     semente → incidentes (tese escondida)
public/src/world.js    malha LUS-222 + costa, câmara 3/4
public/img/            render do LUS-222 (crédito EEA Aircraft)
```

Sem bundler. Three.js no CDN. A chave do Gateway **nunca** entra no browser.

## Correr

```bash
npm install
cp .env.example .env    # AI_GATEWAY_API_KEY
npm test                # contrato e baseline, sem rede
npx vercel dev
```

A chave obtém-se no dashboard da Vercel, **AI Gateway → API Keys**. Em produção, com o Gateway activo no projecto, o OIDC pode dispensar a variável.

## Publicar

```bash
npx vercel deploy --prod
```

## Marca

Não há logótipos oficiais CEiiA/EEA neste repo. O lockup é tipográfico; o herói é a render do LUS-222. **Não extraia marcas de sites de terceiros.** Se houver SVG/PNG autorizados, coloque-os em `public/brand/` e só então os use.

## Licença

MIT — ver [LICENSE](./LICENSE).
