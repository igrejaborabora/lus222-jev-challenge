# Missões em movimento, JEV visível, consola de operações e som do motor

## Contexto

As missões parecem estáticas e escondem o que distingue o JEV. Diagnóstico sobre `main` (68b93df):

**Física**
- Só os balões existem na física; tráfego, aves e relevo são desenho.
- Há uma ameaça de cada vez (`ameacaAtiva`), com gatilhos fixos e folgas literais (`CENARIOS_SIM`, `public/src/simulacao.js`).

**Uso do JEV**
- O JEV é chamado ~5 vezes por missão.
- Nos 4 replays, as 15 decisões são todas «Prosseguir» e o supervisor nunca intervém.
- Das probabilidades só se vê a da opção escolhida, num `<details>` fechado.
- A `confidence` chega do Gateway (`api/jev.js:104`) e nunca é lida.

**Perguntas mal postas.** Pedem ao JEV precisamente o que ele faz mal:
- comparar números: `manobraLateral` compara folgas (`lib/perguntas.mjs:86-98`);
- ver outra resposta: `precisaRevisaoPIC` (`:135-146`), quando as perguntas correm isoladas;
- na prova contínua, as candidatas chegam ordenadas por folga (`piloto-corredor.js:177`).

**O que o JEV é** (docs TypeSafe/Vercel e SDK local):
- Perguntas tipadas choice/score/boolean respondidas em paralelo numa chamada. Latência mediana medida de 425 ms.
- Probabilidades calibradas e `confidence` por pergunta.
- Só texto. Fraco em aritmética e comparações numéricas: as contas fazem-se em código e enviam-se categorias.
- O inglês é a língua principal.
- É gratuito no Gateway **até 25/09/2026**. Depois custa 0,042 USD por milhão de tokens de entrada; a saída não se paga.

**Decisões do Fernando**
- «Computer use» é o JEV a decidir acções de ecrã.
- Ao vivo para todos, com limites.
- Consola de operações dentro do site.
- Som de hélice procedimental.

**Resultado pretendido.** Na missão São João o visitante vê o JEV reagir em contínuo a ameaças que se movem: lanternas a derivar, um helicóptero que muda de rumo, tráfego de frente, gaivotas na final.
- As barras de probabilidade mexem.
- A confiança decide entre agir, assinalar ou chamar o PIC.
- Em paralelo, o «JEV operações» preenche formulários da Torre, do hospital ou do MRCC com um cursor visível.
- Ouvem-se os motores.

**Narrativa do post (decidida a 2026-09-25):** o LinkedIn da Pixelgrammar mostra um caso espectacular.
- **O Claude Opus 5.5 desenvolveu a aplicação** — plano, código, revisões, testes e verificação — e não é chamado dentro dela.
- **O JEV opera:** decide com probabilidades e *scores*, não com texto.
- O LUS-222 é tecnologia portuguesa em construção. O simulador («Pilota tu») reforça essa ligação.

## Princípios

1. **O ecrã mostra o que o JEV recebe.**
2. **Contas em código, juízo no JEV.** CPA/TCPA, separação prevista por manobra e regras do ar chegam como categorias. O JEV pondera compromissos e devolve uma distribuição.
3. **Segurança determinística.** O supervisor veta conflitos previstos e os limites de altitude; o JEV nunca é a última barreira.
4. **Reprodutível.** O relógio avança em passos fixos. Cada resposta aplica-se num passo inteiro, gravado no replay.
5. **Honestidade.** A consola é «UI conduzida por escolhas tipadas» (o JEV não vê píxeis), não o computer use da Anthropic. O replay está sempre identificado.

## Passo 0 — hoje, com confirmação

- **Orçamento do AI Gateway** para o projecto, antes de a gratuitidade acabar: `vercel ai-gateway budgets set project lus222-jev-challenge --limit 25 --refresh-period monthly`.
- Exige actualizar o CLI (59.11 → 59.26).
- É o tecto rígido de custo; tudo o resto são defesas adicionais.

## Fase A — JEV visível, som e limites (PR 1; sem mudar física nem replays)

**A1. Painel JEV** (`public/src/painel-jev.js`, novo)
- Absorve `barras()` de `public/src/ui.js`, que não é importado em lado nenhum e é **apagado**.
- Substitui o `<details>` (`index.html:78`) por linhas sempre visíveis, cada uma com:
  - a distribuição completa de cada choice;
  - o score e a P(true);
  - um chip de confiança.
- Cabeçalho: «N perguntas em paralelo · ms · tokens».
- O selo e o debrief mostram a confiança.

**A2. Encaminhamento por confiança** (`public/src/confianca.js`, novo, puro)
- **Base do encaminhamento.** Encaminha só pela confiança de `acaoMissao`. `destinoPreferido` e `urgencia` ficam muitas vezes abaixo de 0,4 e escalariam 9 dos 15 eventos gravados.
- **Limiares iniciais**, verificados contra os 15 eventos gravados (objectivo: ≤ 1–2 escaladas por missão):
  - ≥ 0,9: age;
  - 0,5–0,9: age e assinala;
  - < 0,5: pede ao PIC.
- **Ao vivo, numa escalada:** a decisão fica retida e o relógio congela com o `pic-overlay` aberto.
  - O overlay mostra a distribuição e dá 10 s para escolher.
  - Sem escolha, aplica-se a do JEV, validada pelo supervisor.
  - Hoje a decisão é aplicada antes de tudo (`main.js:610`).
- **No replay** só se mostra a escalada.
- **Um só limiar no código.** Os limiares soltos de 0,55 (`main.js:312,445`, `avaliacao-sim.js:39` e `deveEscalarPIC` via `debrief.js:139`) passam a usar `confianca.js`.
- **Perguntas e contexto:**
  - `precisaRevisaoPIC` passa a pergunta autónoma: fora do envelope, ou restrições em conflito.
  - Em `CONTEXTO`, sai «Nunca esperas Accept/Reject do PIC», que contradiz a escalada, e junta-se o espaço em falta.
  - As chaves não mudam, por isso os replays actuais continuam válidos.

**A3. Som do motor** (`public/src/som-motor.js`, novo; Web Audio, sem ficheiros)
- **Som:**
  - dois motores ligeiramente desafinados, com o batimento típico de bimotor;
  - tom de passagem das pás (rpm × 4 / 60 ≈ 110–135 Hz) e harmónicos;
  - ruído filtrado de turbina e de vento.
- **Controlo.** A potência, a velocidade e a distância da câmara controlam frequência, ganho e filtro. A potência passa a estar exposta em `voo.potencia`; hoje é calculada em `passoFisico`.
- **Arranque:**
  - o `AudioContext` é criado ou retomado de forma síncrona no clique, antes de qualquer `await` (por exemplo, antes de `await carregarReplay`, `main.js:705`);
  - no iOS, `navigator.audioSession.type = 'playback'` quando existir;
  - fade-in de 1,5 s.
- **Suspende** em pausa, com o separador escondido, no debrief e ao sair.
- **Botão.** Ícone «Som» no cabeçalho, com `aria-pressed` e a preferência em `localStorage` (try/catch). O rodapé já tem 6 botões que enchem os 390 px (`styles.css:306-308`).
- A função de mapeamento é pura e testada em Node.

**A4. Limites de custo**
- **`api/jev.js`:**
  - `momento` por tabela; um valor desconhecido dá 400 (hoje vira `incidente`, `:38-40`);
  - **Origin exacto:** `lus222.pixelgrammar.com`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL` e `VERCEL_BRANCH_URL`. Um curinga `lus222-jev-challenge*.vercel.app` aceitaria projectos alheios. Sem Origin, só com `VERCEL_ENV` por definir (local);
  - **erros do Gateway classificados pelo `statusCode`,** não pela regex da `:108`: 401 significa credenciais; 402/403/429 com orçamento ou quota passam a `erro: 'limite'`;
  - **limite por IP de 600/min.** O CGNAT móvel partilha IPs, e o limite em memória é por instância; o travão real é o orçamento.
- **Cliente:**
  - com `limite`, passa ao replay gravado, com aviso;
  - tecto de pedidos por missão;
  - nada com o separador escondido.
- **Vercel** (com confirmação): regra WAF de rate limit em `/api/jev`, 600 pedidos por 60 s por IP, se o plano da conta a incluir.

## Reorientação de 2026-09-25: simulador LUS-222, piloto humano ou JEV

A referência passa a ser o «JEV plays DOOM».
- O mundo corre sempre e o modelo decide várias vezes por segundo a partir de um estado em texto.
- Vê-se o que o modelo lê, os julgamentos com barras e confiança, a acção acesa, a latência, as decisões por segundo e o custo, e uma caixa de ordens.
- No LUS-222, **o JEV substitui o piloto humano**. Tem de ser dinâmico, nunca estático.

**Decisões do Fernando:**
- actuação directa como no DOOM;
- voo livre com um «director» de ameaças, e as missões como cenários;
- comparação lado a lado mais tarde;
- 25 USD/mês, com 5 min de voo JEV ao vivo por visita e voos gravados para o resto.

**O que já serve de base (feito):**
- B0: formato táctico validado, 14/14 nos casos tácticos;
- B1: relógio de passo fixo com desenho interpolado;
- B2: ameaças em movimento no mundo.

### Marcos

**M1. Simulador jogável** (modo novo; as missões actuais ficam intactas)
- **Actuação comum aos dois pilotos:**
  - lateral: esquerda / nivelar / direita;
  - vertical: subir / manter / descer;
  - potência: mais / manter / menos.
- **Controlador de intenção em `passoFisico`:**
  - rolamento até ±25°;
  - razão de subida até ±4 m/s;
  - acelerador por incrementos.
  - Sem ordem nova durante 0,6 s, volta a nivelar e a manter a altitude.
- **Piloto humano:** teclado (setas/WASD, Shift/Ctrl), botões de toque e comando.
- **Voo livre sobre o Porto no São João:**
  - circuito de pontos de passagem (Foz, Ponte D. Luís I, Ribeira, Matosinhos, Sá Carneiro);
  - um **director** com semente vai lançando 1–3 ameaças de cada vez (tráfego que cruza ou vira, balões, aves, células), com dificuldade crescente.
- **Supervisor determinístico:**
  - tipo TCAS: conflito previsto em 30 s → a manobra segura manda, com luz vermelha;
  - tipo GPWS: perto do terreno → subir.
- **Painel ao estilo DOOM:**
  - 3D à esquerda;
  - à direita, julgamentos, actuação acesa, «o que o JEV lê», contadores e ordens;
  - mini-mapa com o circuito, as ameaças e o rasto;
  - no telemóvel, empilhado.

**M2. O JEV pilota** (a ~3 Hz, uma chamada com 6 julgamentos em paralelo)
- **Julgamentos:**
  - `plano`: seguir rota / evitar ameaça / ganhar altitude / poupar combustível / aterrar;
  - `manobra`: as 7 candidatas;
  - `potencia`;
  - `ameacaPrioritaria`;
  - `urgencia`;
  - `foraDoEnvelope`.
- **Estado em categorias:** rota (à esquerda / em frente / à direita, desvio), perfil de altitude, velocidade, ameaças e consequências por candidata.
  - A candidata é aplicada 8 s e depois mantida, na previsão a 30 s.
  - Entram também as **ordens do comandante**: texto até 120 caracteres, com atalhos como «poupa combustível», «evita as nuvens», «voa baixo».
- **Instruções em inglês.**
- **Servidor:** `momento: 'piloto'`, com filtro de enums e das ordens.
- **Ciclo:** o pipeline de 2 pedidos da prova contínua, com cadência e retenção em passos. O relógio fica a 1× com o JEV aos comandos.
- **Contadores:** ms, decisões/s, USD acumulado, separação mínima.

**M3. Voos gravados e limites**
- **Gravação:** o gravador em Node voa o JEV no mesmo motor e grava as decisões com o passo em que foram aplicadas (formato v5 do B8).
- **Reprodução:** o site reproduz-as quando não há Gateway, quando o limite chega ou depois dos 5 min ao vivo por visita.

**M4. Porto reconhecível no São João**
- Vale do Douro, Ponte D. Luís I e Ribeira iluminada.
- Luzes da cidade e lanternas a subir do rio, a derivar com o vento.

**M5. Missões com o JEV aos comandos**
- Os 4 cenários passam a ser voados em contínuo:
  - com o estado estratégico em categorias (B3b);
  - com escalada ao PIC quando o `plano` muda com pouca confiança;
  - com aterragem assistida abaixo de 15 m, identificada.
- A comparação lado a lado com um fantasma (regra ou humano) e a consola (fase C) vêm depois.

**Custos.**
- Cada chamada tem ~3 mil tokens, a 3 Hz: ~0,02 USD por minuto, ~0,11 USD por 5 minutos.
- 25 USD/mês chegam para ~220 voos ao vivo de 5 min.

A secção B abaixo fica como referência técnica: B3, B4, B5, B7 e B8 são absorvidos pelos marcos M1–M3.

## Fase B — Ameaças em movimento e reflexos tácticos (PR 2)

**B0. Banco de casos** (`scripts/avaliar-jev.mjs` e `evidence/casos-jev.json`, novos)
- ~30 estados rotulados, tácticos e estratégicos.
- Mede, com instruções em PT e em EN:
  - acerto;
  - Brier;
  - calibração por faixa de confiança;
  - p50/p95.
- Escolhe a língua das instruções; a interface fica em PT.
- Dá números verificáveis para o post.

**Resultado do B0** (2026-09-25, `evidence/avaliacao-jev-2026-09-25.json`, 66 pedidos, 0,0075 USD)
- Tácticos: 14/14 em PT e em EN. A confiança acompanha a dificuldade: 0,98–0,99 nos casos claros e 0,37 no compromisso sem opção limpa.
- Estratégicos: 7/19 em PT e 8/19 em EN. O JEV prossegue mesmo com pista de 520 m, integridade a 30 % ou 4 min de janela clínica, porque tem de comparar números.
- EN: menos 9 % de tokens e melhor Brier (0,227 contra 0,250). Os erros vêm com menos confiança: 4 de 11 iriam ao PIC, contra 0 de 12 em PT.
- **Decisões (aprovadas):**
  - instruções ao JEV em inglês, com a interface em PT;
  - novo passo **B3b**: o estado estratégico também passa a categorias.

**B1. Relógio de passo fixo** (refactor puro, commit à parte)
- `avancarMissao` acumula tempo e avança só em passos inteiros de 0,1 s (`m.passo`).
- Com a opção `ateMarco`, pára no próximo marco:
  - gatilho de evento;
  - borda da janela táctica;
  - passo de despacho;
  - aplicação pendente.
- Os replays actuais continuam a passar (o teste avança 1 s de cada vez). A exactidão só é verificável depois do B8.

**B2. Ameaças no mundo** (`public/src/ameacas.js`, novo, puro, com `lib/ameacas.mjs`)
- `m.ameacas[]` guarda posição, velocidade e raio de cada ameaça. Cada uma nasce relativa ao avião no gatilho e depois move-se no mundo:
  - balões: vento mais subida, com dispersão por semente;
  - tráfego: velocidade constante, com viragem programada;
  - aves: vagueio com semente;
  - célula: deriva com o vento, com raio a crescer;
  - contacto SAR: deriva lenta.
- Funções: `passoAmeacas`, `cpa` (CPA/TCPA horizontal e separação vertical no CPA) e `separacoesMinimas`. Substituem `ameacaAtiva` e `localizarBaloes`.
- **A previsão usa velocidade constante.** O preditor e o JEV não conhecem a viragem programada, por isso a reacção é real.
- **Exequível.** As ameaças nascem a um TCPA de 30–45 s: com rolamento a 0,15 rad/s e subida ≤ 4 m/s, o avião só ganha dezenas de metros em < 10 s. Há um teste por cenário: um voo só com o supervisor mantém a separação.
- Perder a separação de qualquer ameaça termina a missão, como hoje.

**B3. Estado e perguntas tácticas** (`public/src/tatico.js`, novo, puro)
- **Candidatas em ordem fixa:** manter, esquerda, direita, subir, descer, esquerda_subir, direita_subir.
  - `descer` não existe a menos de 16 km do destino.
  - Piso: `min(180 m, altitudeRota)`, porque a rampa de descida fica abaixo de 180 m nos últimos 7,5 km.
- **Categorias por candidata.** Cada candidata é simulada 30 s à frente (generaliza `separacaoPrevistaM`, `simulacao.js:153`) e recebe:
  - separação: conflito / marginal / folgada, com a ameaça crítica;
  - regra do ar: de frente, vira à direita; convergente pela direita, dá passagem;
  - nuvem: calculada pela geometria das células, não pelo tecto global (os tectos de 198 m e 381 m estão abaixo dos 480 m de cruzeiro);
  - terreno;
  - desvio de rota;
  - conforto, que pesa no MEDEVAC.
- **Categorias por ameaça**, com ids a1–aN pela ordem estável de nascimento:
  - tipo;
  - posição em horas de relógio;
  - converge / afasta / paralelo;
  - tempo até ao CPA;
  - CPA se mantiver;
  - intenção: constante / a virar para nós / errática.
- **Perguntas** (`PERGUNTAS_TATICO`):
  - `manobraTactica` (choice, 7 opções);
  - `ameacaPrioritaria` (choice a1–aN);
  - `urgencia` (score 0–3);
  - `foraDoEnvelope` (boolean).
- **Servidor:** `momento: 'tatico'`, timeout de 3 s, sem retries. O filtro `lerEstadoTatico` aceita só enums.
- **Validação:** `validarRespostas(momento, answers, perguntas)` aceita domínios dinâmicos.

**B3b. Estado estratégico em categorias**
- O código calcula e o estado estratégico passa a trazer:
  - por destino: pista (suficiente / curta), combustível (com reserva / sem reserva) e distância (perto / longe);
  - janela clínica: folgada / apertada / esgotada;
  - integridade: normal / degradada / crítica;
  - meteorologia face aos mínimos: acima / no limite / abaixo;
  - luz: dia / crepúsculo / noite.
- Os números podem ficar para o painel, mas o JEV decide pelas categorias.
- Repetir o banco de casos: objectivo ≥ 15/19 nos estratégicos, sem perder os tácticos.

**B4. Ciclo táctico na missão** (`public/src/ciclo-tatico.js`, novo, com fetch injectado)
- **Pipeline reutilizado** de `piloto-corredor.js` (`novoPipelinePiloto`, `reservarPasso`, `concluirPasso`, `falharPasso`, `metricasPiloto`).
- **Relógio simulado.** Cadência (a cada 10 passos), retenção (30 passos), idade e backoff contam passos simulados. Cada bilhete leva `passoDespacho`.
- **Janela táctica:**
  - abre com uma ameaça a TCPA ≤ 45 s e CPA não folgado, ou a menos de 3 km;
  - fecha 3 s depois de todas passarem o CPA;
  - corre a 1× forçado (60 pedidos/min).
- **Pedidos:**
  - no máximo 2 em voo;
  - uma resposta é descartada por idade (> 30 passos) ou quando todas as ameaças do seu estado já passaram o CPA.
- **`comando` separa `missao` de `tatico`.** Uma decisão estratégica ou do PIC deixa de apagar a ordem táctica. Hoje `aplicarDecisao` reescreve o `comando` inteiro (`simulacao.js:226-260`) e o PIC força `manter` (`main.js:936`).
- **As perguntas estratégicas perdem `manobraVertical` e `manobraLateral`.** Actualizar em conformidade:
  - contrato;
  - `decisaoGeometrica`;
  - `avaliacao-sim.js` (`manobrasConformes`);
  - debrief;
  - Laboratório.
  - A prova contínua guarda o conjunto actual como `PERGUNTAS_CORREDOR`.
- **Ordem → alvos em `passoFisico`:**
  - rumo a ±25° do rumo para o destino;
  - altitude a ±120 m **medidos a partir de `altitudeRota`**, para que confirmações seguidas não façam o avião subir aos degraus;
  - `*_subir` recebe o reforço de potência de subida;
  - o temporizador da órbita pára durante a janela.
- **Eventos:**
  - os de ameaça abrem a janela, sem pergunta estratégica;
  - os estratégicos (luz, vento, frente, relógio, reserva, final) mantêm-se;
  - `aplicarDecisao` recebe o id do evento, em vez de o re-derivar (`simulacao.js:193`);
  - `revelarAte` passa a congelar o relógio, em vez de atrasar a detecção (`main.js:654,686`).
- `main.js` só liga o ciclo.

**B5. Supervisor contínuo**
- A cada 10 passos verifica a ordem activa, e não só as propostas novas. Um conflito previsto com qualquer ameaça dá a primeira candidata segura pela ordem fixa, com a seta vermelha.
- Numa falha (backoff ou 5 erros seguidos), a missão continua em «só supervisor», identificada no ecrã, em vez de abortar.

**B6. Cenários com movimento** (São João primeiro)

| Cenário | O que se move |
|---|---|
| São João / Porto | Porto reconhecível (Ponte D. Luís I, Ribeira iluminada, foz do Douro), trazido da fase 2 do desenho de cenários. Lanternas a subir do Douro e a derivar no corredor (km 32). Helicóptero pela direita que vira para o LUS-222 a meio (km 60). Partida de frente a subir do Porto (km 85; ambos à direita). Gaivotas na final (km 151). |
| MEDEVAC Açores | Célula da frente a atravessar o corredor. Tráfego inter-ilhas. O relevo costeiro fica fixo. |
| Carga Ponte de Sor | Cegonhas com vagueio perto do Alqueva. Tráfego militar rápido e baixo perto de Beja (TCPA curto). |
| SAR costa | Contacto a derivar (a consola reporta a posição). Tráfego civil a cruzar o sector. |

**B7. Visual** (`world.js`, `marcas-missao.js`)
- **Malhas de ameaça:**
  - persistentes por id, posicionadas a partir da simulação com `pontoMundo` menos `origemVisual`;
  - nunca movidas pelo dt do frame; hoje `actualizarAmeacas` move o tráfego com o dt (`world.js:348-368`), o que daria movimento a dobrar e movimento com o relógio parado;
  - libertadas ao sair, como faz `limparGrupo` (`:35-49`).
- **O corredor mantém o seu caminho** (`mostrarAmeacas` por frame, `main.js:255`).
- **Geometria barata:**
  - lanternas e gaivotas instanciadas;
  - todas as trajectórias previstas (15 s, tracejado) num só `LineSegments`, com uma marca no CPA.
- **Leitura da decisão:**
  - anel branco na ameaça prioritária do JEV;
  - trajectória prevista do LUS-222;
  - `focarEvento` com histerese quando a prioritária muda.
- **Gaveta:** fita táctica com as últimas 6 decisões (estilos de `pilot-tape`); o selo actualiza a cada decisão.
- `renderer.info.render.calls` < 150.

**B8. Replays v5** (`scripts/record-replays.mjs`)
- **Antes de regravar,** congelar as respostas que a prova contínua usa em `public/replays/piloto.json`: medevac/relevo, carga/aves e sar/trafego, via `selecionarRespostaReplay` (`piloto-corredor.js:186-203`). Esses eventos deixam de existir.
- **Gravador como ciclo de eventos discretos**, com o mesmo avançador de passos:
  1. No passo de despacho k, congela a simulação, chama o Gateway e mede os ms.
  2. Agenda a aplicação no passo k + ⌈ms/100⌉.
  3. Mantém até 2 pedidos em voo.
  4. Descarta sequências antigas e regista os descartes.
- As decisões estratégicas aplicam-se no passo do gatilho.
- **Por decisão, o ficheiro guarda:**
  - `passoDespacho` e `passoAplicacao`;
  - o hash da entrada;
  - a resposta.
- **Por ficheiro, o ficheiro guarda** o hash das perguntas.
- `PERFIL.versao` passa a `ilustrativo-4`; regravar os 4 cenários custa ~0,05 USD.
- Alinhar a porta por omissão do gravador (43124 no script, 43123 no npm).
- **Debrief por ameaça:**
  - separação mínima;
  - número de decisões e de mudanças de ideia;
  - p50/p95;
  - vetos;
  - escaladas;
  - divergências com a regra «maior folga», e porquê.

**B9. Prova contínua.** `folgasCandidatas` passa a ter classe categórica e ordem fixa (sem `.sort`, `:177`).

**Testes que mudam:**
- `simulacao.test.mjs` (122-183 e 201-225);
- `ameaca-visual.test.mjs`;
- `fator-tempo.test.mjs` (:37);
- `decisao.test.mjs` (190-222);
- `debrief.test.mjs`;
- `perguntas.test.mjs`;
- `piloto-corredor.test.mjs` (204-220);
- `avaliacao-sim.test.mjs`;
- `escala.test.mjs` (`poseMissao` lê `comando`).

## Fase C — Consola de operações: o JEV opera o ecrã (PR 3)

**C1. Modelo puro** (`public/src/consola-modelo.js` e `consola-tarefas.js`, com `lib/*.mjs`)
- O ecrã é um conjunto de janelas com elementos: id, papel, rótulo, valor, opções e estado activo.
- Funções:
  - `aplicarAccao`;
  - `serializar` (árvore ao estilo de acessibilidade);
  - critérios de conclusão;
  - perturbações com semente.

**C2. Tarefas disparadas pela missão**
- **Porto:**
  - PIREP dos balões à Torre (perigo, sector, altitude, intensidade → Enviar);
  - pedido de pista e ETA na aproximação;
  - plano de voo actualizado, se desviar.
- **MEDEVAC:**
  - notificar o hospital;
  - pedir ambulância;
  - perturbação «UCI sem vaga»: o JEV fecha o alerta e muda o hospital, o que gera um evento estratégico no voo. É o que fecha o ciclo entre terra e bordo; o passo de entrada fica gravado.
- **Carga:** pedir slot em Beja e actualizar a massa no manifesto.
- **SAR:** reportar ao MRCC a posição do contacto, que vai derivando, e pedir meio de resgate.

**C3. Perguntas e guarda** (`momento: 'consola'` e `'consola-verificar'`)
- **O cliente envia só ids** (tarefa, elementos e valores). O servidor reconstrói rótulos e opções a partir do catálogo partilhado (`consola-tarefas.js`), por isso nenhum texto do cliente entra nas perguntas. Limite de ≤ 40 elementos.
- **Perguntas:**
  - `proximaAccao`: choice entre os elementos accionáveis, «esperar» e «concluir». «Concluir» só é aceite se os critérios de conclusão do código se cumprirem.
  - `valorCampo`: choice especulativa, no padrão de `destinoPreferido`.
- **Guarda antes de Enviar ou Transmitir** (padrão do eve):
  - `aprovacao` (seguir / cautela / bloquear) é encaminhada pela sua confiança; `coerenteComEstado` pela probabilidade.
  - «Seguir» com confiança ≥ 0,9 executa.
  - Nos outros casos, pergunta «Confirmar?» ao visitante; esgotado o tempo, cancela.
  - «Bloquear» cancela e regista.

**C4. Vista** (`public/src/consola.js`, DOM, sem dependências)
- Janelas «TORRE PORTO», «DESPACHO LUS-222», «HOSPITAL» e «MRCC».
- **Cursor:**
  - cursor SVG animado (~350 ms);
  - clique visível;
  - escrita letra a letra.
- Registo por passo: «JEV · 412 ms · clicar Enviar (0,93 · conf 0,88)».
- Painel «O que o JEV vê».
- **Desktop:** janela flutuante em baixo à esquerda, que cresce enquanto há tarefa.
- **≤ 760 px:** separador «Consola» na gaveta existente (Decisão | Consola), mais uma faixa de uma linha por cima dos controlos durante a tarefa.

**C5. Replay e texto**
- O gravador corre as tarefas no modelo puro, em Node, e o browser reproduz com as latências gravadas.
- Texto fixo: «O JEV não vê píxeis: lê a descrição estruturada do ecrã e escolhe a próxima acção. O cursor executa-a.»

## Fase D — «Pilota tu, o JEV é o copiloto» (PR 4, depois da B)

Aprovada a 2026-09-25. Reaproveita as ameaças, as categorias, o ciclo táctico e o supervisor da fase B.

**D1. Comandos.**
- Teclado: setas ou WASD para rolamento e arfagem, Shift/Ctrl para a potência.
- Toque: um joystick virtual.
- Comando: a Gamepad API.
- O visitante dá intenções, não mexe em superfícies de controlo: os comandos viram alvos de rumo e altitude em `passoFisico`, os mesmos alvos da B4.

**D2. Copiloto JEV.** A cada segundo, na janela táctica, o JEV recebe o estado táctico da B3 com a manobra do visitante como candidata «tua» e responde:
- `aprovacaoManobra`: choice entre seguir, cautela e perigo, no padrão de guarda do eve;
- `manobraSugerida`: a mesma choice táctica;
- `urgencia`.

O JEV só aconselha: não tira o controlo ao visitante.

**D3. Quem tem o controlo.**
- Por omissão, o visitante.
- O supervisor determinístico toma a manobra quando há conflito previsto (seta vermelha, «O supervisor assumiu») e devolve-a quando o conflito passa.

**D4. HUD.**
- Aviso do copiloto com a confiança, por exemplo «Cautela · helicóptero a convergir pela direita · 0,82».
- Seta da manobra sugerida.
- Estado do controlo.

**D5. Debrief.** Visitante contra JEV:
- separações mínimas;
- avisos seguidos e ignorados;
- tempo de reacção;
- vezes que o supervisor assumiu.

**Custos e limites.** Iguais aos da B: um pedido por segundo, só na janela táctica.

**Replay.** O modo é só ao vivo, porque o voo é humano. Sem Gateway ou com o limite atingido, mostra uma demonstração gravada do copiloto, identificada.

**Verificação.**
- Teclado e toque a 390 px; comando, se houver um disponível.
- Testes das funções puras que convertem comandos em alvos e que decidem o controlo.

## Custos (a partir de 25/09)

- **Tokens por pedido:** ~2 mil no táctico, ~3,1 mil no estratégico e ~2 mil na consola.
- **São João:**
  - ~120 pedidos tácticos, ~6 estratégicos e ~25 da consola;
  - ≈ 0,3 M tokens, ≈ 0,013 USD por missão.
- **Escala:** 1000 missões ≈ 13 USD, e 25 USD/mês ≈ 1900 missões.
- **Por visitante:** ≤ ~90 pedidos/min, muito abaixo do limite de 600/min por IP.

## Ficheiros críticos

- **Novos em `public/src/`:** `painel-jev.js`, `confianca.js`, `som-motor.js`, `ameacas.js`, `tatico.js`, `ciclo-tatico.js`, `consola-modelo.js`, `consola-tarefas.js`, `consola.js`.
- **Outros novos:**
  - `lib/*.mjs` e testes;
  - `scripts/avaliar-jev.mjs`;
  - `evidence/casos-jev.json`;
  - `public/replays/piloto.json`.
- **Alterados em `public/src/`:** `simulacao.js`, `decisao.js`, `contrato-jev.js`, `main.js`, `world.js`, `marcas-missao.js`, `piloto-corredor.js`, `avaliacao-sim.js`, `debrief.js`.
- **Outros alterados:**
  - `lib/perguntas.mjs`;
  - `api/jev.js`;
  - `public/index.html`, `public/styles.css`;
  - `scripts/record-replays.mjs`;
  - `public/replays/*.json` (regravados);
  - `README.md`.
- **Apagado:** `public/src/ui.js` (morto; `barras()` passa para `painel-jev.js`).
- **Plano:** copiado para `docs/plans/2026-09-24-missoes-movimento.md`.

## Reutilizar

- **Pipeline e controlador** de `piloto-corredor.js`:
  - `novoPipelinePiloto`, `reservarPasso`, `concluirPasso`, `falharPasso`, `metricasPiloto`;
  - semântica de retenção de `aplicarOrdemPiloto` e `actualizarOrdemPiloto`.
- **Backoff e AbortControllers** de `processarPassoPiloto` e `avaliarPassoPiloto` (`main.js:403-521`).
- **Simulação e tempo:** `separacaoPrevistaM` (`simulacao.js:153`), `fatorTempo` e `mulberry32` (`decisao.js:39`).
- **Mundo 3D:**
  - construtores de `meshAmeaca` (`world.js:103`) e o padrão por id de `mostrarAmeacasFixas` (`:229`);
  - `limparGrupo` (`:35`);
  - `focarEvento` e `camara-modos.js`;
  - `pontoMundo` (`escala.js`);
  - etiquetas de `marcas-missao.js`.
- **Interface:** `barras()` (`ui.js:13`), `pic-overlay` e `btn-pic-apply` (`main.js:906,933`).
- **Padrões:**
  - pergunta especulativa, como `destinoPreferido`;
  - script ao estilo de `check-counterfactuals.mjs`.

## Execução

- Passo 0, depois um PR por fase, pela ordem A → B (com o Porto reconhecível) → D → C (ordem revista a 2026-09-25).
- Um commit por mudança lógica; os refactors (B1, B9) ficam à parte.
- Cada tarefa segue implementador → revisão de especificação → revisão de qualidade, com TDD nas funções puras.
- Nada vai para `main` sem confirmação. A Vercel e as gravações ao vivo são pedidas antes.
- Marco para o LinkedIn: A + B (São João) já mostram movimento; D dá o simulador e C completa o «computer use».

## Verificação

**Sempre**
- `npm test` e `npm run lint`.
- Browser interno em modo replay, a 1440×900 e 390×844, sem erros na consola.
- `?sem-webgl=1` continua a funcionar.

**Fase A**
- Painel com distribuições e confiança nos 4 replays.
- Escalada ao PIC com um estado ambíguo do Laboratório: o relógio congela e o tempo esgotado aplica a escolha do JEV.
- Som:
  - `AudioContext.state` fica «running» depois do clique;
  - suspende em pausa e com o separador escondido;
  - o botão silencia.
- `curl` com Origin alheio dá 403. Com `JEV_RATE_LIMIT_PER_MIN=5`, passa ao replay com aviso.

**Fase B**
- **Testes das funções puras:**
  - cinemática;
  - CPA/TCPA (de frente, cruzado, paralelo);
  - categorias e regras do ar.
- **Testes de comportamento:**
  - uma decisão estratégica não apaga a ordem táctica;
  - um voo só com o supervisor mantém a separação em cada cenário.
- **Exactidão:**
  - frames de dt variável, a 1× e a 8×, dão a mesma trajectória, passo a passo, que o gravador;
  - os replays v5 reproduzem eventos, decisões no passo exacto, resultado e tempo;
  - `piloto.json` mantém a prova contínua em replay.
- **São João ao vivo**, do princípio ao fim. Medir:
  - pedidos/min;
  - p50/p95;
  - tokens e custo;
  - separações;
  - vetos.
- **Desempenho:**
  - ≤ 150 chamadas de desenho;
  - `renderer.info.memory` estável entre missões;
  - fps no limite do ecrã nos dois perfis.

**Fase C**
- **Testes:**
  - modelo;
  - serialização;
  - reconstrução dos rótulos no servidor;
  - limiares da guarda.
- **Tarefa ao vivo:**
  - com o cursor;
  - «UCI sem vaga» gera o evento no voo;
  - a consola em replay fica idêntica à gravação.

## Fora do âmbito

- Avião fantasma a voar a regra geométrica.
- Computer use real da Anthropic: exige um browser alojado (Vercel Sandbox ou Browserbase) e leva segundos por passo.
- Geografia reconhecível (fase 2 do desenho de cenários).
