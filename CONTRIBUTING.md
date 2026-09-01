# Colaboración en NextforIA

Este repositorio despliega producción automáticamente cuando cambia `main`. Por esa razón, todo cambio debe llegar mediante una rama corta y un pull request (PR). Nadie —persona o agente— trabaja directamente sobre `main`.

## Regla de oro

Una orden de trabajo equivale a un issue, una persona o agente responsable, una rama y un PR. Dos participantes nunca comparten una rama activa ni reciben simultáneamente la misma orden.

## Antes de empezar

1. Actualiza las referencias sin alterar tu trabajo:

   ```bash
   git fetch origin --prune
   ```

2. Revisa los issues y PR abiertos para confirmar que nadie trabaja ya en el mismo módulo.
3. Crea o toma un issue y deja allí:
   - responsable;
   - objetivo y criterios de aceptación;
   - archivos o módulos previstos;
   - dependencias con otras tareas;
   - riesgo de despliegue, migración o cambio de variables.
4. Crea una rama nueva desde el `main` remoto actualizado:

   ```bash
   git switch main
   git pull --rebase origin main
   git switch -c codex/123-descripcion-corta
   ```

## Nombres de ramas

- `damian/<issue>-<descripcion>` para trabajo de Damián.
- `santiago/<issue>-<descripcion>` para trabajo de Santiago.
- `codex/<issue>-<descripcion>` para tareas ejecutadas por Codex.
- `fix/<issue>-<descripcion>` únicamente para correcciones urgentes coordinadas.

Usa minúsculas, guiones y un solo objetivo por rama. No reutilices ramas que ya fueron integradas.

## Trabajo paralelo con personas y agentes

- Cada agente usa una rama y, de ser posible, un worktree propios.
- El issue es la fuente de verdad de la orden; los mensajes de chat no sustituyen el alcance escrito.
- Un responsable puede delegar subtareas, pero cada subagente debe recibir archivos o módulos que no se solapen con los de otro.
- Si dos tareas necesitan el mismo archivo central (`index.js`, `package.json`, configuración, esquemas o migraciones), se define primero el orden de integración. La segunda rama se actualiza después de integrar la primera.
- Las migraciones y los cambios de producción se serializan: solo puede existir un responsable activo para cada entorno.
- Nunca se comparten secretos, `.env`, tokens o datos de clientes por commits, issues, PR o chats de agentes.

Para aislar dos trabajos locales simultáneos:

```bash
git fetch origin --prune
git worktree add ../nextforia-123 -b codex/123-descripcion origin/main
git worktree add ../nextforia-124 -b codex/124-otra-tarea origin/main
```

## Durante el desarrollo

- Haz commits pequeños y descriptivos.
- Sube la rama con frecuencia para que el trabajo sea visible:

  ```bash
  git push -u origin HEAD
  ```

- Abre un PR en borrador temprano y enlázalo con el issue.
- Antes de continuar después de una pausa prolongada:

  ```bash
  git fetch origin --prune
  git rebase origin/main
  ```

- No uses `push --force` en ramas compartidas. Si un rebase exige actualizar una rama propia, usa `--force-with-lease` y avisa en el PR.
- No mezcles refactors, formato masivo y una funcionalidad en el mismo PR.

## Validación y revisión

Antes de solicitar integración:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm security:scan
git diff --check origin/main...HEAD
```

Además, ejecuta las suites específicas del módulo modificado, por ejemplo `pnpm test:channels`, `pnpm test:payments` o `pnpm test:tenant-isolation`.

El PR debe:

- pasar GitHub Actions;
- describir riesgo, pruebas y rollback;
- recibir revisión de otra persona;
- estar actualizado con `main`;
- no incluir secretos ni cambios ajenos al issue.

## Integración y despliegue

Usa **Squash and merge** para mantener un commit claro por orden de trabajo. El autor elimina la rama después de integrarla.

Como `main` activa Render en producción:

1. Confirma que no haya otro despliegue en curso.
2. Integra un solo PR de riesgo operativo a la vez.
3. Espera el despliegue y ejecuta `pnpm run verify-deploy` o la verificación específica.
4. Revisa `/admin/health` y las señales del módulo cambiado.
5. Si falla, aplica el rollback descrito en el PR antes de integrar otro cambio.

## Configuración que debe aplicar el administrador en GitHub

Santiago, como administrador, debe crear una ruleset para `main` con estas condiciones:

- prohibir borrado y force-push;
- exigir PR antes de integrar;
- exigir al menos una aprobación y conversación resuelta;
- exigir la verificación **Tests and static safety checks**;
- exigir que la rama esté actualizada antes de integrar;
- impedir bypass, salvo una cuenta de recuperación claramente definida;
- habilitar eliminación automática de ramas integradas;
- usar **Squash merge** como método preferido.

Hasta que esa protección esté activa, estas reglas son obligatorias por proceso: nadie ejecuta `git push origin main`.
