import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OllamaService } from '../ia/ollama.service';
import { extractText } from './extractors';
import { TenantContext } from '../../common/tenant/tenant-context.service';

export interface AdanSource {
  documentId: string;
  fileName: string;
  chunkIndex: number;
  similarity: number;
  excerpt: string;
}

export interface AdanAnswer {
  question: string;
  answer: string;
  sources: AdanSource[];
  model: string;
  grounded: boolean;
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;
const DEFAULT_TOPK = 4;

@Injectable()
export class AdanService {
  private readonly logger = new Logger(AdanService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ollama: OllamaService,
    private readonly ctx: TenantContext,
  ) {}

  async ingest(
    fileName: string,
    fileType: string,
    raw: Buffer | string,
    uploadedBy?: string,
  ): Promise<{ documentId: string; chunks: number; fileType: string }> {
    const tenantId = this.ctx.tenantId;
    const text = await extractText(fileType, raw);
    if (!text || text.trim().length === 0) {
      throw new BadRequestException(
        `No se pudo extraer texto del documento ${fileName} (${fileType})`,
      );
    }

    const docRes = await this.dataSource.query(
      `INSERT INTO documents (file_name, file_type, status, uploaded_by, tenant_id)
       VALUES ($1, $2, 'CHUNKED', $3, $4) RETURNING id`,
      [fileName, fileType, uploadedBy ?? null, tenantId],
    );
    const documentId = docRes[0].id;

    const chunks = this.chunkText(text);
    const embedModel = this.ollama.getEmbedModelName();
    let stored = 0;

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      const chunkRes = await this.dataSource.query(
        `INSERT INTO document_chunks (document_id, chunk_index, content, token_count)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [documentId, i, content, Math.ceil(content.length / 4)],
      );
      const chunkId = chunkRes[0].id;

      const vector = await this.ollama.embed(content);
      const vectorLiteral = `[${vector.join(',')}]`;
      await this.dataSource.query(
        `INSERT INTO embeddings (chunk_id, embedding, model_name)
         VALUES ($1, $2::vector, $3)`,
        [chunkId, vectorLiteral, embedModel],
      );
      stored++;
    }

    await this.dataSource.query(
      `UPDATE documents SET status = 'EMBEDDED', updated_at = now() WHERE id = $1`,
      [documentId],
    );

    this.logger.log(
      `[tenant ${tenantId}] Ingestado ${fileName}: ${stored} chunks`,
    );
    return { documentId, chunks: stored, fileType };
  }

  async search(query: string, topK = DEFAULT_TOPK): Promise<AdanSource[]> {
    const tenantId = this.ctx.tenantId;
    const vector = await this.ollama.embed(query);
    const vectorLiteral = `[${vector.join(',')}]`;
    const rows = await this.dataSource.query(
      `SELECT d.id AS document_id, d.file_name, c.chunk_index, c.content,
              1 - (e.embedding <=> $1::vector) AS similarity
       FROM embeddings e
       JOIN document_chunks c ON c.id = e.chunk_id
       JOIN documents d ON d.id = c.document_id
       WHERE d.tenant_id = $3
       ORDER BY e.embedding <=> $1::vector
       LIMIT $2`,
      [vectorLiteral, topK, tenantId],
    );
    return rows.map(
      (r: {
        document_id: string;
        file_name: string;
        chunk_index: number;
        content: string;
        similarity: number | string;
      }) => ({
        documentId: r.document_id,
        fileName: r.file_name,
        chunkIndex: r.chunk_index,
        similarity: Number(Number(r.similarity).toFixed(4)),
        excerpt: r.content,
      }),
    );
  }

  async ask(question: string, topK = DEFAULT_TOPK): Promise<AdanAnswer> {
    const sources = await this.search(question, topK);
    const model = this.ollama.getModelName();

    if (sources.length === 0) {
      return {
        question,
        answer:
          'No tengo documentos cargados que respondan esa pregunta. Cargue el documento correspondiente para que pueda responder con fuentes reales.',
        sources: [],
        model,
        grounded: false,
      };
    }

    const context = sources
      .map(
        (s, i) =>
          `[Fuente ${i + 1}: ${s.fileName} #${s.chunkIndex}]\n${s.excerpt}`,
      )
      .join('\n\n');

    const system =
      'Eres ADÁN, la memoria corporativa. Respondes ÚNICAMENTE con base en el CONTEXTO proporcionado. Si el contexto no contiene la respuesta, dilo claramente; NO inventes. Cita las fuentes por su nombre cuando respondas. Responde en español, claro y profesional.';

    const answer = await this.ollama.chatSimple([
      { role: 'system', content: system },
      {
        role: 'user',
        content: `CONTEXTO:\n${context}\n\nPREGUNTA: ${question}`,
      },
    ]);

    return { question, answer, sources, model, grounded: true };
  }

  async listDocuments(): Promise<unknown[]> {
    const tenantId = this.ctx.tenantId;
    return this.dataSource.query(
      `SELECT d.id, d.file_name, d.file_type, d.status, d.created_at,
              count(c.id) AS chunks
       FROM documents d
       LEFT JOIN document_chunks c ON c.document_id = d.id
       WHERE d.tenant_id = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
      [tenantId],
    );
  }

  async stats(): Promise<{
    documents: number;
    chunks: number;
    embeddings: number;
  }> {
    const tenantId = this.ctx.tenantId;
    const r = await this.dataSource.query(
      `SELECT
        (SELECT count(*) FROM documents WHERE tenant_id = $1) AS documents,
        (SELECT count(*) FROM document_chunks c
           JOIN documents d ON d.id = c.document_id
           WHERE d.tenant_id = $1) AS chunks,
        (SELECT count(*) FROM embeddings e
           JOIN document_chunks c ON c.id = e.chunk_id
           JOIN documents d ON d.id = c.document_id
           WHERE d.tenant_id = $1) AS embeddings`,
      [tenantId],
    );
    return {
      documents: Number(r[0].documents),
      chunks: Number(r[0].chunks),
      embeddings: Number(r[0].embeddings),
    };
  }

  private chunkText(text: string): string[] {
    const clean = text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const chunks: string[] = [];
    let start = 0;
    while (start < clean.length) {
      let end = Math.min(start + CHUNK_SIZE, clean.length);
      if (end < clean.length) {
        const slice = clean.slice(start, end);
        const lastBreak = Math.max(
          slice.lastIndexOf('\n\n'),
          slice.lastIndexOf('. '),
        );
        if (lastBreak > CHUNK_SIZE * 0.5) {
          end = start + lastBreak + 1;
        }
      }
      const chunk = clean.slice(start, end).trim();
      if (chunk.length > 0) chunks.push(chunk);
      start = end - CHUNK_OVERLAP;
      if (start < 0) start = 0;
      if (end >= clean.length) break;
    }
    return chunks;
  }
}
