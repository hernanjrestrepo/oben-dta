import { Injectable } from '@nestjs/common';

export interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments: Array<{ filename: string; contentType: string }>;
  receivedAt: Date;
  status: 'UNREAD' | 'READ' | 'REPLIED';
  replyText?: string;
  replyAt?: Date;
}

@Injectable()
export class EmailService {
  private inbox: EmailMessage[] = [];
  private idCounter = 1;

  async receiveEmail(data: {
    from: string;
    subject: string;
    body: string;
  }): Promise<EmailMessage> {
    const email: EmailMessage = {
      id: `EMAIL-${Date.now()}-${this.idCounter++}`,
      from: data.from,
      to: 'cotizaciones@obengroup.com',
      subject: data.subject,
      body: data.body,
      attachments: [],
      receivedAt: new Date(),
      status: 'UNREAD',
    };
    this.inbox.push(email);
    return email;
  }

  async getInbox(): Promise<EmailMessage[]> {
    return [...this.inbox].sort(
      (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime(),
    );
  }

  async replyToEmail(
    emailId: string,
    replyText: string,
  ): Promise<EmailMessage | null> {
    const email = this.inbox.find((e) => e.id === emailId);
    if (!email) return null;
    email.status = 'REPLIED';
    email.replyText = replyText;
    email.replyAt = new Date();
    return email;
  }

  async simulateClientApproval(emailId: string): Promise<EmailMessage | null> {
    return this.replyToEmail(
      emailId,
      'APROBADO - Proceda con el pedido. Adjunto orden de compra.',
    );
  }

  async simulateClientRejection(emailId: string): Promise<EmailMessage | null> {
    return this.replyToEmail(
      emailId,
      'RECHAZADO - Precios fuera de presupuesto.',
    );
  }
}
