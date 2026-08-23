import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../../entities/tenant.entity';
import { RulesClassifier } from './classifiers/rules-classifier';
import { ClassifierRegistry } from './classifier.registry';

/**
 * Clasificación de correo entrante (PO / cotización / naviera / COMEX).
 * Infraestructura genérica — no sabe qué hacer con cada categoría, solo
 * identifica cuál es (ver ADR-DocumentFlowEngine.md, mismo espíritu que el
 * motor: el clasificador no conoce órdenes de compra ni cotizaciones).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [RulesClassifier, ClassifierRegistry],
  exports: [ClassifierRegistry],
})
export class ClassificationModule {}
