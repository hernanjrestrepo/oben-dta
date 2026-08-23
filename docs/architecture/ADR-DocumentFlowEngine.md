# ADR — Motor de Orquestación Documental (`DocumentFlowEngine`)

**Estado:** Aceptado · **Fecha:** 2026-07-29 · **Rama:** `sprint2-customer-core`

## 1. Objetivo

Oben Plus tiene (y va a seguir teniendo) varios procesos de negocio con la
misma forma: *ocurre un evento → hace falta reunir uno o más documentos →
esos documentos van a destinatarios concretos → se ejecutan una o más
acciones → todo queda auditado*. Cotizaciones, Órdenes de Compra, el proceso
COMEX (Lista de Empaque, Consumo ME/MP, Costos, Liquidación) y Navieras son
cuatro instancias distintas de ese mismo patrón.

Sin un motor común, cada proceso se construye como un flujo aislado que
repite: generar documento → armar destinatarios → llamar al Hub de
integraciones → escribir auditoría. Eso es exactamente lo que
`QuotesService` hacía antes de esta migración (ver `git log` — método
`generateAndSendPdf` previo a Fase 2).

**El objetivo del `DocumentFlowEngine` es que ese patrón se escriba una sola
vez.** Agregar un proceso de negocio nuevo debe ser, en el caso normal,
*configurar*, no *programar*: un `BusinessEvent`, una o varias
`DocumentFlowRule`, y — solo si el proceso necesita un origen de documento
que no existe todavía — un `DocumentSource` nuevo.

## 2. Responsabilidades (y no-responsabilidades)

El motor:

- Resuelve qué `DocumentFlowRule` aplican a un `(tenant, evento)`.
- Para cada regla, resuelve cada documento requerido contra su `DocumentSource`.
- Si todos los documentos requeridos quedan `ready`, ejecuta las acciones de la regla.
- Traza y audita cada paso (§ 7).

El motor **no sabe** qué es una cotización, una orden de compra, Oracle o un
correo real. Esas nociones viven en:
- Los módulos de negocio (`QuotesModule`, y a futuro `PurchaseOrdersModule`, `ComexModule`, `CarrierModule`), que llaman `engine.handle(evento, contexto)` y registran sus propios generadores de documento.
- Los adaptadores concretos (`sources/`, `actions/`), que sí conocen Oracle, SMTP, PDF, etc.

Esta separación es la que permite migrar Cotizaciones sin que
`document-flow.engine.ts` cambiara una sola línea (verificado: el archivo no
se tocó entre Fase 1 y Fase 2, salvo la instrumentación de observabilidad de
la §7, que es transversal a todos los flujos, no específica de cotizaciones).

## 3. Flujo de ejecución

```
BusinessEvent + DocumentFlowContext
        │
        ▼
DocumentFlowEngine.handle(evento, contexto)
        │  busca DocumentFlowRule activas del tenant para ese evento, por prioridad
        ▼
runRule(regla) — por cada regla activa:
        │
        ├─ por cada requiredDocuments[i]:
        │      DocumentSourceRegistry.resolve(source) → DocumentSource.resolve(...)
        │      → ready | pending | unavailable   (con duración medida)
        │
        ├─ si falta algún documento REQUERIDO → status: "partial", NO ejecuta acciones
        │
        ├─ si todos los requeridos están "ready":
        │      por cada actions[i]:
        │          ActionExecutorRegistry.resolve(type) → ActionExecutor.execute(...)
        │          → executed | skipped | failed   (con duración medida)
        │      status: "completed" (o "skipped" si la regla no tiene acciones)
        │
        └─ WorkflowAuditService.log(...) — siempre, sin importar el resultado
```

Implementación: [`document-flow.engine.ts`](../../backend/src/modules/document-flow/document-flow.engine.ts).

## 4. Componentes

| Componente | Archivo | Rol |
|---|---|---|
| `DocumentFlowEngine` | `document-flow.engine.ts` | Orquestador. Sin lógica de negocio. |
| `DocumentFlowRule` (entidad) | `entities/document-flow-rule.entity.ts` | Configuración por tenant (BD, `document_flow_rules`). |
| `DocumentSourceRegistry` | `document-source.registry.ts` | `DocumentSourceType → DocumentSource`. |
| `ActionExecutorRegistry` | `action-executor.registry.ts` | `ActionType → ActionExecutor`. |
| `DocumentFlowContext` | `document-flow-context.types.ts` | Contexto desacoplado (tenant, usuario, order, client, quote, exportOperation, metadata). |
| CRUD de reglas | `document-flow-rules.controller.ts` / `.service.ts` | `document-flow/rules` — permiso `automations.*` (RBAC existente). |

## 5. Adaptadores de origen documental (`DocumentSource`)

Contrato único en [`document-source.types.ts`](../../backend/src/modules/document-flow/document-source.types.ts):

```ts
interface DocumentSource {
  readonly type: DocumentSourceType;
  resolve(request: DocumentRequest): Promise<ResolvedDocument>;
}
```

| `type` | Implementación | Capa | Uso |
|---|---|---|---|
| `generated` | `GeneratedDocumentAdapter` (`sources/generated-document.adapter.ts`) | — | El propio sistema genera el documento. Los módulos de negocio registran generadores por `generatorKey` en su propio arranque (`OnModuleInit`) — ver `QuotesDocumentFlowRegistration` como referencia para `quote_pdf`. |
| `manual_upload` | `ManualUploadAdapter` | Capa 1 (piloto) | El documento lo sube una persona (ej. los `.xls` que hoy exporta Oracle para Lista de Empaque). Espera el archivo en `context.metadata.uploads[key]`. |
| `oracle` | `OracleAdapter` | Capa 2 (producción) | El documento sale de una consulta real a Oracle vía `IntegrationHubService.call('oracle', ...)`. Hoy resuelve contra el mock (sin credenciales reales); el día que Oben las entregue, el Hub cambia de adapter solo. |
| `external_attachment` | `ExternalAttachmentAdapter` | — | El documento lo produce un tercero fuera de nuestro control (ej. la factura DIAN del proveedor de facturación electrónica de Oben). Nunca se genera, solo se reenvía. |

**Migrar Capa 1 → Capa 2** para un documento es cambiar `source: 'manual_upload'` por `source: 'oracle'` en la `DocumentFlowRule` correspondiente. Cero cambios de código.

## 6. Acciones (`ActionExecutor`)

Contrato único en [`action-executor.types.ts`](../../backend/src/modules/document-flow/action-executor.types.ts). Catálogo maestro en [`action-type.types.ts`](../../backend/src/modules/document-flow/action-type.types.ts):

| `type` | Estado | Ejecutor |
|---|---|---|
| `send_email` | **Implementado** | `SendEmailAction` — arma destinatarios (interpolando `{{path.a.valor}}` contra el contexto), adjunta los documentos `ready`, y llama `IntegrationHubService.call('email', 'send', ...)`. Si `context.metadata.emailSubject/emailBody` vienen precalculados (ej. una plantilla HTML de negocio existente), los usa tal cual en vez de los templates declarativos de la regla. |
| `send_whatsapp`, `create_order`, `update_erp`, `create_invoice`, `attach_external_document`, `update_freight_matrix`, `notify_user`, `execute_integration` | Reservados | Sin ejecutor todavía. Si una regla los referencia, el motor reporta la acción como `failed` ("no registrado") — nunca inventa un resultado ni falla en silencio. |

Agregar una acción nueva no requiere tocar el motor: se crea la clase, se registra en `ActionExecutorRegistry`, y las reglas que la usen empiezan a funcionar.

## 7. Observabilidad

Cada ejecución de regla queda trazada en dos lugares:

1. **`DocumentFlowRuleResult`** (devuelto a quien llamó `engine.handle(...)`), con `documentsTrace`/`actionsTrace` (tipo, estado/resultado, `durationMs`, mensaje si falló), `sourcesUsed`/`actionsUsed` (qué adaptadores/acciones participaron, sin duplicados) y `totalDurationMs`.
2. **`workflow_events`** (permanente, vía `WorkflowAuditService`, consultable en `GET /auditoria`), con `workflowName: 'document_flow'`, `action: <evento>`, `entityId: <ruleId>`, y el mismo `outputData` de trazas.

Evidencia real capturada en el cierre de Fase 2 (`quote_pdf` vía `generated`, `send_email` vía Hub):

```json
{
  "status": "completed",
  "sourcesUsed": ["generated"],
  "actionsUsed": ["send_email"],
  "documentsTrace": [{ "key": "quote_pdf", "state": "ready", "source": "generated", "durationMs": 72 }],
  "actionsTrace": [{ "type": "send_email", "status": "executed", "durationMs": 14 }],
  "totalDurationMs": 86
}
```

Esto responde directamente: qué regla se ejecutó (`entityId`), qué adaptadores participaron (`sourcesUsed`), qué acciones se ejecutaron y cuáles fallaron (`actionsTrace[].status`), cuánto tardó cada paso (`durationMs` por entrada) y el tiempo total (`totalDurationMs`).

## 8. `BusinessEvent`

Catálogo maestro en [`business-event.types.ts`](../../backend/src/modules/document-flow/business-event.types.ts), agrupado por dominio (Cotizaciones, Órdenes de Compra, COMEX, Navieras, Clientes/Cartera) e intencionalmente más amplio que lo emitido hoy — ver el archivo para el detalle y qué está "emitido" vs. "reservado".

## 9. `DocumentFlowRule`

Entidad `document_flow_rules` (jsonb configurable por tenant, sin lógica hardcodeada):

| Campo | Contenido |
|---|---|
| `triggerEvent` | Un `BusinessEvent`. |
| `requiredDocuments` | `{ key, label, source: DocumentSourceType, required, sourceConfig }[]`. |
| `recipients` | `{ label, to: string[], cc?: string[] }[]` — cada entrada de `to`/`cc` admite `{{path.al.valor}}` interpolado contra `DocumentFlowContext` en tiempo de ejecución (ej. `{{client.email}}`). |
| `actions` | `{ type: ActionType, config }[]`. |
| `integrations` | `{ system: IntegrationSystem, purpose }[]` — documentación de qué integraciones toca la regla (no ejecuta nada por sí sola; las acciones/fuentes son las que invocan al Hub). |
| `validations` | Reservado para Fase 3+ (hoy no lo interpreta el motor). |
| `priority` / `status` | Orden de evaluación cuando hay varias reglas activas para el mismo evento; `active` / `inactive` / `draft`. |

CRUD vía `POST/GET/PATCH/DELETE /document-flow/rules` (permiso `automations.*`).

## 10. Feature flags — activación gradual por tenant

Mecanismo: `tenant.settings.documentFlowEngine.<flujo>` (jsonb ya existente en `Tenant`, mismo patrón que `integrationConfig` para adaptadores — sin entidad nueva).

- **Default: `false` / ausente → camino legado**, sin cambios de comportamiento.
- El módulo de negocio (ej. `QuotesService.generateAndSendPdf`) decide internamente cuál camino tomar; la API pública y el resultado son idénticos en ambos.
- Esto permite migrar un flujo, dejarlo correr en paralelo verificable, y activar el motor solo cuando hay evidencia — exactamente el mecanismo usado para validar Cotizaciones (ver `test/document-flow-quotes.e2e-spec.ts`).

**Estado actual del tenant `oben`: `settings = {}` → bandera de cotizaciones en `false`.** Deliberado: se activa después de la prueba de aceptación de correo real (SMTP/IMAP), no antes.

## 11. Cómo agregar un flujo de negocio nuevo

1. Si el evento no existe en `BUSINESS_EVENTS`, agregarlo (una constante, no lógica).
2. En el módulo de negocio correspondiente: donde hoy ocurre el paso "generar documento + notificar", llamar `documentFlowEngine.handle(evento, context)` en vez de la lógica en línea — igual que `QuotesService.generateAndSendPdfViaEngine`.
3. Si el flujo genera un documento propio (PDF, Excel...), registrar un generador en `GeneratedDocumentAdapter` desde un `OnModuleInit` del módulo de negocio (no desde `document-flow/`) — igual que `QuotesDocumentFlowRegistration`.
4. Crear la(s) `DocumentFlowRule` (vía API o seed) con los documentos/destinatarios/acciones reales.
5. Probar detrás de flag apagado por defecto; activar por tenant cuando haya evidencia.

## 12. Cómo crear un `DocumentSource` nuevo

1. Agregar el `type` a `DOCUMENT_SOURCE_TYPES` (`document-source.types.ts`).
2. Implementar la clase (`sources/<nombre>.adapter.ts`) cumpliendo `DocumentSource`.
3. Registrarla en `DocumentSourceRegistry` y en los `providers` de `DocumentFlowModule`.
4. El motor no cambia.

## 13. Cómo crear una `Action` nueva

1. Agregar el `type` a `ACTION_TYPES` (`action-type.types.ts`) si no está ya reservado.
2. Implementar la clase (`actions/<nombre>.action.ts`) cumpliendo `ActionExecutor`.
3. Registrarla en `ActionExecutorRegistry` y en los `providers` de `DocumentFlowModule`.
4. El motor no cambia.

## 14. Verificación de esta ADR

Todo lo descrito aquí está probado, no solo documentado:
- Suite completa: 21/21 suites, 152/152 tests (`npm test`).
- `tsc --noEmit` limpio.
- Prueba de fuego contra Postgres real (`npm run test:e2e` → `test/document-flow-quotes.e2e-spec.ts`): regla resuelta, PDF real (`%PDF` verificado), correo real vía el Hub, auditoría real en `workflow_events` — sin dejar datos de prueba residuales.
- Contenedor `dta-backend` reconstruido y desplegado con este código; `/health` en verde.
