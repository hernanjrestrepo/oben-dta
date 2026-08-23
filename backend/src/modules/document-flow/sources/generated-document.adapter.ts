import { Injectable } from '@nestjs/common';
import {
  DocumentRequest,
  DocumentSource,
  ResolvedDocument,
} from '../document-source.types';

export type DocumentGeneratorFn = (
  request: DocumentRequest,
) => Promise<ResolvedDocument>;

/**
 * Fuente "generated": el documento lo produce el propio sistema (ej. el PDF
 * de cotización hoy, y a futuro los generadores de Lista de Empaque, etc.).
 * Fase 1 no registra generadores de negocio — cada flujo (Fase 2) registra
 * el suyo por `generatorKey` sin tocar este adaptador ni el motor.
 */
@Injectable()
export class GeneratedDocumentAdapter implements DocumentSource {
  readonly type = 'generated' as const;

  private readonly generators = new Map<string, DocumentGeneratorFn>();

  register(generatorKey: string, fn: DocumentGeneratorFn): void {
    this.generators.set(generatorKey, fn);
  }

  async resolve(request: DocumentRequest): Promise<ResolvedDocument> {
    const generatorKey = request.sourceConfig.generatorKey as
      | string
      | undefined;
    if (!generatorKey) {
      return {
        key: request.key,
        state: 'unavailable',
        message: 'sourceConfig.generatorKey no especificado',
      };
    }
    const generator = this.generators.get(generatorKey);
    if (!generator) {
      return {
        key: request.key,
        state: 'unavailable',
        message: `Generador "${generatorKey}" no registrado`,
      };
    }
    return generator(request);
  }
}
