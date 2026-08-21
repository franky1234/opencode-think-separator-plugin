# opencode-think-separator-plugin — Execution Plan

Opencode TUI plugin that visually separates the model's reasoning block (`<think>`, `reasoning`, `thoughts`, etc.) from its final response. Provider-agnostic (Anthropic, OpenAI, Google, MiniMax) and opencode-version-agnostic (≥ 1.15).

**Repo**: https://github.com/franky1234/think-separator-plugin
**Path**: `/home/franklin/Desktop/REPO/klassapp/opencode-think-separator-plugin/`
**Version**: `0.1.0` (MVP)
**License**: MIT

---

## Scope & Goals

1. Plugin standalone para opencode TUI que detecta bloques de razonamiento y los renderiza con header "Reasoning" + separador.
2. Agnóstico a provider — detección por field-name discovery, no por nombres hardcodeados.
3. Agnóstico a versión de opencode ≥ 1.15 — usar solo plugin API documentada como estable.
4. Distribución pública vía GitHub + npm.
5. Harness propio del proyecto (orchestrator / dev / qa) para coordinar desarrollo.

---

## Non-Goals (out of scope for v0.1.0)

- Render colapsable interactivo (header siempre visible en MVP)
- Configuración visual runtime por el usuario (label fijo "Reasoning" en MVP, configurable a futuro via plugin config)
- Soporte de providers no estándar (solo los 4 documentados)
- Compatibilidad con versiones opencode < 1.15
- Integración con temas específicos de opencode (render agnóstico al theme)

---

## Architecture Overview

```
src/
├── index.js              # Entry point, registra hooks
├── detect-reasoning.js   # Heurística agnóstica (whitelist de campos)
├── render.js             # Render con header + separador
└── config.js             # Defaults (label, futuras opciones)

test/
├── detect-reasoning.test.js
├── render.test.js
└── fixtures/             # JSON reales de 4 providers
    ├── anthropic-thinking.json
    ├── openai-reasoning.json
    ├── google-thoughts.json
    ├── minimax-thinking.json
    └── no-reasoning-control.json
```

### Detection (agnostic heuristic)

```js
const REASONING_FIELDS = [
  'thinking', 'reasoning', 'reasoning_content', 'reasoning_text',
  'redacted_thinking', 'thoughts', 'cot', 'chain_of_thought',
  'internal_monologue', 'reflection'
];
```

Strategy:
1. Scan `message.content[]` blocks (Anthropic/MiniMax style)
2. Scan top-level `message.*` fields (OpenAI/Google style)
3. Return first match with `reasoning`, `source` field name, and `kind`
4. Return `null` if no match (control negative case)

### Render

- Header fijo: `── Reasoning ──` con estilo monoespaciado
- Contenido del reasoning indentado y con color dim respecto al response
- Separador visual entre bloque reasoning y bloque response
- Agnóstico al theme (usa ANSI escapes que respetan paleta del terminal)

---

## Phases

### FASE H — Harness ✅ COMPLETED (commit `ab115b2`)

Bootstrap del proyecto con harness completo:
- AGENTS.md, .harness/{domains,models}.yaml, generate-agents.sh, add-skills.sh
- .opencode/agent/*.md (orchestrator hand-written + 4 generados)
- .opencode/nah/policy.yaml + .opencode/plugins/nah-policy.js (26 tests pass)
- opencode.json (superpowers plugin + engram MCP)
- bin/harness-load.sh (dev launcher)
- package.json v0.1.0
- Smoke test: add-skills ✓, nah-policy tests 26/26 ✓, opencode 1.18.18 detected ✓

### FASE 0 — Investigación profunda (NEXT)

**0.1 — Plugin API de opencode**
- `read` https://opencode.ai/docs/plugins
- `read` ~/.config/opencode/plugins/engram.ts (ejemplo real)
- `grep` en ~/.cache/opencode/packages/opencode-ai/ para listar exports/hooks
- Determinar API mínima común entre opencode ≥ 1.15
- Documentar: tabla hooks × versiones opencode
- **Output**: `docs/PLUGIN_API.md`

**0.2 — Localización de serialización del `<think>`**
- `grep -rn "<think>" ~/.cache/opencode/packages/opencode-ai/ --include="*.ts" --include="*.js"`
- `read` archivo identificado
- Determinar si el plugin puede interceptar antes o solo después de la serialización
- **Output**: nota técnica en `docs/PLUGIN_API.md` §2 (archivo:línea)

**0.3 — Recolección de fixtures de providers**
- Anthropic: capturar respuesta real con `type:"thinking"` (Claude Sonnet 4.5)
- OpenAI: capturar respuesta real con `reasoning` (o3/o4-mini)
- Google: capturar respuesta real con `thoughts` (Gemini 2.5 Pro)
- MiniMax: capturar respuesta real con `type:"thinking"` (M3)
- Control: respuesta sin razonamiento (cualquier provider)
- **Output**: 5 archivos JSON en `test/fixtures/`

**0.4 — Validación de heurística agnóstica**
- Listar todos los campos en fixtures (recursive key discovery)
- Construir whitelist `REASONING_FIELDS` basada en evidencia
- Validar detección en 4 fixtures positive
- Validar no-detección en fixture control negativo
- **Output**: `docs/ARCHITECTURE.md` §2 con tabla `campo → provider → fixture × detectado`

**0.5 — Versionado de opencode**
- `opencode --version` → baseline
- Listar versiones ≥ 1.15
- Para cada versión, documentar disponibilidad de hooks
- **Output**: matriz compatibilidad en `docs/COMPATIBILITY.md`

### FASE 1 — Diseño del contrato (Architect)

- **1.1** Diseñar interfaz del plugin (`name`, `hooks`, signatura) → `docs/ARCHITECTURE.md` §1
- **1.2** Documentar heurística agnóstica validada → `docs/ARCHITECTURE.md` §2
- **1.3** Diseñar render agnóstico al theme → `docs/ARCHITECTURE.md` §3
- **1.4** Definir API de config (`label`, futuras opciones) → `docs/ARCHITECTURE.md` §4

### FASE 2 — Implementación (Dev → QA loop)

- **2.1** `src/detect-reasoning.js` + tests (cubrir las 5 fixtures)
- **2.2** `src/render.js` + tests (header + separador, agnóstico al theme)
- **2.3** `src/config.js` con defaults (`label: "Reasoning"`)
- **2.4** `src/index.js` con hooks (basado en API validada en FASE 0)
- **2.5** `bin/dev.sh` linkea plugin y arranca opencode
- **2.6** README inicial

### FASE 3 — Validación cross-provider y cross-versión (QA)

- **3.1** Suite completa pasa (4 providers + control negativo)
- **3.2** Plugin se carga en opencode sin errores
- **3.3** `/thinking` toggle sigue funcionando con plugin cargado
- **3.4** Export (`ctrl+x x`) mantiene separador
- **3.5** Probar contra opencode ≥ 1.15 (al menos 2 versiones)
- **3.6** Llenar `docs/COMPATIBILITY.md`

### FASE 4 — Deploy público (Dev + QA review)

- **4.1** README completo (instalación, ejemplos, screenshots)
- **4.2** LICENSE (MIT) + CONTRIBUTING.md
- **4.3** GitHub repo público en `github.com/franky1234/think-separator-plugin`
- **4.4** Push + tag `v0.1.0`
- **4.5** `npm publish --access public` (requiere npm login)
- **4.6** Smoke test: instalar vía npm y verificar carga

---

## Execution Order (cuando el orchestrator arranque)

1. **FASE 0** (read-only, prioriza sub-fase 0.1)
2. **FASE 1** (Architect diseña contrato)
3. **FASE 2** (Dev implementa, QA valida cada paso)
4. **FASE 3** (QA regression testing)
5. **FASE 4** (Dev deploy + QA smoke final)

---

## Risks & Mitigations

| Riesgo | Mitigación |
|---|---|
| Plugin API cambió desde opencode 1.15 | FASE 0.1 + FASE 3.5 lo detecta; documentar versión mínima real |
| Falsos positivos en detección agnóstica | Whitelist explícita + fixture de control negativo |
| Render se ve mal en algunos themes | Usar ANSI escapes estándar |
| Public npm publish falla | Verificar credenciales antes de FASE 4.5 |
| GitHub repo过早 (WIP expuesto) | Primer push solo después de FASE 2 (MVP funcional) |
| Bin/dev.sh rompe si opencode no está en PATH | Documentar requisito, fail con mensaje claro |

---

## Tracking

Cada fase cierra con:
- Commit dedicado
- Actualización de `progress.md` en `.superpowers/sdd/<plan>/` (creado por orchestrator)
- `mem_save` en Engram con `topic_key: think-separator-task-<n>`

Plan completion protocol (del orchestrator):
- Triage de parked findings (apply/dismiss/defer)
- Rewrite de `progress.md` en formato resumido
- `mem_save` con `topic_key: think-separator-plan-complete`

---

## Referencias cruzadas

- AGENTS.md — project standards
- .harness/domains.yaml — single domain declaration
- .harness/models.yaml — model routing (orchestrator: MiniMax-M3, qa: kimi-k2.7-code, dev: deepseek-v4-pro)
- .opencode/nah/policy.yaml — agent permissions
- docs/PLUGIN_API.md (FASE 0.1)
- docs/ARCHITECTURE.md (FASE 1)
- docs/COMPATIBILITY.md (FASE 3.6)