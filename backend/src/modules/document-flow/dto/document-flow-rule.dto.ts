import {
  IsString,
  IsOptional,
  IsEnum,
  IsIn,
  IsArray,
  IsInt,
  MinLength,
} from 'class-validator';
import { DocumentFlowRuleStatus } from '../../../entities/document-flow-rule.entity';
import { BUSINESS_EVENTS } from '../business-event.types';
import type { BusinessEvent } from '../business-event.types';

export class CreateDocumentFlowRuleDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(BUSINESS_EVENTS)
  triggerEvent: BusinessEvent;

  @IsOptional()
  @IsArray()
  requiredDocuments?: unknown[];

  @IsOptional()
  @IsArray()
  recipients?: unknown[];

  @IsOptional()
  @IsArray()
  actions?: unknown[];

  @IsOptional()
  @IsArray()
  integrations?: unknown[];

  @IsOptional()
  @IsArray()
  validations?: unknown[];

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsEnum(DocumentFlowRuleStatus)
  status?: DocumentFlowRuleStatus;
}

export class UpdateDocumentFlowRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(BUSINESS_EVENTS)
  triggerEvent?: BusinessEvent;

  @IsOptional()
  @IsArray()
  requiredDocuments?: unknown[];

  @IsOptional()
  @IsArray()
  recipients?: unknown[];

  @IsOptional()
  @IsArray()
  actions?: unknown[];

  @IsOptional()
  @IsArray()
  integrations?: unknown[];

  @IsOptional()
  @IsArray()
  validations?: unknown[];

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsEnum(DocumentFlowRuleStatus)
  status?: DocumentFlowRuleStatus;
}
