## Orden de trabajo

- Issue: Closes #
- Responsable:
- Agente: `codex | claude | panel-design | customer-panel | qa-review`
- Contrato: issue o `.agents/TASK_TEMPLATE.md` incluido en este PR
- Rama base: `main`

## Objetivo y alcance

Describe qué cambia, qué criterio de aceptación cumple y qué queda expresamente fuera.

## Coordinación

- [ ] Revisé issues y PR abiertos; no existe otra tarea sobre el mismo alcance.
- [ ] Identifiqué los archivos o módulos compartidos con otras ramas activas.
- [ ] La rama pertenece a una sola persona o agente responsable.
- [ ] El agente siguió `AGENTS.md` y el prompt de rol registrado.
- [ ] Si depende de otro PR, indiqué el orden de integración.

## Validación

- [ ] Ejecuté `pnpm install --frozen-lockfile`.
- [ ] Ejecuté `pnpm test` o expliqué por qué no aplica.
- [ ] Ejecuté las suites específicas del módulo.
- [ ] Ejecuté `pnpm security:scan` cuando el cambio afecta runtime, dependencias o seguridad.
- [ ] Ejecuté `git diff --check origin/main...HEAD`.
- [ ] No incluí secretos, `.env`, tokens ni datos de clientes.

Comandos y resultados relevantes:

```text

```

## Producción y rollback

- Riesgo: bajo / medio / alto
- [ ] No cambia variables, migraciones ni servicios externos.
- [ ] Si sí los cambia, documenté la secuencia y el responsable operativo.
- Verificación posterior al despliegue:
- Plan de rollback:

## Evidencia

Incluye capturas, logs sanitizados o ejemplos cuando correspondan.
