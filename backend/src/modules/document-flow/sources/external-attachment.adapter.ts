import { Injectable } from '@nestjs/common';
import {
  DocumentRequest,
  DocumentSource,
  ResolvedDocument,
} from '../document-source.types';

interface ExternalAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

/**
 * Fuente "external_attachment": el documento lo produce un tercero fuera de
 * nuestro control (ej. la factura DIAN que emite el proveedor de facturación
 * electrónica de Oben) — nuestro sistema únicamente lo recibe y lo reenvía,
 * nunca lo genera. Igual que `manual_upload`, espera el archivo ya resuelto
 * en `context.metadata.attachments[key]`.
 */
@Injectable()
export class ExternalAttachmentAdapter implements DocumentSource {
  readonly type = 'external_attachment' as const;

  async resolve(request: DocumentRequest): Promise<ResolvedDocument> {
    const attachments = request.context.metadata?.attachments as
      | Record<string, ExternalAttachment>
      | undefined;
    const file = attachments?.[request.key];
    if (!file) {
      return {
        key: request.key,
        state: 'pending',
        message: 'Pendiente de adjunto externo',
      };
    }
    return {
      key: request.key,
      state: 'ready',
      filename: file.filename,
      mimeType: file.mimeType,
      content: file.content,
    };
  }
}
