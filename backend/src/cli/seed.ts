import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { SeedService } from '../modules/seed/seed.service';

async function runSeed() {
  const logger = new Logger('SeedCLI');
  logger.log('Starting seed data generation...');

  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const seedService = app.get(SeedService);

    await seedService.seed();

    logger.log('Seed data generation completed successfully');
    await app.close();
  } catch (error) {
    logger.error('Error during seed data generation', error.stack);
    process.exit(1);
  }
}

runSeed();
