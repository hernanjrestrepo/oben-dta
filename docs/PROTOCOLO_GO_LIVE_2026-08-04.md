# Protocolo Go-Live — Piloto Oben (2026-08-04)

Objetivo del día: dejar el sistema **operativo de punta a punta** — correo real entra, se procesa solo, se responde solo — o, si algo lo bloquea, saber exactamente qué falta y por qué antes de la reunión.

Orden estricto: cada fase depende de que la anterior haya salido bien. No saltar pasos para "ir más rápido" — la Fase 0 en particular puede tumbar todo lo demás si se omite.

---

## Fase 0 — Verificación que puede reventar todo si se salta (15 min, la haces tú/Oben IT)

**Riesgo real, no teórico:** desde 2022 Microsoft 365 **desactiva por defecto** la autenticación básica (usuario+contraseña) para IMAP y SMTP en Exchange Online. El conector que construimos usa autenticación básica (`user`/`pass`). Si el tenant de Oben tiene la política por defecto, **la conexión va a fallar con error de autenticación aunque la contraseña sea correcta** — y se puede perder tiempo depurando "contraseña mala" cuando en realidad es una política de Microsoft.

**Antes de darme ninguna credencial, pídele al admin de Microsoft 365 de Oben que confirme:**

1. ¿Está habilitada la autenticación básica de **IMAP** para el buzón `pedidosdeventa.co@obengroup.com`? (Exchange admin center → Roles → Authentication policies, o `Get-CASMailbox pedidosdeventa.co@obengroup.com | select ImapEnabled,IMAPAuth*` vía PowerShell).
2. ¿Está habilitada la autenticación básica de **SMTP AUTH** para ese mismo buzón? (`Get-CASMailbox ... | select SmtpClientAuthenticationDisabled`).
3. Si alguna está deshabilitada (lo más probable si nadie la tocó antes), pedirle que la habilite **solo para este buzón** (no hace falta para todo el tenant) — es una excepción puntual y reversible, no un hueco de seguridad del tenant completo.

**Si Oben no puede/quiere habilitar autenticación básica** (algunas organizaciones lo bloquean por política de seguridad corporativa y no hacen excepciones): avísame. La alternativa es implementar OAuth2 (registro de app en Azure AD + flujo de token) — es un trabajo adicional real, no una simple config, y no está construido todavía. Mejor saberlo hoy temprano que descubrirlo a media prueba.

☐ Confirmado con Oben IT: IMAP básico habilitado para el buzón
☐ Confirmado con Oben IT: SMTP AUTH básico habilitado para el buzón
☐ (Si alguno está bloqueado) Decidido: ¿esperamos a que Oben lo habilite, o entramos a construir OAuth2?

---

## Fase 1 — Datos exactos de conexión (5 min, tú)

Necesito estos 6 valores confirmados, sin ambigüedad (el mensaje anterior llegó cortado):

| Dato | Valor que tengo | Confirmar |
|---|---|---|
| IMAP host | `outlook.office365.com` (estándar M365) | ☐ |
| IMAP puerto | ✅ Confirmado: 993 (el `9993` era un typo — probado en vivo el 2026-08-24) | ☑ |
| SMTP host | `smtp.office365.com` (estándar M365) | ☐ |
| SMTP puerto | `587` (STARTTLS) | ☐ |
| Usuario | `pedidosdeventa.co@obengroup.com` | ☐ |
| Contraseña / app password | la que ya tengo registrada — confirmar que sigue vigente | ☐ |

**Actualización 2026-08-24:** probado en vivo con la contraseña real. `outlook.office365.com:993` conecta perfecto (TCP+TLS), pero rechaza el login con **"Login is disabled"** — confirma exactamente el bloqueo de autenticación básica de M365 anticipado en la Fase 0. `smtp.office365.com:587` también rechaza la autenticación (mismo tipo de bloqueo). El puerto/host ya NO son el problema — el problema es 100% la política de autenticación básica en Microsoft 365, que solo el admin de Oben puede habilitar.

---

## Fase 2 — Activar el conector (10 min, la hago yo, tú solo confirmas)

Con los datos de la Fase 1 confirmados, activo el conector actualizando `tenant.integration_config` del tenant `oben` en la base de datos real:

```json
{
  "email": {
    "mode": "real",
    "smtp": {
      "host": "smtp.office365.com",
      "port": 587,
      "secure": false,
      "user": "pedidosdeventa.co@obengroup.com",
      "pass": "***",
      "fromAddress": "pedidosdeventa.co@obengroup.com"
    },
    "imap": {
      "enabled": true,
      "host": "outlook.office365.com",
      "port": 993,
      "secure": true,
      "user": "pedidosdeventa.co@obengroup.com",
      "pass": "***",
      "folder": "INBOX",
      "processedFolder": "Procesados"
    }
  }
}
```

**Antes de activar el intake completo, primero verifico solo la conexión** (login IMAP + `health()` del adaptador SMTP), sin dejar el listener corriendo — así confirmo credenciales sin tocar ningún correo real todavía.

☐ Carpeta **"Procesados"** creada de antemano en el buzón (Outlook/OWA) — si no existe, el conector sigue funcionando (marca leído igual) pero avisa en logs que no pudo mover el correo. Mejor crearla antes para que quede limpio desde el primer correo.

---

## Fase 3 — Prueba controlada, NO con correos reales de clientes (15 min)

1. Reinicio el backend con el conector activado y me quedo viendo `docker logs -f dta-backend` en vivo.
2. Tú (o yo) enviamos **un correo de prueba** desde una cuenta controlada (tu correo personal, no un cliente real) a `pedidosdeventa.co@obengroup.com`, con un texto tipo: *"Favor cotizar 500 kg de BOPP Transparente"*.
3. Verifico en vivo:
   - ☐ El conector detecta el correo nuevo (log de IMAP).
   - ☐ Se clasifica correctamente como `quote_request`.
   - ☐ Se genera la cotización real (mismo pipeline que ya probamos: ~200-600ms).
   - ☐ Se envía la respuesta por SMTP real (llega al remitente de prueba).
   - ☐ El correo original queda marcado como leído y movido a "Procesados".
   - ☐ Queda auditado en `email_intake_messages` (yo lo verifico por base de datos).
4. Repito una vez más con el **mismo correo de prueba reenviado** (mismo Message-ID) para confirmar que la idempotencia lo ignora en vez de duplicar la cotización.

**No avanzamos a la Fase 4 si algo de esto falla.** Si falla, lo diagnostico con los logs en vivo antes de tocar nada más.

---

## Fase 4 — Primer correo real de un cliente real (cuando Fase 3 esté 100% limpia)

Dejamos el conector corriendo y esperamos (o le pedimos a alguien de Oben que reenvíe) un correo real de un cliente real. Observamos en vivo el mismo checklist de la Fase 3. Esta es la primera prueba de "producción real" — la hacemos con el equipo mirando, no desatendida.

☐ Primer correo real procesado correctamente de punta a punta.

---

## Fase 5 — Recuperación automática en el host real (bloqueado por acceso)

Esto **no se puede hacer sin que me confirmes dónde va a correr el piloto en definitivo**:

- ¿Sigue siendo esta misma máquina Windows, o hay/habrá un servidor Linux dedicado?
- Si es Linux: dame acceso (SSH o que tú ejecutes los 2 comandos que te paso) para repetir la prueba que hicimos en Windows (`docker kill dta-backend` + confirmar que `restart: unless-stopped` sí lo revive solo). En Windows no se reinició solo; en Linux debería, pero hay que comprobarlo, no asumirlo.

☐ Host de producción confirmado
☐ Prueba de reinicio automático repetida ahí (pendiente de host)

---

## Fase 6 — Respaldo del trabajo (5 min)

Todo lo construido esta semana (Sprints 5 y 6 completos, conector de correo) sigue **sin comitear a git**. Antes de terminar el día:

☐ Confirmar conmigo que haga `git commit` de todo el trabajo (te muestro el mensaje de commit antes de crearlo).
☐ Decidir si además se hace `git push` a un remoto, o se queda local por ahora.

---

## Fase 7 — Documento final para la reunión

Con las Fases 0-4 cerradas (5 y 6 pueden quedar como "pendiente, con fecha"), escribo el `RELEASE_READINESS.md` de 3-5 páginas que ya pediste: estado por WO, cobertura de pruebas/seguridad/performance, qué quedó dentro y fuera de alcance, riesgos abiertos con dueño y fecha, checklist Go-Live, y la recomendación final (Apto para piloto / Apto para producción / Condicionado / No recomendado).

☐ `RELEASE_READINESS.md` entregado antes de la reunión.

---

## Resumen — qué necesito de ti para arrancar mañana

1. Respuesta de Oben IT sobre autenticación básica IMAP/SMTP (Fase 0) — **esto es lo más urgente, bloquea todo lo demás**.
2. Puerto IMAP real confirmado (¿993 o el 9993 era otra cosa?).
3. Confirmación de que la contraseña del buzón sigue vigente.
4. Luz verde para que yo dispare el correo de prueba controlado.
5. Decisión sobre el host de producción real (para la Fase 5).
6. Confirmación para hacer el commit.

Con eso, las Fases 1-4 y 7 las puedo dejar cerradas el mismo día.
