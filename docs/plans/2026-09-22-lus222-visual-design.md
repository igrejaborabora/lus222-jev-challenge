# Desenho visual do LUS-222

## Objectivo

Tornar o LUS-222 da missão reconhecível a partir dos renders públicos da aeronave branca CS-001, sem alterar o voo, as decisões JEV ou o desempenho esperado no perfil leve.

## Referências

- Render do projecto já incluído em `public/img/lus-222-hero.png`.
- Vista frontal: https://expresso.pt/economia/transportes/2025-04-02-portugal-apresenta-o-primeiro-aviao-civil-militar-lus-222-e-procura-contratos-no-brasil-ec06ef12
- Vista lateral e rampa: https://www.akaer.com.br/post/akaer-%C3%A9-selecionada-para-produzir-estruturas-da-aeronave-lus-222-1
- Vistas de três quartos: https://www.ceiia.com/products-aeronautics e https://www.portugalglobal.pt/media/04enrmj1/revista-176-junho.pdf

Estas imagens são referências de forma. A aplicação continua a usar geometria e decalques próprios; não incorpora imagens externas como texturas.

## Arquitectura

Refinar `criarLus222()` em `public/src/world.js`. Manter a interface actual: um `THREE.Group` com nariz em +Z, escala 1,35 e `userData.props` para `aplicarPose()`. Não acrescentar dependências nem carregamento assíncrono. A câmara e o autómato permanecem independentes da malha.

## Componentes

- Fuselagem: secções com transições mais suaves, nariz alongado e cauda afilada para a rampa.
- Cabine: dois painéis frontais escuros e laterais angulados; vigias laterais alinhadas com a fuselagem.
- Asa alta: bordo de ataque e de fuga afunilados, espessura visível, pontas marinhas e naceles arredondadas.
- Hélices: quatro pás por motor, mantendo os pivôs existentes para animação.
- Empenagem: deriva marinha e estabilizador alto em T com silhueta afunilada.
- Trem fixo e rampa: volumes e posições mais próximos das vistas frontal e lateral.
- Decalques: preservar a identidade tipográfica que o projecto já usa.

## Funcionamento e falhas

A malha é construída sincronamente como hoje. As geometrias mais detalhadas continuam pequenas e não exigem rede; se WebGL não estiver disponível, mantém-se a mensagem de fallback já existente. O perfil leve continua a usar os mesmos objectos, sem texturas novas.

## Validação

Verificar a silhueta e o enquadramento em vistas frontal, lateral e chase, incluindo viewport estreito. Executar `npm test`, verificação sintáctica dos ficheiros alterados e o lint disponível no projecto. Não acrescentar testes que apenas contem peças da malha; a verificação principal é visual e funcional no browser.
