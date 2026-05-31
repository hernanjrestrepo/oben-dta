# Oben DTA - Digitalización Total Autónoma

## Demo de Automatización B2B con IA

Este sistema simula un flujo completo de automatización B2B:

```
Email del Comprador → IA Parsea → Cotización → PDF → Aprobación Email → Link Pago → Pago → Producción → Entrega
```

---

## Requisitos Previos

- **Node.js** 20+ (`node -v` para verificar)
- **npm** incluido con Node.js
- **Docker** y **Docker Compose**
- **PostgreSQL** corre en puerto 5433 (mapeado desde 5432 para evitar conflictos)
- **Redis** corre en puerto 6380 (mapeado desde 6379)

---

## Estructura del Proyecto

```
dta/
├── docker/
│   └── docker-compose.yml          # Infraestructura: PostgreSQL + Redis
├── backend/
│   ├── package.json
│   ├── .env
│   └── src/                        # NestJS + TypeORM + PDFKit
├── frontend/
│   ├── package.json
│   └── src/app/page.tsx            # Next.js 16 + Tailwind
├── scripts/
│   └── flow-simulator.sh           # Simulador paso a paso del COMPRADOR
└── README-RUN.md                   # Este archivo
```

---

## PASO 1: Iniciar Infraestructura

```bash
cd dta/docker
docker-compose up -d
```

Verifica:
```bash
# PostgreSQL debe responder en 5433
docker-compose ps
```

> **Nota:** Los puertos están remapeados: PostgreSQL `5433`, Redis `6380` para evitar conflictos con servicios locales.

---

## PASO 2: Compilar y Ejecutar Backend

```bash
cd dta/backend
npm install
npm run build
PORT=3002 npm run start:dev
```

El backend se levanta en `http://127.0.0.1:3002`.

Verifica:
```bash
curl -s http://127.0.0.1:3002
# Debe responder: "Hello World!"
```

**Rutas importantes del backend:**
| Endpoint | Descripción |
|----------|-------------|
| `POST /quotes/email` | Recibe email del comprador, crea cotización |
| `POST /quotes/:id/pdf` | Genera PDF de cotización |
| `GET /quotes/:id/pdf` | Ver PDF inline en navegador |
| `POST /quotes/:id/approve` | Aprueba cotización (simula respuesta email) |
| `POST /quotes/:id/payment-link` | Crea link de pasarela de pago |
| `POST /quotes/:id/pay` | Simula pago recibido |
| `GET /quotes` | Lista todas las cotizaciones |

---

## PASO 3: Ejecutar Frontend

```bash
cd dta/frontend
npm install
npm run dev
```

El frontend se levanta en `http://localhost:3000`.

**Abre el navegador en:**
```
http://localhost:3000
```

> **Importante:** Abre directamente `localhost:3000`, **NO** uses el Browser Preview del IDE (el proxy no soporta WebSockets para HMR, aunque eso no afecta el funcionamiento).

---

## PASO 4: Simular el Flujo (Terminal → Web)

El script `flow-simulator.sh` simula las **acciones del COMPRADOR** desde terminal. La web muestra en tiempo real lo que la **IA de Oben** hace automáticamente.

### Cómo usarlo:

```bash
cd dta
bash scripts/flow-simulator.sh
```

El script es **interactivo paso a paso**. Presiona **ENTER** después de cada paso para avanzar.

### Flujo completo:

| Paso | Acción en Terminal (Comprador) | Lo que ves en la Web (IA Oben) |
|------|--------------------------------|--------------------------------|
| 1 | Envía email pidiendo cotización | `Email Recibido` → `IA Analizando` → `Cotización Generada` |
| 2 | *(automático en backend)* | `PDF Enviado al Cliente` → Clic "Ver PDF" |
| 3 | Responde email: "APROBADO" | `Aprobada por Cliente` → `Orden Creada` |
| 4 | *(automático en backend)* | `Link de Pago Enviado` |
| 5 | **Paga desde la web** | Clic "Simular Pago del Cliente" |
| 6 | *(automático)* | `Pago Verificado` → `En Producción` → `Entregada` |

---

## Para Tomar Capturas de Pantalla Paso a Paso

### Opción A: Desde la Web (recomendado)

1. Abre `http://localhost:3000` en Chrome/Firefox
2. Ejecuta el simulador: `bash scripts/flow-simulator.sh`
3. Después de **cada ENTER** en terminal, toma captura de la web
4. Verás la timeline del flujo actualizarse en tiempo real

### Opción B: Script automático con pausas largas

Si necesitas más tiempo entre pasos para capturas, edita el script:

```bash
# En flow-simulator.sh, reemplaza:
wait_key()

# Con una función que espere más tiempo:
wait_key() {
  echo ""
  echo "Esperando 10 segundos para captura..."
  sleep 10
  echo ""
}
```

---

## Comandos Útiles para Debugging

```bash
# Ver todas las cotizaciones
curl -s http://127.0.0.1:3002/quotes | python3 -m json.tool

# Ver PDF de una cotización (abre en navegador)
http://127.0.0.1:3002/quotes/<QUOTE_ID>/pdf

# Pagar desde terminal (reemplaza <QUOTE_ID>)
curl -X POST http://127.0.0.1:3002/quotes/<QUOTE_ID>/pay

# Ver logs del backend
tail -f /tmp/backend.log

# Ver logs del frontend
tail -f /tmp/frontend.log
```

---

## Estados del Flujo

```
RECEIVED          → Email recibido
PARSING           → IA analizando texto del email
QUOTED            → Cotización generada con precios
SENT              → PDF generado y enviado
APPROVED          → Cliente aprobó por email
ORDERED           → Orden interna creada
PAYMENT_PENDING   → Link de pago enviado al cliente
PAID              → Pago verificado
IN_PRODUCTION     → En producción, inventario descontado
READY_FOR_DELIVERY → Lista para envío
DELIVERED         → Pedido entregado
```

---

## Colores de la Marca Oben Group

| Color | Hex | Uso |
|-------|-----|-----|
| Azul corporativo | `#003366` | Header, botones primarios |
| Verde sostenibilidad | `#009966` | Éxito, progreso completado |
| Naranja energía | `#FF6600` | Pagos, acciones urgentes |
| Gris industrial | `#333333` | Texto principal |
| Fondo | `#F5F7FA` | Background de la app |

---

## Si algo falla...

### Puerto 3000 ocupado:
```bash
kill $(lsof -t -i:3000) 2>/dev/null || true
```

### Puerto 3002 ocupado:
```bash
kill $(lsof -t -i:3002) 2>/dev/null || true
```

### Docker no responde:
```bash
cd dta/docker
docker-compose down
docker-compose up -d
```

### Dependencias rotas:
```bash
cd dta/frontend
rm -rf node_modules package-lock.json
npm install
```

---

## Licencia

Demo interno Oben Group - Digitalización Total Autónoma.
