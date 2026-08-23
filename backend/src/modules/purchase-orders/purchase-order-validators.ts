import { Injectable } from '@nestjs/common';
import { Validator, ValidationRequest, ValidationResult } from '../document-flow/validator.types';

interface PurchaseOrderMetadata {
  items: Array<{ raw: string; quantity: number; productId: string | null }>;
  estimatedTotal: number;
}

function po(request: ValidationRequest): PurchaseOrderMetadata | undefined {
  return request.context.metadata?.purchaseOrder as
    | PurchaseOrderMetadata
    | undefined;
}

/** 1. Cliente existente: el dominio del remitente resolvió a un Client registrado. */
@Injectable()
export class ClientExistsValidator implements Validator {
  readonly type = 'client_exists';
  async validate(request: ValidationRequest): Promise<ValidationResult> {
    const client = request.context.client;
    return {
      type: this.type,
      passed: !!client,
      message: client ? undefined : 'Ningún cliente registrado para este dominio remitente',
    };
  }
}

/** 2. Dominio autorizado: el cliente resuelto está activo (no basta con existir). */
@Injectable()
export class DomainAuthorizedValidator implements Validator {
  readonly type = 'domain_authorized';
  async validate(request: ValidationRequest): Promise<ValidationResult> {
    const isActive = request.context.client?.isActive === true;
    return {
      type: this.type,
      passed: isActive,
      message: isActive ? undefined : 'El cliente existe pero no está activo/autorizado',
    };
  }
}

/** 3. Cotización existente: se localizó una Quote relacionada con esta PO. */
@Injectable()
export class QuoteExistsValidator implements Validator {
  readonly type = 'quote_exists';
  async validate(request: ValidationRequest): Promise<ValidationResult> {
    const quote = request.context.quote;
    return {
      type: this.type,
      passed: !!quote,
      message: quote ? undefined : 'No se localizó una cotización relacionada con esta PO',
    };
  }
}

/** 4. Cotización vigente: no rechazada y dentro de su fecha de validez (si tiene). */
@Injectable()
export class QuoteValidValidator implements Validator {
  readonly type = 'quote_valid';
  async validate(request: ValidationRequest): Promise<ValidationResult> {
    const quote = request.context.quote as
      | { status?: string; validUntil?: string | null }
      | undefined;
    if (!quote) {
      return { type: this.type, passed: false, message: 'No hay cotización que validar' };
    }
    if (quote.status === 'REJECTED') {
      return { type: this.type, passed: false, message: 'La cotización relacionada fue rechazada' };
    }
    if (quote.validUntil && new Date(quote.validUntil).getTime() < Date.now()) {
      return { type: this.type, passed: false, message: `La cotización venció el ${quote.validUntil}` };
    }
    return { type: this.type, passed: true };
  }
}

/** 5. Cupo de crédito: crédito disponible del cliente cubre el total estimado de la PO. */
@Injectable()
export class CreditLimitValidator implements Validator {
  readonly type = 'credit_limit';
  async validate(request: ValidationRequest): Promise<ValidationResult> {
    const client = request.context.client as
      | { creditLimit?: number; usedCredit?: number }
      | undefined;
    const metadata = po(request);
    if (!client || metadata === undefined) {
      return { type: this.type, passed: false, message: 'Falta cliente o total estimado de la PO' };
    }
    const available = Number(client.creditLimit ?? 0) - Number(client.usedCredit ?? 0);
    const passed = available >= metadata.estimatedTotal;
    return {
      type: this.type,
      passed,
      message: passed
        ? undefined
        : `Cupo insuficiente: disponible $${available.toLocaleString('es-CO')}, requerido $${metadata.estimatedTotal.toLocaleString('es-CO')}`,
      data: { available, required: metadata.estimatedTotal },
    };
  }
}

/** 6. Productos válidos: todo item extraído matcheó contra el catálogo activo. */
@Injectable()
export class ProductsValidValidator implements Validator {
  readonly type = 'products_valid';
  async validate(request: ValidationRequest): Promise<ValidationResult> {
    const metadata = po(request);
    if (!metadata || metadata.items.length === 0) {
      return { type: this.type, passed: false, message: 'No se identificó ningún producto del catálogo en la PO' };
    }
    const unresolved = metadata.items.filter((i) => !i.productId);
    return {
      type: this.type,
      passed: unresolved.length === 0,
      message: unresolved.length
        ? `Sin coincidencia en catálogo: ${unresolved.map((i) => i.raw).join(', ')}`
        : undefined,
    };
  }
}

/** 7. Cantidades coherentes: enteras, positivas y dentro de un rango razonable. */
@Injectable()
export class QuantitiesCoherentValidator implements Validator {
  readonly type = 'quantities_coherent';
  private static readonly MAX_REASONABLE_QTY = 1_000_000;

  async validate(request: ValidationRequest): Promise<ValidationResult> {
    const metadata = po(request);
    if (!metadata || metadata.items.length === 0) {
      return { type: this.type, passed: false, message: 'Sin cantidades que validar' };
    }
    const invalid = metadata.items.filter(
      (i) =>
        !Number.isInteger(i.quantity) ||
        i.quantity <= 0 ||
        i.quantity > QuantitiesCoherentValidator.MAX_REASONABLE_QTY,
    );
    return {
      type: this.type,
      passed: invalid.length === 0,
      message: invalid.length
        ? `Cantidad no coherente: ${invalid.map((i) => `${i.raw}=${i.quantity}`).join(', ')}`
        : undefined,
    };
  }
}
