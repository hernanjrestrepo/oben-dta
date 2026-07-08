# Inventario Técnico de Endpoints — DTA Oben

> Extraído por grep directo sobre `backend/src` (`@Controller`, `@Get/@Post/@Put/@Delete/@Patch`)
> y cruzado contra `app.module.ts` (imports reales) y cada `*.module.ts` (controllers reales).
> Ningún endpoint aquí listado como "vivo" es supuesto: todos están montados en el árbol de
> módulos que arranca en `AppModule`. Documento de inventario — no se modifica código en esta fase.

## Cómo se verificó "vivo" vs "muerto"
Un controller está **vivo** si su módulo aparece en `AppModule.imports` (directo o anidado) o si
el controller está en el array `controllers:` de `AppModule` mismo. Se confirmó además que ningún
otro módulo importa los módulos huérfanos (`grep` de `NotificationModule`/`AIModule` en todo `src`
no devuelve imports, solo la propia declaración de la clase).

`AppModule.imports`: `AuthModule, ClientsModule, ProductsModule, OrdersModule, InvoicesModule,
EvaModule, AdanModule, IntegrationsModule, QuotesModule, SeedModule, DashboardModule`.
`AppModule.controllers`: `AppController, HealthController`.

`DashboardModule.controllers` = `[DashboardController, TestController]` → **ambos viven**, porque
`DashboardModule` está importado en `AppModule`. Esto significa `TestController` (`/test`) SÍ está
vivo, a diferencia de lo asumido antes de cruzar el código.

---

## Endpoints VIVOS (montados, alcanzables)

### `/auth` — `auth/auth.controller.ts`
| Método | Ruta | Notas |
|---|---|---|
| POST | `/auth/register` | |
| POST | `/auth/login` | devuelve `access_token` + `refresh_token` |
| POST | `/auth/refresh` | acepta `refreshToken` y `refresh_token` (fix aplicado) |
| POST | `/auth/logout` | |

### `/clients` — `modules/clients/clients.controller.ts`
| Método | Ruta |
|---|---|
| POST | `/clients` |
| GET | `/clients` |
| GET | `/clients/:id` |
| PUT | `/clients/:id` |
| DELETE | `/clients/:id` |

### `/products` — `modules/products/products.controller.ts`
| Método | Ruta |
|---|---|
| POST | `/products` |
| GET | `/products` |
| GET | `/products/:id` |
| GET | `/products/sku/:sku` |
| PUT | `/products/:id` |
| DELETE | `/products/:id` |

### `/orders` — `modules/orders/orders.controller.ts`
| Método | Ruta |
|---|---|
| POST | `/orders` |
| GET | `/orders` |
| GET | `/orders/:id` |
| PUT | `/orders/:id/status` |
| DELETE | `/orders/:id` |

### `/invoices` — `modules/invoices/invoices.controller.ts`
| Método | Ruta |
|---|---|
| POST | `/invoices` |
| GET | `/invoices` |
| GET | `/invoices/:id` |
| PUT | `/invoices/:id/status` |

### `/quotes` — `modules/quotes/quotes.controller.ts`
| Método | Ruta |
|---|---|
| POST | `/quotes/email` |
| GET | `/quotes` |
| GET | `/quotes/:id` |
| POST | `/quotes/:id/pdf` |
| GET | `/quotes/:id/pdf` |
| POST | `/quotes/:id/approve` |
| POST | `/quotes/:id/payment-link` |
| POST | `/quotes/:id/pay` |
| POST | `/quotes/:id/production` |
| POST | `/quotes/:id/ready` |
| POST | `/quotes/:id/delivered` |
| GET | `/quotes/inbox/emails` |

### `/eva` — `modules/ia/eva.controller.ts` (EVA real — congelado, no tocar)
| Método | Ruta |
|---|---|
| POST | `/eva/process` | NL → tool calling (qwen2.5:3b) → persistencia real |
| GET | `/eva/health` | |

### `/adan` — `modules/adan/adan.controller.ts` (ADÁN real — congelado, no tocar)
| Método | Ruta |
|---|---|
| POST | `/adan/ask` | RAG con fuentes citadas |
| POST | `/adan/ingest-text` | |
| POST | `/adan/ingest` | multipart, PDF/DOCX/XLSX/TXT/MD |
| GET | `/adan/documents` | |
| GET | `/adan/stats` | |

### `/integrations` — `modules/integrations/integrations.controller.ts` (Integration Hub — congelado)
| Método | Ruta | Estado real |
|---|---|---|
| GET | `/integrations/status` | refleja `pendiente_credenciales` por sistema |
| GET | `/integrations/veta/vendors` | `pendiente_credenciales` |
| GET | `/integrations/veta/items` | `pendiente_credenciales` |
| GET | `/integrations/veta/purchase-orders` | `pendiente_credenciales` |
| GET | `/integrations/veta/receipts` | `pendiente_credenciales` |
| POST | `/integrations/netsuite/suiteql` | `pendiente_credenciales` |

### `/dashboard` — `controllers/dashboard.controller.ts` (vía `DashboardModule`)
| Método | Ruta |
|---|---|
| GET | `/dashboard` |
| GET | `/dashboard/production` |
| GET | `/dashboard/sales` |
| GET | `/dashboard/logistics` |
| GET | `/dashboard/inventory` |
| GET | `/dashboard/clients` |
| GET | `/dashboard/system` |
| GET | `/dashboard/trend` |

### `/test` — `controllers/test.controller.ts` (vía `DashboardModule`)
| Método | Ruta | Nota |
|---|---|---|
| GET | `/test` | endpoint trivial de verificación; vivo porque comparte módulo con Dashboard. Candidato a remover en limpieza futura (no en esta fase — congelado el desarrollo). |

### Raíz / infraestructura
| Método | Ruta | Controller |
|---|---|---|
| GET | `/` | `app.controller.ts` (`AppController`, directo en `AppModule`) |
| GET | `/health` | `controllers/health.controller.ts` (directo en `AppModule`) |

**Total endpoints vivos: 56**

---

## Endpoints MUERTOS (código presente, módulo NUNCA importado — no alcanzables)

Verificado: ni `AIModule` ni `NotificationModule` aparecen en `AppModule.imports`, ni son
importados por ningún otro módulo del proyecto (grep sin resultados de import en todo `src`).
Por lo tanto estas rutas **no responden en runtime**, aunque el código compile.

### `controllers/ai.controller.ts` → `AIModule` (`modules/ai.module.ts`) — MUERTO
`@Controller('ai')`: `GET /ai/production-efficiency`, `GET /ai/demand-prediction/:productId`,
`GET /ai/credit-risk/:clientId`, `GET /ai/inventory-optimization`, `GET /ai/shipment-optimization`,
`POST /ai/analyze-content`, `POST /ai/extract-information`, `POST /ai/business-insights`.

### `controllers/notification.controller.ts` → `NotificationModule` (`modules/notification.module.ts`) — MUERTO
`@Controller('notifications')`: `GET /notifications`, `GET /notifications/unread-count`,
`GET /notifications/high-priority`, `GET /notifications/category/:category`,
`PUT /notifications/:id/read`, `PUT /notifications/read`, `PUT /notifications/:id/dismiss`,
`DELETE /notifications/:id`, `GET /notifications/stats`, `POST /notifications/test`.

**Recomendación:** mantener documentado como código muerto en esta fase (no se autoriza tocar
código funcional). Candidato a eliminación en una futura limpieza, fuera del alcance de esta misión.

---

## Resumen
| Categoría | Cantidad |
|---|---|
| Controllers vivos | 13 |
| Endpoints vivos | 56 |
| Controllers muertos (no montados) | 2 (`AIController`, `NotificationController`) |
| Endpoints muertos | 18 |

Evidencia: comandos `grep` ejecutados directamente sobre `backend/src` el 2026-06-23, listados
arriba método por método, sin inferencia ni documentación previa.
