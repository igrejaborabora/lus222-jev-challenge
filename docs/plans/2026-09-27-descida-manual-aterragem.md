# Descida manual e aterragem — plano de correção

**Objectivo:** comandos que inclinam o avião progressivamente, descida perceptível no cenário e liberdade de aterrar ou colidir no voo manual.
**Arquitectura:** novo perfil de física interactiva, com atitude manual persistente e opção explícita de protecção. Missões/gravações anteriores e comando JEV mantêm assistências. Câmara de cauda acompanha a direcção vertical do nariz sem falsificar altitude.
**Stack:** módulos JS, Three.js, node:test; sem dependências.

## Diagnóstico reproduzido
- Descer no modo assistido pede apenas −4 m/s; à velocidade de cruzeiro o nariz continua positivo devido ao ângulo de ataque.
- Ao chegar a ~60 m AGL, o supervisor sobrepõe uma subida, mesmo com Descer activo. A fotografia recebida mostra depois um pedido de manter altitude.
- Câmara de cauda ignora pitch e conserva quase o mesmo horizonte. Teclas libertadas regressam automaticamente a nivelamento.

## Implementação e validação
1. `lib/voo-manual.test.mjs`: reproduzir descida que ultrapassa 4 m/s, atitude persistente ao largar, colisão sem protecção, protecção opcional/IA, contacto manual suave e borrego. Executar e confirmar falhas antes da implementação.
2. `voo-progressivo.js`, `simulador.js`, `simulacao.js`: humano em atitude livre, pitch progressivo limitado numericamente a −80°/+40°, sem piso protector implícito. Nivelar explícito e contacto com atitude preservada na colisão. Não acumular comandos no solo.
3. `comandos-ui.js`, `simulador-ui.js`, `index.html`, `styles.css`, instrumentos: cliques ±5°, teclas/gamepad inclinam enquanto premidos; ao largar conservam atitude. Picar, ajuste fino do nariz e selector de protecções claros. Assistência fica explícita e JEV conserva supervisão.
4. `camara-modos.js` e testes: câmara de cauda segue pitch para tornar descida/picada visível e manter enquadramento desktop/mobile.
5. Browser: iniciar humano, comando Descer produz nariz baixo e terreno perceptível, picada termina em colisão, final manual toca na pista e trava, modo assistido continua disponível, IA e pausa continuam coerentes. Testes completos, lint, build, PR/CI/merge e confirmar produção.


## Copy e apresentação
- Interface em inglês (hero, missões, simulador, decisões, treino, debrief e laboratório).
- Hero: “Meet JEV. Your AI copilot.” Explica que o modelo TypeSafe lê o estado do voo e escolhe manobras. Referências ao AI Gateway removidas da apresentação; contrato e dados históricos preservados.
- Câmara humana deixa de apontar automaticamente para ameaças; avião visível acima dos instrumentos em desktop e portrait.

## Validação concluída antes do PR
- 290 testes, lint, build e diff check passaram.
- WebGL: descida de 1575 para 1481 ft, nariz −5°, razão −3060 ft/min; Level estabilizou a 10 ft/min; picada atingiu −28° e −11670 ft/min antes de terminar em colisão. Nenhum erro JavaScript.
- Browser com controlos reais da UI: aterragem manual sem guia, toque 1,1 m/s, desvio lateral 0,1 m e travagem até parar.
- Browser: humano inicial sem pedidos JEV, IA protegida com decisão visível, retoma humana cancela pedidos, gamepad conserva atitude ao centrar, trim neutralizado por Level, modo assistido e descolagem por toque.
- Revisão encontrou dois casos adicionais (Level com trim e rotação por botão); testes reproduziram as falhas antes das correções e passaram depois.
- Publicação e smoke de produção: executar após CI verde.
