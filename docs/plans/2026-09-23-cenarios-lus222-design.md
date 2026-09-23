# Cenários LUS-222 — desenho

Aprovado a 2026-09-23. Objectivo: o 3D deve **contar a decisão do JEV** — cada evento tem uma imagem clara e em escala, num visual limpo e estilizado com a identidade preto e branco da Pixelgrammar. Abordagem: procedural em Three.js, com marcos desenhados à mão, sem assets externos.

## Diagnóstico

1. **Escala incoerente.** A missão desenha o mundo comprimido (`xM / 210`, `altitudeM / 11.5`) com o avião em tamanho real: o painel diz ~480 m e o 3D mostra o avião a ~40 m sobre "prédios" do tamanho dele.
2. **Geografia genérica e repetida.** Açores e SAR usam o mesmo disco (`ilha`); Porto são caixas aleatórias; Ponte de Sor é um plano liso.
3. **Eventos sem imagem.** "O tempo mudou", "a luz do dia termina", "vento de frente": nada disso aparece. Os balões quase não se vêem.
4. **3D espremido** entre painéis largos, sobretudo no telemóvel.

## Princípio

O ecrã mostra o mesmo estado que o JEV recebe. Os visuais derivam dos números da simulação (tecto, visibilidade, vento, luz, posição das ameaças, destinos), não de decoração à parte. A física, o JEV, o supervisor, os replays e o log não mudam.

## 1. Base comum

- **Escala 1:1 em metros.** O avião voa à altitude real e desce de facto na final. Objectos pequenos à distância (balões, aves) têm marcador de leitura (anel + distância) que não finge ser tamanho real.
- **Terreno por mosaicos** de ~2 km gerados à volta do avião (relevo por ruído, mar, manchas de cidade/campo por cenário), criados ao longo de vários frames e libertados ao sair de vista. Nevoeiro e distância de desenho em quilómetros; buffer de profundidade logarítmico.
- **Câmara.** Abertura: plano lateral fixo de ~3 s que lê o LUS-222 e desliza para trás da cauda. Órbita manual (arrastar/pinçar, `OrbitControls`), regressa à cauda ~4 s depois de largar; botão "Câmara" alterna cauda / lado / livre. No momento da decisão enquadra avião e ameaça 2–3 s.
- **Layout.** No telemóvel os painéis passam a gavetas por baixo; no desktop ficam mais estreitos.

## 2. Meteorologia, luz e eventos

| Evento | Imagem |
|---|---|
| Frente / meteorologia | Camada de nuvens à altura real do tecto; visibilidade → nevoeiro; frente como cortina escura com chuva |
| Vento | Rastos de partículas, ângulo de deriva do avião, mangas de vento nas pistas |
| Luz / anoitecer | Sol a baixar, céu a escurecer, luzes de cidade, pista e navegação a acender |
| Balões | Lanternas quentes a derivar com o vento nas posições reais |
| Tráfego | Avião com luzes, rasto e trajectória prevista a tracejado |
| Aves | Bando com marcador e folga |
| Relevo | Crista real com faixa de margem lateral translúcida |
| Aproximação | Luzes de aproximação e rampa de descida |
| Contacto (SAR) | Balsa com fumo; padrão de busca desenhado na água |
| Massa, relógio clínico, reserva | Anel de alcance no chão e alfinetes dos destinos |

A decisão fica no mundo: **fita de rota** para o destino actual (dobra quando o JEV muda de destino), **seta da manobra** à frente do nariz, cor e autoria próprias quando o supervisor intervém. Paleta preto e branco com um acento âmbar para ameaças e luzes; vermelho só para conflito ou intervenção. No perfil leve há menos partículas e nuvens; marcadores e fita de rota mantêm-se.

## 3. Geografia e marcos

- **São João / Porto (165 km).** Rota de sul pela costa, Atlântico à esquerda; foz do Douro com a Ponte D. Luís I e a Ribeira iluminada, de onde sobem os balões; malha urbana densa a acender; Sá Carneiro com luzes de aproximação. A designação da pista passa a bater com o sentido de aproximação (35), mantendo o comprimento publicado.
- **MEDEVAC Açores (162 km).** Terceira (Monte Brasil, retalhos com muros de pedra), mar aberto com a frente atlântica, São Miguel com a crista vulcânica e as lagoas das Sete Cidades; ilha longa e estreita para a pista STOL; alfinete do hospital alternativo.
- **Carga Ponte de Sor → Beja (140 km).** Aeródromo com pista longa e hangares; searas e montado de sobro; albufeira do Alqueva; cegonhas; Beja; pista de terra STOL.
- **SAR costa (145 km).** Arribas do Cabo Mondego, foz do Mondego e areal; busca sobre o mar ao crepúsculo; quadrado crescente e balsa com fumo.
- **Corredor contínuo: vale do Douro vinhateiro.** Socalcos e rio; as "torres" passam a esporões de xisto; aves mantêm-se; o tráfego é um helicóptero ou avioneta a cruzar o vale. Posições, raios e folgas da física não mudam; o perímetro de protecção vê-se como anel translúcido.
- **Comum:** um construtor de aeródromos (pista, luzes, manga de vento, hangares) para origens, destinos e alternativos.

## 4. Fases, desempenho e verificação

| Fase | Conteúdo |
|---|---|
| 1. Base comum | Escala, mosaicos, céu/luz, meteorologia a partir do estado, fita de rota e seta, câmara, layout |
| 2. Porto + Corredor | Marcos do Porto, balões, cidade, Sá Carneiro, vale do Douro, construtor de aeródromos — pronto para o post |
| 3. Açores, Ponte de Sor, SAR | Geografia e eventos dos restantes cenários |

- **Desempenho:** 60 fps no desktop, ≥ 30 fps num telemóvel médio (perfil leve); instâncias para prédios, árvores, luzes e partículas; < ~150 chamadas de desenho e < 300 mil triângulos (100 mil no perfil leve). Sem dependências novas. Corrigir a fuga de GPU em `largarMundo`.
- **Verificação:** testes unitários às funções puras (conversão missão → metros, mosaicos por posição, relevo determinístico e plano nas pistas, tecto → nuvens, visibilidade → nevoeiro, hora → luz); capturas no browser interno por cenário e evento, desktop e 390 px; fps nos dois perfis; consola sem erros; `?sem-webgl=1` continua a funcionar; testes actuais, replays e um voo ao vivo por fase.
- **Riscos:** z-fighting em escala real (buffer logarítmico); chão rápido a 8× (câmara afasta-se se necessário).
