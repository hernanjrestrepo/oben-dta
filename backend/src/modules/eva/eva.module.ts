import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../entities/product.entity';
import { EvaController } from './eva.controller';
import { EvaService } from './eva.service';
import { QuotesModule } from '../quotes/quotes.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product]), QuotesModule, AuthModule],
  controllers: [EvaController],
  providers: [EvaService],
})
export class EvaModule {}
