# JEV / Mesa de missão LUS-222

Demonstração independente de decisões estruturadas do [`typesafe-ai/jev`](https://vercel.com/ai-gateway/models/jev), via Vercel AI Gateway, numa missão **ilustrativa** do LUS-222. O JEV recebe estado numérico e textual; **não vê** a cena 3D, imagens ou o Google Maps. A aeronave e a física não representam desempenho certificado, instrução aeronáutica ou procedimentos operacionais.

O cenário principal é **São João / Porto**: uma aproximação hipotética ao Aeroporto Francisco Sá Carneiro entre o fim da tarde e a noite de 23 de junho. Balões transportados pelo vento, tráfego, luz e vento criam decisões sucessivas. MEDEVAC Açores, Carga Ponte de Sor e SAR costa continuam disponíveis.

## O que se observa

1. O comandante escolhe cenário, carga, tolerância ao risco e restrições.
2. O JEV responde a quatro perguntas tipadas no briefing. Em cada incidente responde a ação de missão, destino, eixos vertical/lateral, urgência, risco, revisão PIC e continuidade.
3. O supervisor determinístico verifica pista, reserva, envelope e separação. Uma proposta incompatível fica no registo e a intervenção do supervisor aparece com autoria própria.
4. O motor recalcula posição, velocidade, altitude, rumo, massa, consumo, destino e ETA. Regressar, orbitar, desviar e abortar mudam o percurso e os incidentes possíveis.
5. O debriefing preserva entrada, resposta original, intervenção, estado antes/depois e comparação por dimensão. O laboratório altera uma variável numa **cópia** e pede nova resposta ao JEV.

A regra geométrica de comparação é deliberadamente limitada e nunca controla o voo. Uma percentagem global de “sucesso” esconderia desacordos importantes; por isso ação, destino, manobra, limites e revisão PIC são apresentados separadamente. Uma sugestão de revisão do JEV não é confundida com uma intervenção humana.

A interface usa uma paleta preta e branca e uma animação de pontos “J·EV” na abertura, inspirada na linguagem visual da Pixelgrammar. A animação fica estática quando o sistema pede movimento reduzido; a missão também funciona sem WebGL (`?sem-webgl=1` permite verificar essa apresentação).

Cada ecrã cabe na altura da janela (`100dvh`) a 375, 390, 768, 1366 e 1440 px, sem scroll de página. Só os painéis secundários (linha de decisão, respostas tipadas, gavetas) fazem scroll interno; nenhum comando fica fora da vista. A render do LUS-222 é o exlibris: ocupa a abertura, aparece esbatida na mesa e no relatório, recortada nas cartas de missão e em miniatura na identidade do voo. O voo abre com dois segundos de órbita à volta do avião antes da vista atrás da cauda.

- **Mesa de missão:** cartas numa linha (deslizam na horizontal no telemóvel), parâmetros compactos e `Iniciar JEV ao vivo` / `Ver replay gravado` fixos em baixo. A pista real abre numa sobreposição.
- **Voo:** canvas a ecrã inteiro; topo com identidade, fase e `Terminar`; selo da decisão com a manobra e os milissegundos do JEV; dock com `Decisão`, `Pausar`, velocidade, `Intervenção PIC` e `Pista real`. O painel de decisão é uma gaveta, aberta por omissão no desktop e fechada no telemóvel.
- **Relatório:** métricas numa linha, linha de decisão com scroll interno e laboratório numa gaveta.

## Cenários e rubricagem

| Cenário | Incidentes possíveis na rota | Critério observado |
|---|---|---|
| São João / Porto | Balões, tráfego de chegada, anoitecer, vento, aproximação final | Separação por manobra, manutenção ou mudança justificada de destino, pista e reserva |
| MEDEVAC Açores | Frente meteorológica, relevo, relógio clínico | Margem de tempo, destino clínico e separação do relevo |
| Carga Ponte de Sor | Massa, aves, vento | Reserva com carga, margem de pista e evasão do bando |
| SAR costa | Luz, contacto incerto, tráfego civil, reserva | Continuidade da busca, separação e combustível de regresso |

As condições e alternativas dos cenários são hipóteses da demonstração. O evento só é avaliado se a rota e o estado ainda o permitirem. O texto “pista insuficiente” resulta do cálculo de massa, vento e superfície, não de uma etiqueta fixa.

## Física e proveniência

`public/src/simulacao.js` contém o perfil `ilustrativo-3`: massa, área de asa, sustentação/arrasto, empuxo, consumo, vento e limites assumidos. O integrador usa passos fixos de 0,1 s e um relógio de até 8×. As coordenadas da missão e as grandezas de voo usam unidades SI; o Three.js lê o resultado para o desenhar. A semente e as decisões permitem reproduzir o mesmo percurso. Uma aproximação completa demora cerca de 3–5 minutos a 8×; uma decisão de regresso pode encurtá-la.

No incidente dos balões, o JEV recebe geometria estruturada (distância, tempo e folgas) e responde com ação, manobras e destino **condicional**. O simulador calcula a separação prevista com a mesma integração do voo; o supervisor altera uma manobra se a previsão entrar no perímetro ilustrativo de 36 m. A passagem regista a distância mínima efetiva ou termina como `separacao_perdida` se atravessar esse perímetro. O relógio simulado pára durante a avaliação de uma ameaça iminente. Os ícones 3D são ampliados para leitura, mas deslocam-se de acordo com as posições relativas em metros; não representam balões à escala real. Este cálculo não equivale a garantia operacional de separação.

A referência da pista principal é a **LDA publicada de 3180 m para a pista 17** no [AIP Portugal, LPPR AD 2.13](https://ais.nav.pt/wp-content/uploads/AIS_Files/eAIP_Current/eAIP_Online/eAIP/html/eAIP/LP-AD-2.LPPR-en-PT.html). Esse valor contextual não calibra o avião. A [informação turística oficial do Porto](https://backoffice.visitporto.travel/pt-PT/sao-joao-the-porto-celebration) descreve os balões de São João; a presença no corredor de chegada nesta missão é **ficcional**.

A referência visual da pista é uma [incorporação oficial do Google Maps](https://support.google.com/maps/answer/11471036?hl=pt-PT) em modo satélite, com atribuição no próprio mapa. É uma imagem cartográfica estática; o anoitecer, os balões, a trajetória e a aeronave são simulados separadamente. A aplicação não guarda nem redistribui imagens do Google Maps. O iframe só carrega conteúdo do Google quando a sobreposição `Pista real` é aberta (na mesa ou durante o voo).

## Estrutura

```text
api/jev.js                  POST /api/jev e validação da resposta JEV
public/src/simulacao.js     cenários, física, eventos, destinos e supervisor
public/src/contrato-jev.js  validação de choice, score e boolean
public/src/avaliacao-sim.js rubricagem por dimensão
public/src/main.js          controlador de missão, UI, replay e laboratório
public/src/world.js         representação 3D do estado do motor
public/replays/*.json       quatro gravações reais do JEV, identificadas como replay
scripts/record-replays.mjs  regenera gravações através do Gateway
lib/*.test.mjs             testes de contrato, física, ramificação e replay
```

O log JSON tem versão 4, perfil, semente, restrições, briefing, respostas originais, estados antes/depois, intervenções, tempos, separação dos balões e eventuais contrafactuais. Os replays usam respostas gravadas: **não fazem pedidos ao JEV nem são um teste ao vivo**. Se uma avaliação ao vivo falhar, o relógio para e pode-se tentar de novo ou terminar como incompleta. O cliente espera 13 s e a função impõe 12 s.

## Executar

```bash
npm ci
cp .env.example .env
npm run preview
```

Configurar `AI_GATEWAY_API_KEY` apenas no `.env` ignorado pelo Git ou nas variáveis de ambiente da Vercel. Sem Gateway, iniciar **Ver replay gravado**. `npm run dev` serve apenas os ficheiros estáticos e não fornece `/api/jev`.

```bash
npm test
npm run lint
npm run replays:record
```

`replays:record` exige o Gateway local em `http://localhost:43123`. As respostas do JEV podem variar entre gravações; as invariantes verificadas são contrato, reprodução e proveniência, não uma escolha idêntica em todas as execuções.

## Limites

- Não é uma simulação aeronáutica certificada, nem um sistema Detect and Avoid ou um plano de voo.
- Coordenadas, tráfego, meteorologia e performance alternativos são assumidos para demonstrar decisões causais.
- O Google Maps e a renderização 3D não são enviados ao JEV; só segue o estado estruturado visível no registo.
- Os registos devem ser revistos antes de serem partilhados; esta demonstração usa apenas dados sintéticos, sem clientes ou passageiros reais.

MIT — ver [LICENSE](./LICENSE).
