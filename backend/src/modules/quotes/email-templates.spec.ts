import {
  renderUnknownClientEmail,
  renderInsufficientInfoEmail,
  renderQuoteResponseEmail,
} from './email-templates';
import { Quote } from '../../entities/quote.entity';

const XSS = '<script>alert(document.cookie)</script>';

describe('Plantillas de correo — escapado HTML (RC1 Sprint 5, XSS confirmado y corregido)', () => {
  it('renderUnknownClientEmail escapa "from" (100% controlado por quien envía el correo)', () => {
    const { html } = renderUnknownClientEmail(`${XSS}@evil.com`);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renderInsufficientInfoEmail escapa clientName', () => {
    const { html } = renderInsufficientInfoEmail(XSS);
    expect(html).not.toContain('<script>');
  });

  it('renderQuoteResponseEmail escapa nombre de cliente, producto y SKU', () => {
    const quote = {
      quoteNumber: 'COT-1',
      client: { name: XSS },
      items: [
        { product: { name: XSS, sku: XSS }, quantity: 1, unitPrice: 100, totalPrice: 100 },
      ],
      subtotal: 100,
      taxAmount: 19,
      total: 119,
    } as unknown as Quote;

    const { html } = renderQuoteResponseEmail(quote);
    expect(html).not.toContain('<script>');
    expect(html.match(/&lt;script&gt;/g)?.length).toBeGreaterThanOrEqual(3); // cliente + nombre producto + sku
  });
});
