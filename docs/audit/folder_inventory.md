# Inventario Completo de Carpetas

## Estructura General del Proyecto

```
.
├── Business/
│   ├── Ofertas/
│   ├── Presentaciones/
│   └── Software/
├── Software/
│   └── dta/
│       ├── backend/
│       │   ├── src/
│       │   │   ├── modules/
│       │   │   │   ├── flow/
│       │   │   │   └── mock/
│       │   │   └── test/
│       │   └── dist/
│       │       └── modules/
│       │           ├── flow/
│       │           └── mock/
│       ├── config/
│       ├── docker/
│       ├── docs/
│       ├── frontend/
│       │   ├── public/
│       │   ├── src/
│       │   │   └── app/
│       │   └── .next/
│       └── scripts/
├── backend/
│   ├── src/
│   │   ├── common/
│   │   │   ├── decorators/
│   │   │   ├── dto/
│   │   │   ├── filters/
│   │   │   ├── guards/
│   │   │   └── interceptors/
│   │   ├── entities/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   └── dto/
│   │   │   ├── clients/
│   │   │   │   └── dto/
│   │   │   ├── flow/
│   │   │   ├── ia/
│   │   │   ├── invoices/
│   │   │   ├── mock/
│   │   │   ├── orders/
│   │   │   │   └── dto/
│   │   │   ├── products/
│   │   │   │   └── dto/
│   │   │   └── quotes/
│   │   └── test/
│   └── dist/
│       ├── common/
│       │   ├── decorators/
│       │   └── guards/
│       ├── entities/
│       └── modules/
│           ├── auth/
│           │   └── dto/
│           ├── clients/
│           │   └── dto/
│           ├── flow/
│           ├── ia/
│           ├── mock/
│           ├── orders/
│           │   └── dto/
│           ├── products/
│           │   └── dto/
│           └── quotes/
├── frontend/
│   ├── public/
│   ├── src/
│   │   └── app/
│   └── .next/
├── dta-oben-group/
│   ├── backend/
│   │   └── src/
│   │       ├── common/
│   │       ├── config/
│   │       └── modules/
│   │           ├── ai-engine/
│   │           ├── billing/
│   │           ├── clients/
│   │           ├── inventory/
│   │           ├── mock-apis/
│   │           ├── orders/
│   │           ├── production/
│   │           └── workflow/
│   ├── database/
│   ├── docs/
│   ├── frontend/
│   │   ├── public/
│   │   └── src/
│   │       ├── app/
│   │       │   ├── dashboard/
│   │       │   ├── portal/
│   │       │   └── workflow/
│   │       ├── components/
│   │       │   ├── dashboard/
│   │       │   ├── portal/
│   │       │   ├── shared/
│   │       │   └── ui/
│   │       ├── hooks/
│   │       ├── lib/
│   │       └── types/
├── agents/
├── config/
├── configs/
├── docker/
├── docs/
├── infrastructure/
├── memory/
├── projects/
│   └── dta-oben/
├── prompts/
├── scripts/
├── shared/
└── tests/
```