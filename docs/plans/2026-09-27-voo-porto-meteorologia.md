# Voo progressivo, Porto e meteorologia — implementação

> Execução: executing-plans; integração e verificação por entrega. Autorizado por Fernando: avançar nas entregas 2–4 e melhorar Porto, anoitecer e meteorologia.

**Objectivo:** pilotagem progressiva com voo completo e treino num Porto mais legível.
**Arquitectura:** conservar física ilustrativo-3 para missões/gravações existentes; perfil novo apenas no simulador interactivo, com passo fixo e preditor partilhado. Cenário procedural sem novas dependências ou serviços. Sistemas ilustrativos, sem alegar curvas certificadas do LUS-222.
**Stack:** módulos JavaScript ESM, Three.js, HTML/CSS, node:test.

## 1. Física e ciclo de voo
- Criar `public/src/voo-progressivo.js` e `lib/voo-progressivo.test.mjs`: energia, atitude distinta da trajectória, comandos contínuos, alvos, flaps, trim/leme, travagem e contacto com pista.
- Integrar em `simulacao.js`, `simulador.js`, `piloto-sim.js`, `voo-gravado.js`. Perfil versionado, replay antigo explícito, preditor no mesmo passo. GPWS permite aproximação dentro de corredor válido, conserva protecção fora dele.
- Treino isolado das alterações M5 locais: partidas na pista, final ou no ar; exercícios de altitude/rumo/aproximação, avaliação determinística e borrego.
- Verificar energia, captura, stall, comandos fora de gama, solo/ar, aterragem segura/dura/fora da pista, borrego, replay e igualdade da previsão.

## 2. Cockpit, sistemas e entrada
- `camara-modos.js`, `lus222.js`, `gamepad.js`: vista frontal, superfícies a partir do estado, comando standard com zona morta.
- `simulador-ui.js`, `index.html`, `styles.css`, `instrumentos.js`: painel recolhível de voo, potência 0–100%, selecção ALT/VSI/HDG, flaps, modo avançado, trim, leme, travão, luzes, treino e meteorologia.
- Supervisor tem prioridade. Entrada manual cancela alvos do eixo; pausa/desfocagem/desconexão limpam entradas transitórias; gamepad parado não toma o controlo.

## 3. Porto e atmosfera
- `porto-detalhe.js`, `terreno.js`, `ceu.js`, `ambiente-visual.js`, `meteorologia.js`, integração em `world.js`.
- Casario/vias/parques/marcos leves ancorados ao relevo; bases partilhadas com colisões. Vista ilustrativa, não cartografia de navegação.
- Anoitecer por defeito com luz suficiente; dia e noite seleccionáveis. Céu limpo, poucas nuvens, encoberto, chuva, tempestade e cobertura ajustável. Chuva explícita, rajadas determinísticas na física; relâmpagos discretos sem flashes em movimento reduzido.

## 4. Verificar e entregar
- Baseline: 241 testes aprovados.
- `npm test`, `npm run lint`, `npm run build` e browser desktop/mobile: entrada, comandos, alvos, treino, meteorologia, luz, câmara e gamepad simulado.
- Rever alterações, documentar limites, commits por mudança lógica, push, PR e merge com CI verde.

## Validação e decisões
- Física antiga preservada. Nova física: testes de energia, captura ALT/HDG, flaps, trim/leme, previsão igual à execução, solo/descolagem, toque/travagem, aterragem dura, fora da pista, borrego e avaliação. Aproximação guiada pára na pista em cinco presets.
- Revisão corrigiu eixos antigos do gamepad nas previsões, autoridade do supervisor, trim no borrego e rumo de rolagem após vento lateral.
- UI/browser: subida +570 ft/min, descida −790 ft/min, cancelamento de alvo manual, potência sem reposição após Q, solo a 9 kt, guia, borrego, pausa e layout 390×844, sem erros JS.
- Pedido adicional: humano por defeito, selector IA violeta, decisão no palco independente do painel e luzes intermitentes com movimento reduzido respeitado.
- Produção anterior também foi testada: comandos verticais funcionam, mas subida lenta a potência baixa e cenário escuro dificultam a percepção.
- Base cartográfica escolhida: representação procedural leve sem serviço externo; colocação ilustrativa de marcos e casario. Não foram publicados novos dados M5 ou novas gravações JEV.

- Validação final local: **275 testes**, lint e build aprovados. Browser desktop/mobile sem erros JS; IA simulada em 15 respostas válidas, decisões visíveis com painel fechado, comando manual retoma controlo, gamepad cancela o comando vertical anterior e desliga sem o repor.
- Percepção da subida/descida: trajectória verde no horizonte artificial, ângulo TRAJ e razão vertical com seta/cor, calculados a partir do movimento real. A vista de cauda acompanha a altitude; o nariz pode estar positivo numa trajectória descendente devido ao ângulo de ataque.
