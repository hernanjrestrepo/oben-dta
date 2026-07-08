import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { runSqlMigrations } from './common/bootstrap/run-sql-migrations';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Corre migraciones SQL overlay DESPUÉS de que TypeORM synchronize haya creado
  // el schema base desde entidades. Las migraciones agregan tablas específicas
  // (ADÁN pgvector) y ajustes que no viven en TypeORM entities.
  await runSqlMigrations();

  // ==== Seguridad HTTP: Helmet ====
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts:
        process.env.NODE_ENV === 'production'
          ? { maxAge: 31536000, includeSubDomains: true }
          : false,
    }),
  );

  // ==== CORS con whitelist explícita ====
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,X-Tenant-Id,X-Request-Id',
  });

  // Filtro global de excepciones y validation pipe con estricto whitelist.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ==== Swagger ====
  const config = new DocumentBuilder()
    .setTitle('DTA API')
    .setDescription('ERP inteligente SaaS multi-tenant')
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
