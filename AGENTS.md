# Instrucciones para agentes de NextforIA

Este archivo es la autoridad operativa para cualquier agente que trabaje en el repositorio. Aplica a todo el árbol. `CLAUDE.md` y los contratos en `.agents/` complementan estas reglas, pero no pueden contradecirlas.

## Objetivo

Permitir que `@nextforia-png` y `@damianscorrealesi` asignen trabajo a Codex, Claude u otros agentes con el mismo proceso, sin duplicar órdenes, compartir ramas ni desplegar accidentalmente a producción.

## Antes de modificar archivos

1. Lee `CONTRIBUTING.md`, `.agents/registry.json` y el prompt del rol asignado.
2. Confirma el contrato de tarea: responsable humano, agente, objetivo, alcance, exclusiones, archivos previstos, criterios de aceptación, validación, riesgo y rollback.
3. Ejecuta `git status --short --branch` y `git fetch origin --prune`.
4. Revisa PR y ramas activas para detectar solapamientos.
5. Trabaja en una rama y un worktree exclusivos creados desde `origin/main`.

Si falta un contrato o existe otra tarea sobre el mismo alcance, el agente se detiene antes de editar y reporta el conflicto.

## Fuente de verdad de cada orden

Una orden equivale a un contrato, un responsable humano, un agente ejecutor, una rama y un PR.

- Cuando Issues esté habilitado, el issue es la fuente de verdad y el PR lo enlaza.
- Mientras Issues permanezca deshabilitado, el PR en borrador es la fuente de verdad y debe contener `.agents/TASK_TEMPLATE.md` diligenciado.
- Los chats sirven para conversar; no reemplazan el contrato versionado en GitHub.
- Una tarea no puede asignarse simultáneamente a dos agentes.
- Los subagentes solo reciben subtareas con archivos o módulos que no se solapen.

## Ramas y worktrees

Nunca se trabaja directamente sobre `main`. Los prefijos permitidos están en `.agents/registry.json`:

- `codex/` para implementación y corrección con Codex.
- `claude/` para implementación o segunda pasada con Claude.
- `design/` para Panel Design.
- `customer-panel/` para el Agente Customer Panel.
- `qa/` para correcciones descubiertas durante revisión independiente.
- `dependabot/` queda reservado a Dependabot.

No reutilices ramas integradas, no compartas ramas activas y no uses `push --force` sobre una rama de otra persona. En una rama propia, un rebase solo puede publicarse con `--force-with-lease` y debe avisarse en el PR.

## Áreas sensibles

- `main` despliega automáticamente a producción en Render.
- `index.js` es un punto de integración compartido; coordina el orden si dos tareas lo modifican.
- `package.json` y los lockfiles requieren explicar cambios de dependencias.
- `.github/`, `SECURITY.md`, autenticación, webhooks, aislamiento de tenants y secretos requieren revisión de otra persona.
- `docs/migrations/` exige migraciones `up` y `down`, orden de despliegue y rollback. Solo una migración operativa puede estar activa por entorno.
- `apps/shopify/nexforia-commerce/` tiene instalación y validaciones propias; no mezcles sus dependencias con las de la raíz.
- No se escriben ni exponen `.env`, tokens, llaves, credenciales, payloads de clientes o datos personales.

## Límites de producción

Un agente puede preparar código, pruebas, documentación, migraciones y un plan de despliegue. No puede por iniciativa propia:

- hacer push directo a `main`;
- integrar su propio PR;
- cambiar secretos o variables de producción;
- ejecutar migraciones de producción;
- activar proveedores, números, webhooks o bots reales;
- modificar datos de clientes;
- iniciar o revertir un despliegue.

Esas acciones requieren aprobación humana explícita y un único operador designado.

## Validación mínima

Todo agente ejecuta `git diff --check origin/main...HEAD` y las pruebas proporcionales al cambio.

- Documentación, plantillas o registro de agentes: validar enlaces relevantes y `node -e "JSON.parse(require('fs').readFileSync('.agents/registry.json','utf8'))"` cuando cambie el registro.
- Runtime Node.js: `node --check` en archivos modificados y pruebas específicas.
- Cambios amplios de runtime: `pnpm test`.
- Seguridad, dependencias, autenticación, webhooks o aislamiento tenant: `pnpm security:scan` y suites específicas.
- Canales: `pnpm test:channels`.
- Pagos: `pnpm test:payments`.
- Aislamiento: `pnpm test:tenant-isolation`.
- Shopify app: dentro de `apps/shopify/nexforia-commerce`, `pnpm test`, `pnpm lint` y `pnpm build` según el alcance.

Nunca declares una prueba como aprobada si no se ejecutó. Documenta fallos preexistentes por separado.

## Revisión e integración

- Abre un PR en borrador temprano.
- Mantén el PR limitado a una orden.
- Actualiza la rama con `origin/main` antes de solicitar revisión.
- Otra persona revisa alcance, seguridad, pruebas y rollback.
- Usa Squash and merge después de verificaciones y aprobación.
- Elimina la rama integrada.
- Los cambios operativos de alto riesgo se integran y despliegan uno por uno.

## Handoff obligatorio

Toda entrega de agente incluye:

1. resultado alcanzado;
2. archivos modificados;
3. pruebas ejecutadas y resultados;
4. riesgos o supuestos;
5. pendientes y bloqueos;
6. impacto de producción;
7. plan de rollback;
8. enlace al PR.

Usa `.agents/HANDOFF_TEMPLATE.md` cuando el trabajo pase a otra persona o agente.

## Agentes del producto

Atlas Coordinator, Multimodal Input Agent y Bot Ops son componentes del runtime, no agentes de desarrollo. Modificarlos requiere el mismo flujo de rama y PR. Bot Ops no recibe autoridad para cambiar automáticamente prompts, configuración, código o datos de clientes.
