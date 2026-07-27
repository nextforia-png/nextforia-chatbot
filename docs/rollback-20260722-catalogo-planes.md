# Plan de rollback — Catálogo de planes y bots (v92)

Rama: `codex/staging-customer-panel` · Agente: Claude (Super Admin) · Solo Staging.
**No desplegado.** Requiere verificación de Claude (Deployment) antes de subir.

---

## Qué se desactiva y en qué orden

El cambio está detrás del gate existente `CUSTOMER_ACCESS_V2_ENABLED`. Eso da tres
niveles de reversión, del más rápido al más profundo. Usar el mínimo que resuelva.

### Nivel 1 — Apagar el gate (segundos, sin desplegar)

En las variables de entorno de Staging:

```
CUSTOMER_ACCESS_V2_ENABLED=0
```

Reiniciar el servicio. Efecto inmediato:

- La sección "Planes y bots" desaparece del menú del Super Admin.
- La tarjeta "Ciclo de vida de clientes" desaparece.
- Los endpoints `/admin/catalogs*`, `/admin/tenants*` y `/admin/panel/catalogs`
  responden 404.
- El resto del Super Admin (Resumen, Clientes, Leads, bots, Bandeja) sigue igual.

Los datos no se tocan. Volver a poner `=1` restaura todo tal cual.

### Nivel 2 — Revertir el código (minutos)

```
git revert <SHA>
git push origin codex/staging-customer-panel
```

El commit es autocontenido. Revertirlo deja la base de datos con las columnas y
funciones nuevas, pero sin nadie que las use: es un estado inerte y seguro. Los
precios cargados se conservan por si se vuelve a aplicar.

### Nivel 3 — Revertir la base de datos (solo si es necesario)

```sql
\i docs/migrations/20260722_catalogo_planes_down.sql
```

**Antes de correrlo, exportar los precios.** El `_down` elimina las columnas, así
que se pierden los precios del catálogo y los snapshots de precio contratado de
cada cliente. Si algún cliente ya firmó a un precio dado, ese dato desaparece y
no se puede reconstruir.

```sql
-- Ejecutar y guardar el resultado antes del rollback de base de datos:
select id, name, precio_setup, precio_mensual, chats_incluidos, beneficios, etiqueta, orden
  from public.platform_plans;
select id, company_name, plan_id, precio_setup_contratado, precio_mensual_contratado, plan_contratado_en
  from public.tenants;
```

El `_down` también normaliza los estados nuevos a los heredados
(`activo`→`live`, `suspendido`/`archivado`→`paused`) para que el constraint
anterior pueda volver a aplicarse.

---

## Qué NO revierte el rollback

- Clientes ya eliminados con `/admin/tenants/:id/delete`. El borrado es real y
  definitivo. El respaldo JSON que se descargó en ese momento es la única copia.
- Filas de auditoría con acciones nuevas: el `_down` las borra para poder
  restaurar el constraint anterior.

---

## Verificación después de revertir

1. `GET /admin/health` responde 200.
2. `GET /admin/super-admin` carga y muestra el menú sin "Planes y bots".
3. `GET /admin/customer-access/catalogs` sigue devolviendo planes y bots
   (esta ruta existía antes y debe seguir funcionando).
4. El Panel de Cliente carga y permite iniciar sesión.
5. `pnpm test` en verde.

---

## Riesgo residual

Bajo. El cambio es aditivo: columnas nuevas con valor por defecto, funciones
nuevas, y un constraint que se **amplía** en vez de restringirse. No se eliminó
ni renombró nada existente. La única ruta preexistente modificada es
`platform_customer_access_catalogs_v2`, que conserva su firma y su semántica y
solo agrega campos — los consumidores que leían `id` y `name` siguen andando.
