import { Injectable, OnModuleInit } from '@nestjs/common';
import { ValidatorRegistry } from '../document-flow/validator.registry';
import { ActionExecutorRegistry } from '../document-flow/action-executor.registry';
import { CreateOrderAction } from './actions/create-order.action';
import {
  ClientExistsValidator,
  DomainAuthorizedValidator,
  QuoteExistsValidator,
  QuoteValidValidator,
  CreditLimitValidator,
  ProductsValidValidator,
  QuantitiesCoherentValidator,
} from './purchase-order-validators';

/**
 * Registra en el motor, en el arranque de este módulo, los 7 validadores de
 * WO-017 y la acción `create_order`. El motor (`document-flow/`) no importa
 * nada de este archivo — es este módulo el que se enchufa al motor, no al
 * revés (mismo patrón que `QuotesDocumentFlowRegistration`).
 */
@Injectable()
export class PurchaseOrdersDocumentFlowRegistration implements OnModuleInit {
  constructor(
    private readonly validators: ValidatorRegistry,
    private readonly actions: ActionExecutorRegistry,
    private readonly clientExists: ClientExistsValidator,
    private readonly domainAuthorized: DomainAuthorizedValidator,
    private readonly quoteExists: QuoteExistsValidator,
    private readonly quoteValid: QuoteValidValidator,
    private readonly creditLimit: CreditLimitValidator,
    private readonly productsValid: ProductsValidValidator,
    private readonly quantitiesCoherent: QuantitiesCoherentValidator,
    private readonly createOrder: CreateOrderAction,
  ) {}

  onModuleInit(): void {
    this.validators.register(this.clientExists.type, this.clientExists);
    this.validators.register(this.domainAuthorized.type, this.domainAuthorized);
    this.validators.register(this.quoteExists.type, this.quoteExists);
    this.validators.register(this.quoteValid.type, this.quoteValid);
    this.validators.register(this.creditLimit.type, this.creditLimit);
    this.validators.register(this.productsValid.type, this.productsValid);
    this.validators.register(this.quantitiesCoherent.type, this.quantitiesCoherent);
    this.actions.register(this.createOrder.type, this.createOrder);
  }
}
