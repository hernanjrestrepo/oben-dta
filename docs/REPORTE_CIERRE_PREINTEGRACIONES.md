# Reporte de Cierre — Pre-Integraciones DTA Oben

> Fecha: 2026-06-22 · Servidor `10.50.30.10`. Nada marcado como completo sin
> evidencia ejecutada y documentada. Las integraciones NO se inician hasta recibir
> información oficial de Oben.

## Estado general

El núcleo de DTA (EVA + ADÁN + plataforma) está **construido, desplegado en el
servidor y validado con pruebas ejecutadas**. El Integration Hub está construido y
desplegado, a la espera de credenciales. El único entregable que NO se pudo completar
por una causa fuera del código es el **acceso público externo** (firewall corporativo).

## Porcentaje real por fase

| Fase | Estado | % | Evidencia |
|---|---|---|---|
| 1 · Auditoría final | ✅ | 100% | AUDITORIA_FINAL_DTA.md (estado real capturado) |
| 2 · Testing completo | ✅ | 100% | EJECUCION_PRUEBAS.md (EVA 5/5, ADÁN + 5 formatos, SEC 8/8) |
| 3 · Pipeline ADÁN masivo | ✅ | 100% | importador por carpetas + 8 carpetas; PDF/DOCX/XLSX validados y limpiados |
| 4 · Hardening | ✅ | 95% | flow/mock/regex eliminados; refresh corregido; (ai.module inerte queda documentado) |
| 5 · Despliegue público | 🔴 | 40% | desplegado y accesible por túnel; SIN URL pública/DNS/SSL — **bloqueado por firewall** |
| 6 · Manual operación | ✅ | 100% | MANUAL_OPERACION.md |
| 7 · Backup y recuperación | ✅ | 100% | PLAN_BACKUP.md (restore validado, datos coincidentes) |
| 8 · Requerimientos Oben | ✅ | 100% | REQUERIMIENTOS_OBEN.md |

**Avance global ponderado: ~88%.** El 12% restante son dos bloqueos externos (no de
código): acceso público (IT/red) e integraciones (credenciales).

## Componentes terminados (con evidencia ejecutada)
- EVA: order-to-cash autónomo, persistencia real, bloqueos y escalamiento. ✅
- ADÁN: RAG con pgvector + embeddings locales; ingesta PDF/DOCX/XLSX/TXT/MD; no inventa. ✅
- Centro IA: EVA + ADÁN reales + KPIs en vivo. ✅
- Seguridad: login, JWT, refresh, RBAC, anti-escalada de privilegios. ✅
- Integration Hub: arquitectura común + VETA/NetSuite/Armstrong (lectura), degradación honesta. ✅
- Backup/restore validado. ✅
- Despliegue en servidor: 4 contenedores healthy + Ollama. ✅

## Componentes pendientes
- **Acceso público externo:** requiere que IT de Oben abra puertos 3000/3004 (o publique
  vía reverse proxy + dominio + SSL). Hoy accesible solo por túnel SSH. **No es código.**
- **Integraciones reales (VETA/NetSuite/Armstrong):** requieren credenciales + base URLs +
  contrato de Armstrong (ver REQUERIMIENTOS_OBEN.md). **No es código.**
- `ai.module.ts` inerte (no montado en AppModule): candidato a borrar en próxima limpieza.

## Riesgos
1. **RAM del servidor (15 GB):** EVA (qwen2.5:3b ~2 GB) + stack conviven bien hoy; subir a
   7b/8b apretaría la RAM. Mantener 3b salvo upgrade de hardware.
2. **Calidad de redacción del modelo 3b:** en casos límite (producto inexistente) el texto
   final puede ser impreciso, sin afectar la lógica ni la persistencia.
3. **Sin sandbox de Oben confirmado:** probar integraciones contra producción exige ventana
   controlada y aprobación.
4. **Acceso por túnel es temporal:** no apto para uso productivo multiusuario.

## Recomendaciones
1. Solicitar a IT de Oben apertura de 3000/3004 **o** publicar tras reverse proxy (nginx) con
   dominio + Let's Encrypt para una URL HTTPS estable.
2. Solicitar credenciales y documentación de integraciones (REQUERIMIENTOS_OBEN.md).
3. Activar el cron de backup diario (PLAN_BACKUP.md).
4. Cargar conocimiento corporativo real en `/knowledge/**` y correr `import-knowledge.sh`.
5. No habilitar escritura en integraciones hasta payloads validados + pruebas + aprobación + rollback.

## Conclusión
DTA está **listo para integración a nivel de código y plataforma**. Cuando lleguen las
credenciales de Oben, el procedimiento es: configurar variables → reiniciar backend →
validar respuestas (sin tocar código). El acceso público es el único frente que depende
de infraestructura/red de Oben, no del desarrollo.
