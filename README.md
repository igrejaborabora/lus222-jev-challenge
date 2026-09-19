# LUS 222 — JEV Challenge

Jogo em browser em que se pilota o **LUS 222**, a aeronave regional de 19 lugares desenvolvida em Portugal pelo **CEiiA / EEA Aircraft** (engenharia em Évora, linha de montagem em Ponte de Sor), num corredor aéreo semeado de obstáculos.

Voa-se o percurso duas vezes:

1. **Piloto humano** — teclado ou toque.
2. **JEV** — o modelo [`typesafe-ai/jev`](https://vercel.com/ai-gateway/models/jev) da TypeSafe AI, servido pelo **Vercel AI Gateway**, decide as manobras de evasão em tempo real.

O corredor é gerado a partir de uma semente, por isso as duas rondas enfrentam exactamente os mesmos obstáculos. No fim compara-se distância, obstáculos ultrapassados, embates e conforto dos passageiros.

---

## Porquê o Jev e não um LLM

O Jev é um modelo de avaliação — *System One*. Recebe estado e um conjunto de perguntas tipadas, e devolve **escolhas, pontuações e probabilidades**, avaliadas em paralelo num único pedido. Não gera texto token a token, o que o torna rápido e barato o suficiente para viver dentro de um ciclo de jogo: a TypeSafe reporta até 193× mais rápido e 444× mais barato do que um LLM nas mesmas avaliações de workflow, a 0,04 USD por milhão de tokens de entrada.

Em cada avaliação, o jogo faz quatro perguntas sobre o mesmo estado de voo:

| Pergunta | Tipo | Resposta |
|---|---|---|
| `manobra` | `choice` | `subir` · `descer` · `manter`, com a probabilidade de cada opção |
| `urgencia` | `score` | 0–3: *sem risco* → *vigiar* → *actuar já* → *evasão de emergência* |
| `colisaoIminente` | `boolean` | probabilidade de embate mantendo a trajectória actual |
| `conforto` | `boolean` | probabilidade de a manobra ser suave para os 19 passageiros |

A escolha define a direcção, a urgência define a agressividade do comando, e o conforto trava manobras bruscas quando ainda há tempo. Tudo isto aparece no painel lateral durante a ronda da IA, incluindo a latência de cada avaliação.

## Estado enviado ao modelo

```jsonc
{
  "aeronave": { "altitude_m": 812, "velocidade_vertical_ms": -6, "velocidade_ar_ms": 140, "carga_g": 1.2 },
  "corredor": { "altitude_minima_m": 0, "altitude_maxima_m": 1600,
                "margem_ao_solo_m": 812, "margem_ao_tecto_m": 788 },
  "obstaculos": [
    { "tipo": "torre eólica", "distancia_m": 412, "segundos_ate_ao_contacto": 2.9,
      "base_m": 0, "topo_m": 640, "passagem_por_cima_m": 960, "passagem_por_baixo_m": -1,
      "em_rota_de_colisao": true }
  ]
}
```

O `experimental_evaluate` do AI SDK aceita estado estruturado directamente, sem serialização manual.

## Arquitectura

```
public/index.html     três ecrãs: briefing, voo, debriefing
public/game.js        motor do jogo: percurso determinístico, física, render canvas, pilotos
public/styles.css     interface
api/jev.js            Vercel Function — chama typesafe-ai/jev pelo AI Gateway
```

Sem framework e sem passo de build: HTML, CSS e um módulo ES. A única dependência é o pacote `ai` (AI SDK 7), usado apenas do lado do servidor — a chave do Gateway nunca chega ao browser.

### Piloto de reserva

Se o Gateway não responder, ou não estiver configurado, a decisão passa para um piloto geométrico determinístico (escolhe o lado com maior folga). O jogo continua jogável e o painel assinala que o JEV está offline — útil para desenvolvimento local sem chave.

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

Ou ligar o repositório do GitHub ao projecto Vercel para deploy automático em cada push.

## Física e pontuação

O corredor tem 1600 m de altitude útil e 8 km de comprimento; a aeronave voa a 140 m/s, com taxa de subida limitada e inércia — decisões tardias não se recuperam. O conforto é o integral da carga vertical imposta aos passageiros: manobrar cedo e devagar vale pontos.

```
pontuação = obstáculos × 120 + distância × 0,05 + conforto × 4 − embates × 300
```

## Créditos e limites

O LUS 222 é um programa real do CEiiA / EEA Aircraft: aeronave regional não pressurizada de 19 lugares, duas toneladas de carga, concebida para pistas curtas e não pavimentadas, com versões civil e militar. Este projecto é uma **demonstração técnica independente**, sem qualquer ligação oficial ao programa; a aeronave desenhada no jogo é uma silhueta estilizada e a física é deliberadamente arcade.

## Licença

MIT — ver [LICENSE](./LICENSE).
