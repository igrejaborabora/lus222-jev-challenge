# JEV / Mesa de missão LUS-222

Demonstração independente de decisões estruturadas do [`typesafe-ai/jev`](https://vercel.com/ai-gateway/models/jev), via Vercel AI Gateway, numa missão **ilustrativa** do LUS-222. O JEV recebe estado numérico e textual; **não vê** a cena 3D, imagens ou o Google Maps. A aeronave e a física não representam desempenho certificado, instrução aeronáutica ou procedimentos operacionais.

O cenário principal é **São João / Porto**: uma aproximação hipotética ao Aeroporto Francisco Sá Carneiro entre o fim da tarde e a noite de 23 de junho. Balões transportados pelo vento, tráfego, luz e vento criam decisões sucessivas. MEDEVAC Açores, Carga Ponte de Sor e SAR costa continuam disponíveis.

Desenvolvido pela Pixelgrammar com o Claude Opus 5.5 (Anthropic). Quem pilota e decide, no simulador e nas missões, é o JEV.

## Simulador LUS-222: o JEV aos comandos

O botão **Voar o LUS-222** abre um simulador de voo livre sobre o Porto, na noite de São João. O mundo corre sempre e o piloto pode ser humano ou o JEV. A referência é o «JEV plays DOOM»: o JEV decide cerca de 2,5 vezes por segundo, e o ecrã mostra, a cada decisão, o que ele leu, os julgamentos com as probabilidades, a acção que ficou acesa, a latência, as decisões por segundo e o custo.

- **Circuito:** Foz do Douro, Ponte D. Luís I, Aeroporto Francisco Sá Carneiro e Matosinhos.
- **Director de ameaças:** lança de 1 a 3 ameaças em simultâneo (balões de São João com o vento, tráfego que cruza, helicóptero que vira a meio, gaivotas, células de trovoada), apontadas a encontros quase em rota e deterministas pela semente.
- **Actuação comum ao humano e ao JEV:** esquerda/direita, subir/descer e potência, em comando de intenção (25° de pranchamento, 4 m/s de subida). O humano usa setas/WASD e E/Q, ou os botões de toque.
- **Supervisor determinístico, sempre activo:** tipo TCAS, um conflito previsto a 30 s faz a manobra com mais margem mandar; tipo GPWS, perto do terreno sobe. O JEV nunca é a última barreira.
- **O que o JEV recebe:** só texto em categorias, calculadas em código:
  - a rota para o próximo ponto;
  - a altitude e a velocidade face ao perfil;
  - as ameaças em horas de relógio;
  - para cada uma das 7 manobras candidatas, a separação prevista a 30 s, a regra do ar, a nuvem, o terreno, se aproxima ou afasta da rota e a altitude;
  - as ordens do comandante (texto livre até 120 caracteres).

  O servidor só aceita valores das listas. Seis perguntas correm em paralelo numa chamada: plano, manobra (escolhida por eliminação), potência, ameaça prioritária, urgência e fora do envelope.
- **Limites:** 5 minutos de voo JEV ao vivo por visita; depois, sem Gateway ou com o orçamento esgotado, o JEV pilota um **voo gravado**. Esse voo é real: o `scripts/gravar-voo-jev.mjs` voa o JEV no mesmo motor e guarda, por decisão, o passo em que foi pedida, o passo em que foi aplicada e a resposta. O site reproduz-o passo a passo, exacto com qualquer ritmo de frames, e identifica-o como gravado.
- **Endereços úteis para vídeo:** `?voo=gravado` força o voo gravado (sempre igual e sem custo) e `?desde=110` começa-o nesse segundo, perto da Foz, com contadores e mapa como se o voo tivesse sido visto desde o início.
- **Custo:** cerca de 3 mil tokens por chamada, ou seja ~0,02 USD por minuto de voo JEV ao vivo.

## O que se observa nas missões

1. O comandante escolhe cenário, carga, tolerância ao risco e restrições.
2. O JEV responde a quatro perguntas tipadas no briefing. Em cada incidente responde, em paralelo numa só chamada, a ação de missão, destino, eixos vertical/lateral, urgência, risco, «fora do envelope» e continuidade. O painel mostra a distribuição inteira de cada pergunta, a confiança devolvida pelo Gateway (choice e score), a latência e os tokens.
3. A confiança da ação de missão encaminha a decisão: ≥ 0,9 o JEV age; entre 0,5 e 0,9 age e fica assinalado para revisão; abaixo de 0,5 pede o PIC. Ao vivo, o relógio pára e o visitante tem 10 s para escolher; sem escolha fica a do JEV, validada pelo supervisor. Nos 15 eventos gravados só a luz do SAR (0,46) pede o PIC; a revisão por confiança concorda com a rubrica em 12 de 15 eventos, contra 7 de 15 com a antiga P(revisão PIC) ≥ 0,55.
4. O supervisor determinístico verifica pista, reserva, envelope e separação. Uma proposta incompatível fica no registo e a intervenção do supervisor aparece com autoria própria.
5. O motor recalcula posição, velocidade, altitude, rumo, massa, consumo, destino e ETA. Regressar, orbitar, desviar e abortar mudam o percurso e os incidentes possíveis.
6. O debriefing preserva entrada, resposta original, intervenção, estado antes/depois e comparação por dimensão. O laboratório altera uma variável numa **cópia** e pede nova resposta ao JEV.

A regra geométrica de comparação é deliberadamente limitada e nunca controla o voo. Uma percentagem global de “sucesso” esconderia desacordos importantes; por isso ação, destino, manobra, limites e revisão sugerida (pela confiança) são apresentados separadamente. Uma sugestão de revisão do JEV não é confundida com uma intervenção humana.

A **Prova contínua JEV** é um modo separado: o avião atravessa um slalom de torres, aves e tráfego de época. A cada 400 ms o cliente envia um snapshot com três a cinco obstáculos ainda à frente, com folgas por obstáculo e candidatas recalculadas a partir da posição actual (lateral positivo = direita do piloto). Há no máximo dois pedidos em voo; uma resposta antiga que chegue depois de uma mais recente, ou cujo obstáculo já foi ultrapassado, fica no registo mas não substitui a ordem actual. O JEV escolhe os eixos e o controlador local converte-os em alvos de posição (±52 m de lateral, +40 m de altitude). A mesma ordem, reconfirmada, mantém o alvo; sem confirmação durante 1,6 s o avião regressa ao eixo. O controlador antecipa 3 s a lateral para não passar do alvo com a curva coordenada, e o rumo nunca se afasta mais de 0,5 rad do corredor. Os obstáculos ficam fixos no mundo, nas mesmas posições que a física usa. Falhas seguidas do Gateway abrandam os pedidos e, à quinta, terminam a prova como incompleta. A fita mostra latência por passo, decisões por minuto, mediana, p95 e separação ao envelope de protecção simulado. Sem Gateway, a prova reproduz também a espera e usa respostas JEV já gravadas em cenários visuais equivalentes; cada linha guarda cenário, evento e data da gravação e nunca se apresenta como avaliação nova do snapshot actual.

O som dos motores é procedimental (Web Audio, sem ficheiros): tom de passagem das pás de 4 pás, dois motores ligeiramente desafinados para o batimento de bimotor, assobio de turbina e vento, a seguir a potência, a velocidade e a distância da câmara. Começa com o clique que inicia o voo, cala-se em pausa, no relatório e com o separador escondido, e o botão `Som` guarda a preferência.

A interface usa uma paleta preta e branca e uma animação de pontos “J·EV” na abertura, inspirada na linguagem visual da Pixelgrammar. A animação fica estática quando o sistema pede movimento reduzido; a missão também funciona sem WebGL (`?sem-webgl=1` permite verificar essa apresentação).

Cada ecrã cabe na altura da janela (`100dvh`) a 375, 390, 768, 1366 e 1440 px, sem scroll de página. Só os painéis secundários (linha de decisão, respostas tipadas, gavetas) fazem scroll interno; nenhum comando fica fora da vista. A render do LUS-222 é o exlibris: ocupa a abertura, aparece esbatida na mesa e no relatório, recortada nas cartas de missão e em miniatura na identidade do voo. O voo abre com três segundos de vista lateral, do flanco iluminado, antes da vista atrás da cauda.

- **Mesa de missão:** cartas numa linha (deslizam na horizontal no telemóvel), parâmetros compactos e `Iniciar JEV ao vivo` / `Ver replay gravado` fixos em baixo. A pista real abre numa sobreposição.
- **Voo:** canvas a ecrã inteiro; topo com identidade, fase, `Som` e `Terminar`; selo da decisão com a manobra, os milissegundos e a confiança do JEV; dock com `Decisão`, `Pausar`, velocidade, `Câmara`, `Intervenção PIC` e `Pista real` (só no Porto). O painel de decisão é uma gaveta estreita, aberta por omissão a partir de 1280 px de largura e fechada abaixo disso; fechada, sai da ordem de foco.
- **Relatório:** métricas numa linha, linha de decisão com scroll interno e laboratório numa gaveta.

## Mundo 3D

O mundo 3D só desenha o estado da simulação; nada do que lá aparece é enviado ao JEV.

- **Escala e lados:** a missão é desenhada em metros, à escala 1:1, sem comprimir distâncias nem altitudes. O simulador usa +x = direita do piloto; o mundo espelha o eixo x e o rumo, para que a «direita» do JEV apareça à direita do ecrã com a câmara atrás da cauda.
- **Terreno:** relevo procedural determinístico por cenário, em mosaicos de 2 km criados e libertados à volta do avião. Porto com o mar a oeste, à esquerda na aproximação; SAR sobre o mar, com a costa à direita; Açores com ilhas afastadas do corredor; Ponte de Sor numa planície. As pistas ficam planas e, junto ao mar, assentes num ilhéu raso. O corredor da prova contínua é quase plano. O relevo é ilustrativo e não é cartografia.
- **Céu:** vem do mesmo ambiente que o JEV recebe; com um incidente à espera de decisão, já é o ambiente depois do evento. A camada de nuvens tem a base no tecto, o nevoeiro fecha com a visibilidade, abaixo de 5 km chove e acima de 10 kt de vento aparecem rastos na direcção do vento. Quando a luz do dia acaba, o céu escurece em cerca de 60 s, acendem-se as luzes de navegação e o avião escurece. Em pausa, o céu congela.
- **Marcas no mundo:** portais de rota até ao destino activo, com a cor da reserva: branco se o alcance passa 1,15 × a distância, âmbar se passa à justa, vermelho se não chega. Cada destino tem um alfinete com nome e distância; o activo usa uma etiqueta branca invertida e os outros ficam escuros e esbatidos. Cada ameaça tem uma etiqueta âmbar com a distância horizontal em tempo real. Os balões têm o tamanho aproximado de balões reais (poucos metros) e um anel de 36 m à volta (o perímetro de protecção da simulação). À frente do nariz, uma seta mostra a manobra em curso: branca se é do JEV, vermelha se o supervisor ou o PIC a alteraram.
- **Porto na noite de São João:**
  - o Douro escavado no relevo, com as escarpas do Porto e de Gaia à volta da ponte (a física e o GPWS vêem o mesmo vale);
  - a Ponte D. Luís I (arco em crescente com treliça e dois tabuleiros, iluminada a dourado) e a Ponte da Arrábida;
  - o casario da Ribeira, dos Guindais e das caves de Gaia, com fachadas de cor e janelas acesas;
  - dezenas de milhares de candeeiros em malha de ruas, o brilho do chão nos bairros e a balizagem da pista do Sá Carneiro;
  - lanternas a subir do rio com o vento e fogo de artifício.

  As lanternas e o fogo ficam abaixo dos 300 m e são só cenário: as ameaças vêm do director e da física. Cada peça é uma chamada de desenho.
- **Câmara:** depois da abertura lateral, segue a cauda sem ficar para trás a 8×. Arrastar, pinçar ou usar a roda do rato orbita a vista à volta do avião (sem deslocar o centro); 4 s depois de largar, volta à cauda. No instante da decisão sobre os balões, enquadra avião e ameaça durante 2,6 s, com a ameaça perto do centro vertical para o selo não a tapar. O botão `Câmara` alterna entre cauda, lado e livre. A câmara nunca desce abaixo de 5 m acima do relevo ou do mar. Com movimento reduzido não há abertura. Ao sair da missão, as geometrias, texturas e sombras da cena são libertadas da GPU.

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

No incidente dos balões, o JEV recebe geometria estruturada (distância, tempo e folgas) e responde com ação, manobras e destino **condicional**. O simulador calcula a separação prevista com a mesma integração do voo; o supervisor altera uma manobra se a previsão entrar no perímetro ilustrativo de 36 m. A passagem regista a distância mínima efetiva ou termina como `separacao_perdida` se atravessar esse perímetro. O relógio simulado pára durante a avaliação de uma ameaça iminente e a passagem é apresentada a 2×. Os balões já não são ampliados: ficam nas posições relativas em metros, com um tamanho próximo do real, e lêem-se pela etiqueta com a distância e pelo anel de 36 m. Este cálculo não equivale a garantia operacional de separação.

A referência da pista principal é a **LDA publicada de 3180 m para a pista 17** no [AIP Portugal, LPPR AD 2.13](https://ais.nav.pt/wp-content/uploads/AIS_Files/eAIP_Current/eAIP_Online/eAIP/html/eAIP/LP-AD-2.LPPR-en-PT.html). Esse valor contextual não calibra o avião. A [informação turística oficial do Porto](https://backoffice.visitporto.travel/pt-PT/sao-joao-the-porto-celebration) descreve os balões de São João; a presença no corredor de chegada nesta missão é **ficcional**.

A referência visual da pista é uma [incorporação oficial do Google Maps](https://support.google.com/maps/answer/11471036?hl=pt-PT) em modo satélite, com atribuição no próprio mapa. É uma imagem cartográfica estática; o anoitecer, os balões, a trajetória e a aeronave são simulados separadamente. A aplicação não guarda nem redistribui imagens do Google Maps. O iframe só carrega conteúdo do Google quando a sobreposição `Pista real` é aberta (na mesa ou durante o voo).

## Estrutura

```text
api/jev.js                  POST /api/jev e validação da resposta JEV
public/src/simulacao.js     cenários, física, eventos, destinos e supervisor
public/src/contrato-jev.js  validação de choice, score e boolean
public/src/avaliacao-sim.js rubricagem por dimensão
public/src/confianca.js     encaminhamento por confiança: age, assinala ou pede o PIC
public/src/painel-jev.js    distribuições, confiança, latência e tokens de cada resposta
public/src/som-motor.js     som procedimental dos motores (Web Audio)
lib/limites-api.mjs         origem, momentos e classificação dos erros do Gateway
public/src/main.js          controlador de missão, UI, replay e laboratório
public/src/piloto-corredor.js percurso contínuo, snapshots, pipeline de 2 e métricas
public/src/world.js         representação 3D do estado do motor
public/src/escala.js        mundo 1:1 e espelho do eixo x (direita do JEV = direita do ecrã)
public/src/relevo.js        relevo determinístico por cenário, pistas planas e ilhéus
public/src/mosaicos.js      que mosaicos de terreno criar, manter e largar
public/src/terreno.js       malhas dos mosaicos e mar (Three.js)
public/src/ambiente-visual.js nuvens, nevoeiro, noite e vento a partir do ambiente
public/src/ceu.js           cúpula, nuvens, chuva, rastos e sol (Three.js)
public/src/rota-visual.js   fita de rota, alcance e sentido da seta da manobra
public/src/marcas-missao.js portais, alfinetes, etiquetas, anel e seta (Three.js)
public/src/camara-modos.js  modos de câmara: abertura, cauda, lado, evento e livre
public/src/simulador-ui.js  simulador: pilotos humano e JEV, painel, mapa, voo gravado
public/src/simulador.js     voo livre sobre o Porto e circuito
public/src/piloto-sim.js    actuação comum ao humano e ao JEV (comando de intenção)
public/src/estado-piloto.js estado em categorias que o JEV lê e filtro do servidor
public/src/ameacas.js       ameaças em movimento, CPA/TCPA
public/src/diretor.js       director de ameaças do voo livre
public/src/voo-gravado.js   gravar e reproduzir voos do JEV passo a passo
public/src/porto-noite.js   pontes, Ribeira, luzes, lanternas e fogo (Three.js)
public/replays/*.json       quatro gravações reais do JEV, identificadas como replay
public/voos/*.json          voo livre real do JEV, gravado para quem não tem voo ao vivo
scripts/record-replays.mjs  regenera gravações através do Gateway
scripts/gravar-voo-jev.mjs  grava um voo livre do JEV através do Gateway
scripts/avaliar-jev.mjs     banco de casos: acerto, Brier e calibração do JEV
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

```bash
node scripts/gravar-voo-jev.mjs http://localhost:43123 222 300
```

`replays:record` e `gravar-voo-jev.mjs` exigem o Gateway local em `http://localhost:43123` (o voo de 300 s custa ~0,10 USD). As respostas do JEV podem variar entre gravações; as invariantes verificadas são contrato, reprodução e proveniência, não uma escolha idêntica em todas as execuções.

## Limites

- Não é uma simulação aeronáutica certificada, nem um sistema Detect and Avoid ou um plano de voo.
- Coordenadas, tráfego, meteorologia e performance alternativos são assumidos para demonstrar decisões causais.
- O Google Maps e a renderização 3D não são enviados ao JEV; só segue o estado estruturado visível no registo.
- No simulador, o JEV voa ao vivo até 5 minutos por visita; a seguir, e sempre que não há Gateway, voa o voo gravado, identificado como tal.
- O modo ao vivo tem limites de custo: só o próprio site chama `/api/jev` (Origin exacto), cada IP tem 600 pedidos/min por instância, cada missão 300 pedidos, e a chave do AI Gateway tem orçamento mensal próprio. Um limite atingido passa a sessão ao replay gravado, identificado no cabeçalho; com o separador escondido o voo pausa e não faz pedidos.
- Os registos devem ser revistos antes de serem partilhados; esta demonstração usa apenas dados sintéticos, sem clientes ou passageiros reais.

MIT — ver [LICENSE](./LICENSE).
