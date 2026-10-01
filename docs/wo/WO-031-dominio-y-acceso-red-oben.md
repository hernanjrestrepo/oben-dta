# WO-031 — Dominio corporativo y acceso desde la red de Oben

**Prioridad:** P2 · **Responsable:** IT de Oben + Paradixe · **Origen:** reunión 2026-10-01, 1:43:01–1:44:31, 1:50:08, 28:21, 33:38

## Contexto
- Oben Xmart se abre por IP: "no se ve bien corporativamente". Hay que definir dominio o subdominio (p. ej. `xmart.obengroup.co`) con certificado.
- José no pudo entrar desde su PC por la red cableada de Oben (sí por Wi-Fi a medias); hay que esperar a Fabián.
- Los correos de Oben llegan con 10–15 min de retraso (firewall), y eso afecta procesos que dependen del buzón (facturas parciales, órdenes de compra).

## Alcance
1. Acordar con IT de Oben el subdominio, registro DNS y certificado TLS; publicar Oben Xmart en él.
2. Acceso desde la red interna de Oben (cableada y Wi-Fi) para todos los usuarios.
3. Escalar a IT de Oben el retraso de correo y medirlo antes y después.

## Criterios de aceptación
- Los usuarios entran por el subdominio con candado válido desde cualquier equipo de Oben.
- Un correo enviado al buzón de pedidos llega en menos de 1 minuto.

## Dependencias
- IT de Oben (DNS, firewall, red). Fabián para el acceso de José.
