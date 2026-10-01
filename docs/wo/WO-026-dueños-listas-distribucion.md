# WO-026 — Dueños por lista de distribución / tipo de reporte

**Prioridad:** P2 · **Responsable:** Paradixe · **Origen:** reunión 2026-10-01, 0:03–1:21

## Contexto
El módulo "Listas de Distribución" ya existe (agregar y quitar correos por
reporte o documento). Acordado: cada lista tiene uno o varios **dueños** (no
necesariamente IT) que pueden editarla sin pedírselo a nadie; ej. Lista de
Empaque de COMEX, y luego Comercial. IT / administración asigna los dueños.

Hoy las listas no tienen dueño: las edita cualquiera con el permiso de
configuración.

## Alcance
1. Campo "dueños" (usuarios) por lista; visible junto a la lista (p. ej. al lado de Lista de Empaque).
2. Un dueño puede editar su lista aunque no tenga el permiso general de configuración; administración asigna y quita dueños.
3. Auditoría de cada cambio de destinatarios (quién, cuándo, qué).

## Criterios de aceptación
- Un usuario dueño de la lista de Lista de Empaque la edita; no puede editar otra lista de la que no es dueño.
- Cada cambio queda en Auditoría.
