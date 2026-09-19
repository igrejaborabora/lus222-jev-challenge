# SAAM · JEV Decision Demo

Demonstração em browser de uma **camada de decisão tipada** para mobilidade aérea avançada.

Um drone de carga transporta material médico por um corredor semi-urbano — edifícios, gruas, cabos de alta tensão, tráfego aéreo — em vista FPV, com Three.js. O percurso nasce de uma semente, por isso as três rondas enfrentam exactamente os mesmos obstáculos:

1. **Piloto humano** — teclado ou toque.
2. **Baseline geométrico** — regra determinística: corrige na direcção de folga negativa.
3. **JEV** — o modelo [`typesafe-ai/jev`](https://vercel.com/ai-gateway/models/jev) da TypeSafe AI, pelo **Vercel AI Gateway**.

No fim, um debriefing comparativo e o **log completo de decisões** para descarregar.

---

## Âmbito, dito à cabeça

Isto é uma camada de **decisão de missão e triagem**. **Não** é um sistema de Detect-and-Avoid certificável, e não deve ser apresentado como tal. A separação mínima e a terminação de voo pertencem a lógica determinística verificável — um modelo probabilístico servido por rede não passa DO-178C nem os requisitos de DAA, e quem trabalha com a ANAC ou a EASA sabe disso.

O que esta demo procura mostrar é outra coisa: que uma decisão de alto nível pode ser **tipada, probabilística e auditável**, e que isso tem valor onde a geometria não chega.

## Porquê o Jev e não um LLM

O Jev é um modelo de avaliação — *System One*. Recebe estado e perguntas tipadas e devolve **escolhas, pontuações e probabilidades**, avaliadas em paralelo num único pedido. Não gera texto token a token, o que o torna rápido e barato o suficiente para viver dentro de um ciclo de controlo: a TypeSafe reporta até 193× mais rápido e 444× mais barato do que um LLM nas mesmas avaliações, a 0,04 USD por milhão de tokens de entrada.

Cada avaliação faz cinco perguntas sobre o mesmo estado de voo:

| Pergunta | Tipo | Resposta |
|---|---|---|
| `manobraVertical` | `choice` | `subir` · `descer` · `manter`, com probabilidade de cada |
| `manobraLateral` | `choice` | `esquerda` · `direita` · `manter`, com probabilidade de cada |
| `urgencia` | `score` | 0–3: *sem risco* → *vigiar* → *actuar já* → *evasão de emergência* |
| `colisaoIminente` | `boolean` | probabilidade de embate mantendo a trajectória |
| `abortarMissao` | `boolean` | probabilidade de a situação exigir abortar a entrega |

Os dois eixos são perguntas separadas porque corrigir altitude e desvio lateral são decisões independentes — e o modelo responde a ambas no mesmo round-trip. É exactamente o tipo de estrutura que um LLM devolveria como texto a interpretar.

**O argumento não é a velocidade, é a rastreabilidade.** Cada decisão traz a probabilidade por opção, é registável, reproduzível e comparável com um baseline. É a diferença entre poder e não poder levar o sistema a um regulador.

## Estado enviado ao modelo

```jsonc
{
  "aeronave": { "altitude_m": 96, "desvio_lateral_m": -12, "velocidade_ar_ms": 26,
                "velocidade_vertical_ms": 4, "velocidade_lateral_ms": -8 },
  "corredor": { "altitude_minima_m": 12, "altitude_maxima_m": 155, "limite_lateral_m": 55,
                "margem_ao_solo_m": 84, "margem_ao_tecto_m": 59,
                "margem_lateral_esquerda_m": 43, "margem_lateral_direita_m": 67 },
  "missao":   { "tipo": "entrega de carga em meio semi-urbano", "carga": "material médico",
                "distancia_ao_destino_m": 940, "embates_ate_agora": 0, "integridade_percent": 100 },
  "obstaculos": [
    { "tipo": "grua de construção", "distancia_m": 118, "segundos_ate_ao_contacto": 4.5,
      "folga_por_cima_m": 21, "folga_por_baixo_m": -6,
      "folga_pela_esquerda_m": 14, "folga_pela_direita_m": 9,
      "em_rota_de_colisao": true }
  ]
}
```

As folgas são medidas na posição **projectada** — onde o drone estará se nada mudar — e não na posição actual. Olhar para a posição actual ignora a inércia: o veículo entra na abertura a derivar e sai pelo lado oposto antes da travessia. Qualquer sistema de separação real projecta a trajectória; este também.

## Decisão e controlo são camadas separadas

A camada de decisão escolhe direcção e intensidade a cada 150–400 ms. Por baixo, um controlador local converte isso numa velocidade-alvo e persegue-a a cada passo de física.

Esta separação é o que torna o sistema tolerante à latência da decisão — e é a razão pela qual essa camada *pode* ser um modelo em vez de um laço rígido. Sem ela, um comando mantido 250 ms com inércia oscila e o veículo bate.

## Como a comparação é feita honestamente

Os dois decisores automáticos recebem **as mesmas amostras de sensor**, com o mesmo ruído e **à mesma cadência**. Num sistema real a regra determinística correria localmente a 60 Hz, com latência e custo nulos — uma vantagem que aqui lhe é retirada de propósito, para isolar o decisor e não a frequência.

Num corredor puramente geométrico com sensores razoáveis, **o baseline determinístico deve ganhar**, e o debriefing di-lo quando acontece. Uma demo que só sabe ganhar não serve para falar com engenheiros.

## Arquitectura

```
public/index.html      três ecrãs: briefing, voo, debriefing
public/src/world.js    geração do corredor por semente, cena Three.js, câmara FPV
public/src/pilots.js   física, sensores projectados, os três pilotos, pontuação
public/src/main.js     fluxo das rondas, HUD, painel de decisão, debriefing, log
public/styles.css      interface
public/brand.svg       espaço reservado para a marca de quem apresenta
api/jev.js             Vercel Function — chama typesafe-ai/jev pelo AI Gateway
```

Sem passo de build. Three.js carrega do CDN por import map; o pacote `ai` (AI SDK 7) é usado apenas do lado do servidor, para que a chave do Gateway nunca chegue ao browser.

### Baseline de reserva

Se o Gateway não responder, ou não estiver configurado, a decisão passa para a regra geométrica no servidor. O jogo continua utilizável e o painel assinala a origem da decisão — útil para desenvolvimento local sem chave, mas note-se que nesse modo as rondas *baseline* e *JEV* correm o mesmo algoritmo e os resultados coincidem.

## Marca

`public/brand.svg` é um espaço reservado. Substitua-o pelo ficheiro da sua própria marca antes de apresentar. **Não coloque a marca de terceiros sem autorização**: com o logótipo de uma organização aplicado, a página deixa de se ler como demonstração e passa a parecer um produto oficial dessa organização.

## Correr localmente

```bash
npm install
cp .env.example .env            # colocar a AI_GATEWAY_API_KEY
npx vercel dev
```

A chave obtém-se no dashboard da Vercel, em **AI Gateway → API Keys**. Em produção, com o AI Gateway activo no projecto, o OIDC dispensa a variável.

## Publicar

```bash
npx vercel deploy --prod
```

## Pontuação

```
pontuação = (entregue ? 1000 : 0) + distância × 0,4 + portões × 60 + integridade × 3 − embates × 200
```

Cada embate custa 30 pontos de integridade. Abortar não traz o bónus de entrega, mas também não é penalizado: preservar o veículo e a carga é uma decisão legítima, e é precisamente a decisão que depende de contexto e não de geometria.

## Licença

MIT — ver [LICENSE](./LICENSE).
