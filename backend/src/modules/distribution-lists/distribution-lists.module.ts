import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistributionList } from '../../entities/distribution-list.entity';
import { DistributionListRecipient } from '../../entities/distribution-list-recipient.entity';
import { DistributionListAssociation } from '../../entities/distribution-list-association.entity';
import { DistributionListsService } from './distribution-lists.service';
import { DistributionListsController } from './distribution-lists.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DistributionList,
      DistributionListRecipient,
      DistributionListAssociation,
    ]),
    AuthModule,
  ],
  controllers: [DistributionListsController],
  providers: [DistributionListsService],
  exports: [DistributionListsService],
})
export class DistributionListsModule {}
