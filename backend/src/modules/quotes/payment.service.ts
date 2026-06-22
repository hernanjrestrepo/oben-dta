import { Injectable } from '@nestjs/common';

export interface PaymentLink {
  linkId: string;
  quoteId: string;
  amount: number;
  currency: string;
  url: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED';
  paidAt?: Date;
  transactionId?: string;
}

@Injectable()
export class PaymentService {
  private links: Map<string, PaymentLink> = new Map();

  async createPaymentLink(
    quoteId: string,
    amount: number,
  ): Promise<PaymentLink> {
    const linkId = `PAY-${Date.now()}`;
    const link: PaymentLink = {
      linkId,
      quoteId,
      amount,
      currency: 'COP',
      url: `http://localhost:3000/pago/${linkId}`,
      status: 'PENDING',
    };
    this.links.set(linkId, link);
    return link;
  }

  async simulatePayment(linkId: string): Promise<PaymentLink | null> {
    const link = this.links.get(linkId);
    if (!link) return null;
    link.status = 'PAID';
    link.paidAt = new Date();
    link.transactionId = `TXN-${Date.now()}`;
    return link;
  }

  async getLink(linkId: string): Promise<PaymentLink | null> {
    return this.links.get(linkId) || null;
  }
}
