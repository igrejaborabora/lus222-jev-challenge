# Experiência de simulador — plano de implementação

> Execução: aplicar a skill executing-plans, por entregas verificáveis.

**Objectivo:** tornar subidas, descidas e assistências legíveis, evoluindo depois para pilotagem assistida mais completa e modo avançado opcional.

**Arquitectura:** manter os módulos JavaScript, o motor de passo fixo e o mundo Three.js. Os instrumentos derivam do estado do motor, sem o modificar. Novas leis de voo terão versão própria, partilhada por física, previsão, supervisor e reprodução.

**Stack:** JavaScript ESM, HTML/CSS, SVG, Three.js, node:test, ESLint; sem novas dependências.

## Contexto aprovado

Plano apresentado a Fernando em 27/09/2026; instrução seguinte: «avança com o plano». Opção de trabalho: voo acessível com modo avançado posterior. A primeira entrega é instrumentação e clareza das assistências. Trabalho isolado de main; o checkout feat/m5-missoes-jev contém alterações locais da camada estratégica e não será incluído nesta entrega.

## Entrega 1 — instrumentos e assistências

### 1. Modelo de telemetria
- Criar `public/src/instrumentos.js` e `lib/instrumentos.test.mjs`.
- Testar conversões kt/ft/ft-min, rumo normalizado, AGL sobre o mesmo relevo, velocidade sobre o solo com vento, consumo e autonomia ilustrativos.
- Identificar separadamente piloto seleccionado, fonte efectiva e intenção vertical; prioridade para final assistida e supervisor. Não inferir comando apenas da atitude.
- Testar subida, descida, estabilização, supervisor e reprodução. Validar que obter instrumentos não altera o estado.
- Comando: `node --test lib/instrumentos.test.mjs`.

### 2. Painel principal
- Criar `public/src/instrumentos-ui.js`; integrar em `public/src/simulador-ui.js`, `public/index.html` e `public/styles.css`.
- Horizonte SVG com escalas de arfagem e inclinação; velocidade, altitude, VSI, rumo, AGL, potência e combustível. Usar o voo interpolado para o horizonte e telemetria a 10 Hz para números.
- Mostrar alvo de altitude quando a manutenção está activa, intenção e razão vertical efectiva.
- Secção de sistemas: consumo, autonomia estimada, massa e velocidade sobre o solo. Não chamar IAS ao valor actual, que não modela um sensor pitot.
- Painel JEV recolhível, mantendo instrumentos e comandos acessíveis. Ajuda de teclado contextual.
- Teclado não captura teclas em campos, selecções, ajuda ou conteúdo editável; limpar ordens de toque e teclado ao pausar, desfocar ou mudar piloto.

### 3. Verificação e publicação
- `npm test`, `npm run lint`, `npm run build`.
- Smoke no browser: humano, subida, descida, pausa, troca para gravação, painel JEV, desktop e telemóvel. Verificar horizonte, foco e sobreposição de controlos.
- Actualizar README com instrumentos, unidades e limitações.
- Commit focado, push, PR e merge após CI verde, conforme instruções globais.

## Entrega 2 — física vertical e controlos progressivos
- Ficheiros: `simulacao.js`, `piloto-sim.js`, `estado-piloto.js`, `voo-gravado.js` e testes correspondentes em lib.
- Introduzir perfil versionado; manter reprodução de gravações anteriores ou rejeitar versões incompatíveis explicitamente.
- Separar atitude, ângulo da trajectória e razão vertical. Integrar troca de energia entre subida/descida e velocidade com limites ilustrativos documentados.
- Manter modo assistido; adicionar selecção de altitude, razão vertical e rumo. Manete contínua com entrada comum a humano e JEV.
- Ensaios determinísticos: subir perde velocidade sem potência suficiente; descida e nivelamento não criam energia; alvo capturado sem oscilação excessiva; previsões iguais à trajectória executada.
- Revalidar banco táctico e protecções de terreno/separação antes de gerar novas gravações.

## Entrega 3 — vista de pilotagem e configuração
- Ficheiros: `camara-modos.js`, `world.js`, `lus222.js`, instrumentos e entradas de controlo.
- Vista frontal com horizonte estável; superfícies animadas a partir do estado real dos comandos.
- Confirmar documentação do LUS-222 antes de definir flaps ou sistemas de motor. O modelo actual tem trem fixo; não inventar comando de retracção.
- Flaps com efeito em sustentação/arrasto e limites; trim e leme no modo avançado apenas quando a física representar esses eixos.
- Luzes com efeito visível; gamepad com zona morta e tratamento de desconexão.
- Smoke de câmaras, eixos, gamepad e toque; teste de desempenho em dispositivo móvel.

## Entrega 4 — ciclo de voo e treino
- Depende da integração do M5 em main e das entregas 2–3.
- Descolagem, movimento no solo, travões e aproximação guiada; final assistida explícita e borrego. Aterragem manual numa subentrega posterior.
- Exercícios de altitude, rumo e aproximação; relatório com estabilidade, precisão e suavidade do toque.
- Testes de transições solo/ar, aterragem e borrego; GPWS dependente da fase, sem permitir atravessar terreno fora da pista.

## Critérios transversais

Sem valores de motor fictícios, sem novas chamadas JEV para desenhar instrumentos, sem alterações locais M5 incluídas por engano. Avisos usam texto além da cor. Valores dinâmicos não são regiões aria-live contínuas. Qualquer estimativa de autonomia é identificada como simulação e não como reserva operacional.

## Estado

- Entrega 1: implementada e validada. 236 testes, lint e verificação de assets passam. Smoke Chromium: gravação → humano → subida/descida → pausa; painel aberto/fechado em 1440×1000, 1024×768, 768×1024, 390×844 e 360×640, sem sobreposição dos instrumentos com os comandos. Sem erros JavaScript; endpoint /api/jev indisponível no servidor estático, usando a gravação identificada. JEV ao vivo não foi exercitado.
- Entregas 2–4: implementadas na continuação `2026-09-27-voo-porto-meteorologia.md`, em perfil de treino independente. Limites: cockpit frontal sem interior modelado; Porto procedural sem cartografia real; flaps/trim/leme ilustrativos; integração estratégica M5 local preservada fora desta entrega.

## Correcção de interacção vertical — 27/09/2026

Relato de Fernando: «o avião nem desce nem sobe». Reprodução no browser mostrou dois casos: o voo inicia no JEV e ignora comandos manuais; um clique breve, mesmo no modo humano, termina antes de produzir deslocação visível. Uma tecla mantida funciona.

Correcção: comandos verticais seleccionáveis por clique (Subir / Nivelar / Descer), com indicador de selecção, repetição do botão activo para cancelar e tomada de controlo automática. O teclado vertical cancela a selecção persistente e actua enquanto premido. Pausa, desfocagem e troca de piloto limpam a selecção. O supervisor continua prioritário. Respostas JEV pendentes são ignoradas após a passagem para humano, incluindo erros de cancelamento.

Verificação: cinco novos testes de selecção, prioridades e altitude real; regressão de browser inicialmente falhou e passou após a correcção. No smoke: 1575 → 1632 ft a subir, 1577 ft após descer e estabilização em 1574 ft. Teclado/Espaço, pausa, tomadas de controlo com pedidos simulados pendentes, layout aberto/fechado e cena WebGL verificados. Esta correcção de entrada não antecipa a mudança de física da entrega 2.
