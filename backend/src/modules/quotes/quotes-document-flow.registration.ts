import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote } from '../../entities/quote.entity';
import { GeneratedDocumentAdapter } from '../document-flow/sources/generated-document.adapter';
import { QuotePdfService } from './quote-pdf.service';

/**
 * Registra el generador "quote_pdf" en el `GeneratedDocumentAdapter` del
 * motor. Vive en `QuotesModule` (no en `document-flow/`) a propósito: el
 * motor no debe conocer qué es una cotización — es este módulo el que le
 * enseña, en su propio arranque, cómo producir SU documento.
 */
@Injectable()
export class QuotesDocumentFlowRegistration implements OnModuleInit {
  constructor(
    private readonly generatedDocuments: GeneratedDocumentAdapter,
    private readonly pdfService: QuotePdfService,
    @InjectRepository(Quote)
    private readonly quotes: Repository<Quote>,
  ) {}

  onModuleInit(): void {
    this.generatedDocuments.register('quote_pdf', async (request) => {
      const quoteId = request.context.quote?.id;
      if (!quoteId) {
        return {
          key: request.key,
          state: 'unavailable',
          message: 'context.quote.id requerido para generar quote_pdf',
        };
      }
      const quote = await this.quotes.findOne({
        where: { id: quoteId },
        relations: ['client', 'items', 'items.product'],
      });
      if (!quote) {
        return {
          key: request.key,
          state: 'unavailable',
          message: `Quote ${quoteId} no encontrada`,
        };
      }
      const pdfBuffer = await this.pdfService.generateQuotePdf(quote);
      return {
        key: request.key,
        state: 'ready',
        filename: `${quote.quoteNumber}.pdf`,
        mimeType: 'application/pdf',
        content: pdfBuffer,
      };
    });
  }
}
