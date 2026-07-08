# Despliegue Definitivo — DTA Oben (estado y camino a URL pública)

> Honestidad ante todo: el sistema está desplegado y operativo en el servidor, pero
> NO tiene aún una URL pública accesible desde cualquier ubicación. La causa es de
> red/infraestructura de Oben, no del software.

## Estado actual del despliegue

| Elemento | Estado |
|---|---|
| Servicios en servidor (4 contenedores + Ollama) | ✅ healthy |
| Health check `/health` | ✅ `{"status":"ok","db":"ok"}` |
| Login operativo | ✅ |
| Acceso por túnel SSH (`http://localhost:3000`) | ✅ funcional |
| **URL pública / DNS** | 🔴 no |
| **Reverse proxy** | 🔴 no |
| **SSL / HTTPS** | 🔴 no |

## El bloqueo (evidencia)
- `ufw` del servidor: **inactivo** → no es el servidor quien bloquea.
- Desde la máquina cliente (VPN): puerto 22 (SSH) `TcpTestSucceeded: True`;
  puertos 3000/3004 `False`.
- Conclusión: un **firewall/ACL corporativo aguas arriba** solo permite SSH. Abrir el
  acceso web requiere acción de IT de Oben.

## Acceso provisional (hoy)
Túnel SSH desde la máquina del operador:
```
plink -ssh -N -L 3000:localhost:3000 -L 3004:localhost:3004 paradixexyz@10.50.30.10
# luego abrir http://localhost:3000
```
Limitación: temporal, mono-usuario, depende de la sesión del operador. **No es producción.**

## Camino a URL pública estable (requiere IT de Oben — elegir una)

### Opción A — Abrir puertos en el firewall
1. IT abre 3000/3004 (o solo 80/443 si se usa proxy) hacia el servidor.
2. Reconstruir frontend con `NEXT_PUBLIC_BACKEND_URL=http://10.50.30.10:3004`.
3. URL: `http://10.50.30.10:3000`.

### Opción B (recomendada) — Reverse proxy + dominio + SSL
1. Instalar nginx en el servidor como reverse proxy:
   - `/` → frontend :3000
   - `/api` → backend :3004
2. Asignar un subdominio interno (ej. `dta.obengroup.co`) en el DNS de Oben.
3. Certificado SSL (Let's Encrypt si hay salida 80/443, o cert corporativo).
4. URL: `https://dta.obengroup.co` (un solo origen, sin problema de CORS/NEXT_PUBLIC).
5. IT abre 443 hacia el servidor.

## Entregables de acceso (estado)
| Entregable | Valor | Estado |
|---|---|---|
| URL pública | (pendiente IT) | 🔴 |
| Frontend URL | http://localhost:3000 (túnel) | 🟡 provisional |
| Backend URL | http://localhost:3004 (túnel) | 🟡 provisional |
| Health URL | http://localhost:3004/health | ✅ (vía túnel) |

**No depende de la máquina del desarrollador:** el stack corre 100% en el servidor de
Oben. Lo único que falta para "acceso desde cualquier ubicación" es la apertura de red,
que es decisión de IT de Oben.
