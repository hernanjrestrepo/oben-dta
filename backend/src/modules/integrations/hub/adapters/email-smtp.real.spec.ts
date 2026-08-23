import * as nodemailer from 'nodemailer';
import { EmailSmtpRealAdapter } from './email-smtp.real';

jest.mock('nodemailer');

const CTX = { tenantId: 't1', userId: 'u1' };

describe('EmailSmtpRealAdapter (WO-018 Sprint 6 — conector de correo real, salida SMTP)', () => {
  afterEach(() => jest.clearAllMocks());

  function makeAdapter(overrides: Partial<Record<string, unknown>> = {}) {
    return new EmailSmtpRealAdapter({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      user: 'pedidosdeventa.co@obengroup.com',
      pass: 'secret',
      fromAddress: 'pedidosdeventa.co@obengroup.com',
      ...overrides,
    });
  }

  it('envía correctamente vía nodemailer cuando está configurado', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'MSG-1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail, verify: jest.fn() });

    const adapter = makeAdapter();
    const result = await adapter.execute('send', { to: 'cliente@corp.com', subject: 'Hola', body: '<p>Hi</p>' }, CTX);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: 'MSG-1', delivered: true });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'pedidosdeventa.co@obengroup.com',
        to: 'cliente@corp.com',
        subject: 'Hola',
        html: '<p>Hi</p>',
      }),
    );
  });

  it('usa STARTTLS (secure:false) en el puerto 587 por defecto de Microsoft 365', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'MSG-2' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail, verify: jest.fn() });

    const adapter = makeAdapter();
    await adapter.execute('send', { to: 'a@b.com', subject: 's', body: 'b' }, CTX);

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.office365.com', port: 587, secure: false }),
    );
  });

  it('reporta pending_credentials si falta cualquier campo requerido', async () => {
    const adapter = makeAdapter({ pass: undefined });
    const result = await adapter.execute('send', { to: 'a@b.com', subject: 's', body: 'b' }, CTX);
    expect(result.ok).toBe(false);
    expect(result.state).toBe('pending_credentials');
  });

  it('rechaza envíos sin destinatario o asunto (BUSINESS_ERROR)', async () => {
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: jest.fn(), verify: jest.fn() });
    const adapter = makeAdapter();
    const result = await adapter.execute('send', { to: '', subject: 's', body: 'b' }, CTX);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/to requerido/);
  });
});
