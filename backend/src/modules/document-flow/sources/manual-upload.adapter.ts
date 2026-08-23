import { Injectable } from '@nestjs/common';
import {
  DocumentRequest,
  DocumentSource,
  ResolvedDocument,
} from '../document-source.types';

interface UploadedFile {
  filename: string;
  mimeType: string;
  content: Buffer;
}

/**
 * Fuente "manual_upload" — Capa 1 (piloto): el documento lo sube una persona
 * (ej. los .xls que hoy exporta Oracle) en vez de llegar por integración.
 * El motor solo espera que quien dispare el evento haya puesto el archivo en
 * `context.metadata.uploads[key]`; de dónde salga ese archivo (endpoint de
 * carga, email parseado, etc.) es responsabilidad de cada flujo, no del
 * motor ni de este adaptador.
 */
@Injectable()
export class ManualUploadAdapter implements DocumentSource {
  readonly type = 'manual_upload' as const;

  async resolve(request: DocumentRequest): Promise<ResolvedDocument> {
    const uploads = request.context.metadata?.uploads as
      | Record<string, UploadedFile>
      | undefined;
    const file = uploads?.[request.key];
    if (!file) {
      return {
        key: request.key,
        state: 'pending',
        message: 'Pendiente de carga manual',
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
