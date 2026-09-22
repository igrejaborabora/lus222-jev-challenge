# LUS-222 Model Fidelity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Aproximar a malha Three.js do LUS-222 branco CS-001 das vistas públicas frontal, lateral e de três quartos.

**Architecture:** Manter `criarLus222()` como construtor síncrono da malha, dentro de `public/src/world.js`. Preservar o `THREE.Group`, a orientação +Z, a escala e `userData.props`; o autómato e a câmara não precisam de mudanças de contrato.

**Tech Stack:** JavaScript ES modules, Three.js 0.186, browser WebGL, testes Node nativos.

---

### Task 1: Silhueta e superfícies

**Files:**
- Modify: `public/src/world.js:48-165`

**Step 1:** Rever as formas contra as imagens listadas em `2026-09-22-lus222-visual-design.md`: nariz, secções da fuselagem, altura e contorno da asa.

**Step 2:** Refinar a fuselagem com secções mais graduais e fechar a transição traseira. Substituir os painéis de cabine e a asa demasiado plana por geometrias afuniladas com espessura.

**Step 3:** Executar `node --check public/src/world.js`. Esperado: exit code 0.

### Task 2: Motores e empenagem

**Files:**
- Modify: `public/src/world.js:166-290`

**Step 1:** Dar forma arredondada às naceles; substituir as cinco pás rectangulares por quatro pás afuniladas por motor, mantendo `props`.

**Step 2:** Ajustar a deriva, estabilizador alto, pontas de asa e trem fixo às referências; manter os decalques próprios do projecto.

**Step 3:** Executar `node --check public/src/world.js`. Esperado: exit code 0.

### Task 3: Validação visual e funcional

**Files:**
- Modify if needed: `public/src/world.js`

**Step 1:** Abrir uma pré-visualização local da malha e comparar vistas frontal, lateral e chase; verificar o enquadramento no telemóvel.

**Step 2:** Corrigir intersecções ou peças invisíveis encontradas na pré-visualização.

**Step 3:** Executar `npm test`. Esperado: 0 falhas. Executar `npm run lint` se existir; se não existir, registar essa limitação e usar `node --check` nos ficheiros JavaScript alterados.

**Step 4:** Rever `git diff --check` e o diff completo. Fazer um commit focado para a remodelação e seguir o fluxo de PR/CI do repositório.
