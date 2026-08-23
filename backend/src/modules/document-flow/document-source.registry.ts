import { Injectable } from '@nestjs/common';
import { DocumentSource, DocumentSourceType } from './document-source.types';
import { GeneratedDocumentAdapter } from './sources/generated-document.adapter';
import { ManualUploadAdapter } from './sources/manual-upload.adapter';
import { OracleAdapter } from './sources/oracle.adapter';
import { ExternalAttachmentAdapter } from './sources/external-attachment.adapter';

/**
 * Único punto donde el motor resuelve `DocumentSourceType -> DocumentSource`.
 * Agregar una fuente nueva (ej. "cubeiq", "email_inbox") es agregarla aquí,
 * sin tocar `DocumentFlowEngine`.
 */
@Injectable()
export class DocumentSourceRegistry {
  private readonly sources: Map<DocumentSourceType, DocumentSource>;

  constructor(
    generated: GeneratedDocumentAdapter,
    manualUpload: ManualUploadAdapter,
    oracle: OracleAdapter,
    externalAttachment: ExternalAttachmentAdapter,
  ) {
    this.sources = new Map<DocumentSourceType, DocumentSource>([
      [generated.type, generated],
      [manualUpload.type, manualUpload],
      [oracle.type, oracle],
      [externalAttachment.type, externalAttachment],
    ]);
  }

  /**
   * Devuelve `undefined` si el tipo no está registrado — NUNCA lanza.
   * `doc.source` viene de una columna jsonb (dato en runtime, no una unión de
   * TypeScript verificada en compilación): una `DocumentFlowRule` corrupta o
   * maliciosa puede traer cualquier string aquí. El motor (`runRule()`) es
   * quien decide qué hacer con "no registrado" — igual patrón que
   * `ActionExecutorRegistry`/`ValidatorRegistry`, para que un tipo desconocido
   * sea un `unavailable` controlado, nunca una excepción sin capturar
   * (encontrado y corregido en la revisión de seguridad de RC1).
   */
  resolve(type: DocumentSourceType): DocumentSource | undefined {
    return this.sources.get(type);
  }
}
