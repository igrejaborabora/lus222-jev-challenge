# JEV comanda o LUS-222

Isto **não** é um simulador de voo. É o modelo [`typesafe-ai/jev`](https://vercel.com/ai-gateway/models/jev) (TypeSafe AI, via **Vercel AI Gateway**) a decidir e **desviar** uma missão do **LUS-222** — o STOL português do CEiiA / EEA Aircraft. O humano é **comandante de missão**: escolhe o cenário e observa o dodge. O JEV aplica a acção e os eixos de evasão de imediato. Não há joystick.

O software é o JEV. O LUS-222 é o cenário. A regra geométrica corre em paralelo, cega a meteo, hospital, payload e relógio, só para o debriefing — **nunca manda o avião**.

---

## Âmbito, dito à cabeça

Demo **independente**. O espectáculo é **evasão autónoma** (subir / virar / desviar à volta de obstáculos visíveis). **Não** é Detect-and-Avoid certificável, **não** é autopiloto, **não** é produto oficial da EEA Aircraft ou do CEiiA salvo autorização escrita. A separação mínima e a terminação de voo continuam a pertencer a lógica determinística verificável.

A comparação **JEV vs regra só é válida com AI Gateway**. Sem chave, a missão JEV **não arranca**. A reserva geométrica **nunca** se apresenta como JEV.

## O que o JEV faz aqui

O Jev não gera prosa. Recebe um **estado** e devolve, no mesmo pedido:

| Momento | Perguntas |
|---|---|
| Briefing (1×) | `configuracaoCabine` · `prioridadeOperacional` · `pistaAdequada` · `combustivelSuficiente` |
| Cada incidente | `acaoMissao` · `manobraVertical` · `manobraLateral` · `destinoPreferido` · `urgencia` · `riscoMeteorologico` · `precisaRevisaoPIC` · `continuarVoo` |

O LUS-222 voa os eixos do JEV (`subir`/`descer`, `esquerda`/`direita`) no instante da evaluate. `precisaRevisaoPIC` fica só no log — a UI **não** espera Accept/Reject. A regra geométrica calcula os mesmos eixos para o debriefing e não controla a aeronave.

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
npx vercel dev          # se o Development Command do projecto for `npm run dev`, use `npm run preview`
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
