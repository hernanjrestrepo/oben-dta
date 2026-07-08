import { Module } from '@nestjs/common';
import { AdanService } from './adan.service';
import { AdanController } from './adan.controller';
import { AuthModule } from '../auth/auth.module';
import { OllamaService } from '../ia/ollama.service';

/**
 * AdanModule — memoria corporativa de Oben (RAG local).
 * Ingesta documentos -> chunks -> embeddings locales (nomic-embed-text) ->
 * pgvector -> recuperación semántica -> respuesta con el LLM local.
 * Sin fine-tuning, sin APIs externas.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdanController],
  providers: [AdanService, OllamaService],
  exports: [AdanService],
})
export class AdanModule {}
