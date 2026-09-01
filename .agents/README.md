# Sistema compartido de agentes

Esta carpeta hace que Santiago y Damián asignen trabajo con los mismos roles y contratos, independientemente del chat, equipo o modelo utilizado.

## Inicio de una tarea

1. Selecciona un rol en `registry.json`.
2. Copia `TASK_TEMPLATE.md` al cuerpo de un PR en borrador o a un issue cuando estén habilitados.
3. Asigna un único responsable humano y un único agente.
4. Crea una rama con el prefijo del rol desde `origin/main`.
5. Crea un worktree exclusivo.
6. Inicia el agente con este encabezado:

   ```text
   Lee AGENTS.md y el prompt de rol indicado en .agents/registry.json.
   Ejecuta únicamente el contrato de tarea adjunto.
   No trabajes sobre main ni realices acciones de producción.
   ```

7. Abre el PR en borrador antes de que la implementación crezca.
8. Asigna la revisión a la otra persona o al rol `qa-review` sin permitir que el autor se apruebe a sí mismo.

## Trabajo paralelo

Ejemplo con dos órdenes independientes:

```bash
git fetch origin --prune
git worktree add ../nextforia-123 -b codex/123-correccion origin/main
git worktree add ../nextforia-124 -b design/124-panel origin/main
```

No asignes en paralelo tareas que modifiquen `index.js`, la misma migración, el mismo lockfile o el mismo flujo de producción sin definir antes el orden de integración.

## Compatibilidad

- Codex descubre `AGENTS.md` automáticamente.
- Claude recibe las mismas reglas mediante `CLAUDE.md`.
- Panel Design y Customer Panel usan prompts portables para cualquier modelo.
- Dependabot conserva su configuración existente y nunca integra sus propios PR.

Los componentes Atlas, Multimodal y Bot Ops aparecen en el registro para evitar confundirlos con agentes que escriben código.
