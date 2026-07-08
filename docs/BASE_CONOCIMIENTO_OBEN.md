# Base de Conocimiento Oben — Guía de Carga Masiva para ADÁN

> Este documento explica qué debe entregar Oben, cómo organizarlo, qué formatos acepta ADÁN
> y cómo se ejecuta la carga masiva real. **No se carga ningún documento ficticio**: ADÁN solo
> conoce lo que exista físicamente en las carpetas. Hasta hoy no se ha cargado conocimiento
> corporativo real — esto se hace cuando Oben entregue los documentos.

## 1. ¿Qué es ADÁN?
Es la memoria corporativa de DTA: un sistema RAG (Retrieval-Augmented Generation) que indexa
documentos reales de Oben (procedimientos, políticas, manuales, etc.) en una base vectorial
(pgvector) usando embeddings locales (`nomic-embed-text`, 768 dimensiones). Cuando alguien
pregunta algo, ADÁN busca los fragmentos más relevantes y responde **citando la fuente exacta**
(documento + fragmento). Si no encuentra nada relevante, lo dice — nunca inventa una respuesta.

## 2. Qué documentos necesitamos
Cualquier documento que el equipo de Oben use hoy para operar y que sería útil que EVA/ADÁN
"sepan". Ejemplos típicos por área:
- **Procedimientos operativos**: cómo se procesa una orden, cómo se valida crédito, cómo se
  exporta a un país específico.
- **Políticas**: política de crédito, política de descuentos, política de devoluciones.
- **Manuales**: manuales de producto, manuales de uso de sistemas internos.
- **Exportación**: requisitos por país, documentación aduanera, incoterms usados.
- **Calidad**: especificaciones de producto, certificaciones, normas internas.
- **Logística**: rutas, tiempos de tránsito, acuerdos con transportistas.
- **Compras**: catálogo de proveedores, condiciones de pago, lead times.
- **Producción**: capacidad por línea, tiempos de fabricación, consumo de materiales.

No es necesario que estén "limpios" o reformateados — ADÁN extrae el texto directamente del
archivo original.

## 3. Cómo deben organizarse — estructura de carpetas
El importador masivo (`import-knowledge.sh`) recorre recursivamente una carpeta raíz. La
estructura ya preparada en el servidor es:

```
~/dta/knowledge/
├── procedimientos/
├── politicas/
├── manuales/
├── exportaciones/
├── calidad/
├── logistica/
├── compras/
└── produccion/
```

Reglas:
- Oben puede usar subcarpetas dentro de cada categoría (ej. `exportaciones/peru/`,
  `exportaciones/mexico/`) — el importador las recorre igual, sin límite de profundidad.
- El nombre del archivo no necesita ningún formato especial; se recomienda que sea descriptivo
  (ej. `politica-credito-2026.pdf` en vez de `documento1.pdf`) porque el nombre aparece como
  referencia en las respuestas de ADÁN.
- No mezclar archivos de prueba/borrador con los definitivos — ADÁN los tratará como
  conocimiento real igual que cualquier otro.

## 4. Qué formatos soporta ADÁN
| Formato | Soportado | Cómo se procesa |
|---|---|---|
| PDF | ✅ | extracción de texto (`pdf-parse`) |
| DOCX | ✅ | extracción de texto (`mammoth`) |
| XLSX / XLS | ✅ | cada hoja se convierte a texto tipo CSV, con el nombre de la hoja como encabezado |
| TXT | ✅ | nativo |
| MD | ✅ | nativo |
| Otros (imágenes escaneadas sin texto, PPTX, etc.) | ❌ | rechazado explícitamente por la API con error claro — no se intenta adivinar |

Si un PDF es una imagen escaneada sin capa de texto, la extracción devolverá poco o nada de
contenido útil — en ese caso Oben debería entregar una versión con texto (no solo imagen).

## 5. Cómo se ejecuta una carga masiva
Herramienta ya construida: `import-knowledge.sh` (en el equipo del operador, no en el repo del
proyecto por seguridad — usa credenciales).

Pasos:
1. Oben (o el operador) coloca los archivos reales dentro de
   `~/dta/knowledge/<categoria>/` en el servidor, siguiendo la estructura del punto 3.
2. Ejecutar desde el servidor (o por SSH):
   ```bash
   bash import-knowledge.sh ~/dta/knowledge
   ```
3. El script:
   - Se autentica contra `/auth/login`.
   - Recorre todos los `.pdf/.docx/.xlsx/.txt/.md` de la carpeta.
   - Sube cada archivo a `POST /adan/ingest`.
   - Reporta `OK` (con cantidad de fragmentos/"chunks" generados) o `FAIL` por archivo.
   - Al final imprime el resumen y las estadísticas (`GET /adan/stats`: total de documentos,
     fragmentos y embeddings).
4. Verificar el resumen: si hay archivos `FAIL`, revisar el motivo (formato no soportado,
   archivo corrupto, PDF sin texto) antes de continuar.
5. Probar con preguntas reales contra `/adan/ask` para confirmar que las respuestas citan los
   documentos recién cargados.

## 6. Qué pasa si se necesita actualizar un documento
Hoy no hay una operación de "reemplazar" — se debe:
1. Eliminar el documento viejo (vía `GET /adan/documents` para ubicar el ID, eliminación manual
   en base de datos si no hay endpoint de delete expuesto — confirmar con el equipo técnico antes
   de esta operación).
2. Volver a ingestar el archivo actualizado.

Esto evita que ADÁN cite información obsoleta junto a la nueva.

## 7. Qué NO hacer
- No cargar documentos de prueba/ficticios en las carpetas de producción — quedarán mezclados
  con el conocimiento real y ADÁN los citará como si fueran legítimos.
- No cargar información confidencial que no deba estar disponible para todos los usuarios que
  consultan a ADÁN — hoy no hay segmentación de acceso por documento.
- No esperar que ADÁN "entrene" o aprenda de forma permanente con cada pregunta — es búsqueda
  semántica sobre lo ingestado, no aprendizaje continuo.

## 8. Estado actual
A la fecha de este documento, las carpetas de `~/dta/knowledge/` están vacías de conocimiento
real (solo se usaron documentos de prueba temporales durante la validación del pipeline, que
fueron eliminados después de confirmar que la ingesta multi-formato funciona). La carga real
queda pendiente de que Oben entregue los documentos descritos arriba.
