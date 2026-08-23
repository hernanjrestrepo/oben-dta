import { DocumentFlowContext } from './document-flow-context.types';

/**
 * Origen de un documento. `generated` y `oracle` son adaptadores "Capa 2"
 * (producción); `manual_upload` y `external_attachment` son "Capa 1" (piloto).
 * Cambiar de capa es cambiar `source` en la regla — la lógica de negocio no
 * se toca.
 */
export const DOCUMENT_SOURCE_TYPES = [
  'generated',
  'manual_upload',
  'oracle',
  'external_attachment',
] as const;

export type DocumentSourceType = (typeof DOCUMENT_SOURCE_TYPES)[number];

export interface DocumentRequest {
  /** Clave del documento dentro de la regla, ej. "lista_empaque_unificada". */
  key: string;
  sourceConfig: Record<string, unknown>;
  context: DocumentFlowContext;
}

export type ResolvedDocumentState = 'ready' | 'pending' | 'unavailable';

export interface ResolvedDocument {
  key: string;
  state: ResolvedDocumentState;
  filename?: string;
  mimeType?: string;
  content?: Buffer;
  message?: string;
}

/**
 * Contrato único para cualquier origen documental. Todas las implementaciones
 * (generado, carga manual, Oracle, adjunto externo) comparten esta interfaz —
 * el motor nunca conoce la implementación concreta.
 */
export interface DocumentSource {
  readonly type: DocumentSourceType;
  resolve(request: DocumentRequest): Promise<ResolvedDocument>;
}
