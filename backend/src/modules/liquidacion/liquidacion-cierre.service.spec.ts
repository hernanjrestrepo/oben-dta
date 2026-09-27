import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  CIERRE_DISTRIBUTION_KEY,
  LiquidacionCierreService,
  PROFORMA_FIRMADA_SIMULADA_LABEL,
  PROFORMA_SIMULADA_LABEL,
  UNIFICADA_SIMULADA_LABEL,
} from './liquidacion-cierre.service';
import { ObenPlusMockAdapter } from '../integrations/hub/adapters/oben-plus.mock';
import { StaticScenarioProvider } from '../integrations/hub/static-scenario-provider';

const CTX = { tenantId: 't1', userId: 'u1' };
const COMPLETADA = {
  action: 'liquidacion_completada',
  outputData: { headId: 5000, details: 2, ordenVenta: '11086', cliente: 'OBEN US, LLC', simulated: false },
};
const UNIFICADA_OK = {
  ok: true,
  simulated: false,
  attachment: {
    key: 'empaque_unificada',
    label: 'Lista de Empaque Unificada',
    filename: 'Lista_de_Empaque_Unificada-OV11086.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('xlsx'),
  },
};

function make(opts: {
  events?: Array<{ action: string; outputData?: Record<string, unknown> | null }>;
  to?: string[];
  unificada?: unknown;
  /** Respuesta de obenPlus proforma.pdf; por defecto el SIMULADOR real del hub. */
  proforma?: unknown;
  email?: unknown;
  consultar?: unknown;
  /** Caso comercial con la Proforma aprobada por el cliente (flujo Comercial). */
  firmada?: { proformaFirmada: Buffer; proformaFirmadaNombre: string; simulated: boolean } | null;
} = {}) {
  const obenPlus = new ObenPlusMockAdapter(new StaticScenarioProvider());
  const hub = {
    call: jest.fn(async (system: string, op: string, args: Record<string, unknown>, _options?: unknown) => {
      if (system === 'obenPlus' && op === 'proforma.pdf') return opts.proforma ?? obenPlus.execute(op, args, CTX);
      if (system === 'obenCostOrder' && op === 'liquidacion.consultar') {
        return opts.consultar ?? { ok: true, mode: 'real', data: { OrdenVenta: '11086', Cliente: 'OBEN US, LLC' } };
      }
      if (system === 'email' && op === 'send') return opts.email ?? { ok: true, mode: 'real', data: { id: 'msg-1' } };
      return { ok: false, error: `op inesperada ${system}.${op}` };
    }),
  };
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    listForEntity: jest.fn().mockResolvedValue(opts.events ?? []),
  };
  const distributionLists = {
    resolveRecipients: jest.fn().mockResolvedValue({ to: opts.to ?? ['comex@oben.com', 'facturacion@oben.com'], cc: [], bcc: [] }),
  };
  const reports = { buildReport: jest.fn().mockResolvedValue(opts.unificada ?? UNIFICADA_OK) };
  const qb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(opts.firmada ?? null),
  };
  const casos = { createQueryBuilder: jest.fn(() => qb) };
  const service = new LiquidacionCierreService(hub as never, CTX as never, audit as never, distributionLists as never, reports as never, casos as never);
  const emails = () => hub.call.mock.calls.filter((c) => c[0] === 'email');
  /** Argumentos del primer correo enviado. */
  const sentEmail = () => emails()[0][2] as { subject: string; body: string; attachments: Array<{ filename: string; content: string }> };
  return { service, hub, audit, distributionLists, reports, emails, sentEmail };
}

describe('LiquidacionCierreService — correo de cierre a COMEX/Facturación (OBEN MAS §1.2)', () => {
  describe('vista previa (no envía nada)', () => {
    it('antes de liquidar: muestra adjuntos y lo simulado, pero no se puede enviar', async () => {
      const { service, emails } = make();

      const p = await service.preview('11271');

      expect(p).toMatchObject({
        numberPF: '11271',
        ordenVenta: '11086',
        liquidacionCompletada: false,
        simulated: true,
        simulatedItems: [PROFORMA_SIMULADA_LABEL],
        puedeEnviar: false,
        missing: [],
      });
      expect(p.asunto).toBe('[SIMULADO] Liquidación concluida — PF 11271 / OV 11086');
      expect(p.adjuntos).toEqual([
        { key: 'empaque_unificada', label: 'Lista de Empaque Unificada', filename: 'Lista_de_Empaque_Unificada-OV11086.xlsx', simulated: false },
        { key: 'proforma', label: 'Proforma', filename: 'Proforma_SIMULADA-PF11271.pdf', simulated: true },
      ]);
      expect(emails()).toHaveLength(0);
    });

    it('usa la lista de distribución "liquidacion_cierre" y la OV guardada al completar (sin volver a consultar Oben)', async () => {
      const { service, distributionLists, hub, reports } = make({ events: [COMPLETADA] });
      const p = await service.preview('11271');
      expect(distributionLists.resolveRecipients).toHaveBeenCalledWith('document', CIERRE_DISTRIBUTION_KEY);
      expect(hub.call).not.toHaveBeenCalledWith('obenCostOrder', 'liquidacion.consultar', expect.anything(), expect.anything());
      expect(reports.buildReport).toHaveBeenCalledWith('empaque_unificada', 11086);
      expect(p).toMatchObject({ liquidacionCompletada: true, headId: 5000, detalles: 2, puedeEnviar: true });
    });
  });

  describe('envío', () => {
    it('liquidación concluida: envía Lista Unificada + Proforma, rotula la Proforma SIMULADA y audita', async () => {
      const { service, emails, sentEmail, audit } = make({ events: [COMPLETADA] });

      const r = await service.enviar('11271');

      expect(r).toMatchObject({ sent: true, to: ['comex@oben.com'], cc: ['facturacion@oben.com'], simulated: true, messageId: 'msg-1' });
      const args = sentEmail();
      const opts = emails()[0][3];
      expect(args.subject).toBe('[SIMULADO] Liquidación concluida — PF 11271 / OV 11086');
      expect(args.body).toContain('concluyó en Oben. Encabezado 5000, 2 línea(s) de detalle.');
      expect(args.body).toContain('documentos SIMULADOS');
      expect(args.body).toContain(PROFORMA_SIMULADA_LABEL);
      expect(args.attachments.map((a) => a.filename)).toEqual([
        'Lista_de_Empaque_Unificada-OV11086.xlsx',
        'Proforma_SIMULADA-PF11271.pdf',
      ]);
      const pdf = Buffer.from(args.attachments[1].content, 'base64');
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(opts).toMatchObject({ maxAttempts: 1 });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'liquidacion_cierre_enviado', outputData: expect.objectContaining({ ok: true, simulated: true }) }),
      );
    });

    it('con la Proforma y la Unificada REALES, el correo no lleva ningún rótulo de simulación', async () => {
      const realPdf = Buffer.from('%PDF-1.7 real').toString('base64');
      const { service, sentEmail } = make({
        events: [COMPLETADA],
        proforma: { ok: true, mode: 'real', data: { filename: 'PF11271.pdf', contentBase64: realPdf } },
      });

      const r = await service.enviar('11271');

      expect(r.simulated).toBe(false);
      const args = sentEmail();
      expect(args.subject).toBe('Liquidación concluida — PF 11271 / OV 11086');
      expect(args.body).not.toMatch(/SIMULAD/);
      expect(args.attachments[1].filename).toBe('PF11271.pdf');
    });

    it('si la Unificada viene del simulador de Oben (dev/demo), también se rotula', async () => {
      const { service, sentEmail } = make({ events: [COMPLETADA], unificada: { ...UNIFICADA_OK, simulated: true } });
      await service.enviar('11271');
      expect(sentEmail().body).toContain(UNIFICADA_SIMULADA_LABEL);
    });

    it('liquidaciones completadas antes de guardar la OV en el evento: la resuelve desde spCheckSettlement', async () => {
      const { service, hub } = make({ events: [{ action: 'liquidacion_completada', outputData: { headId: 5000, details: 1 } }] });
      await service.enviar('11271');
      expect(hub.call).toHaveBeenCalledWith('obenCostOrder', 'liquidacion.consultar', { numberPF: '11271' }, expect.anything());
    });
  });

  describe('candados — nunca presenta algo simulado como real', () => {
    it('la liquidación no ha concluido → no sale (ni tras un dry-run)', async () => {
      const { service, emails } = make();
      await expect(service.enviar('11271')).rejects.toThrow(/no ha concluido/);
      expect(emails()).toHaveLength(0);
    });

    it('una liquidación marcada como simulada nunca se anuncia como concluida', async () => {
      const { service, emails } = make({ events: [{ ...COMPLETADA, outputData: { ...COMPLETADA.outputData, simulated: true } }] });
      await expect(service.enviar('11271')).rejects.toThrow(/SIMULADOS/);
      expect(emails()).toHaveLength(0);
    });

    it('candado estructural: si el cuerpo no rotulara lo simulado, NO se envía', async () => {
      const { service, emails } = make({ events: [COMPLETADA] });
      jest.spyOn(service as unknown as { body: () => string }, 'body').mockReturnValue('<p>Adjunto la Proforma.</p>');

      await expect(service.enviar('11271')).rejects.toThrow(/Candado/);
      expect(emails()).toHaveLength(0);
    });

    it('ya enviado → Conflict; force reenvía; un intento FALLIDO no cuenta como enviado', async () => {
      const enviado = { action: 'liquidacion_cierre_enviado', outputData: { ok: true } };
      const a = make({ events: [COMPLETADA, enviado] });
      await expect(a.service.enviar('11271')).rejects.toThrow(ConflictException);
      await expect(a.service.enviar('11271', { force: true })).resolves.toMatchObject({ sent: true });

      const fallido = make({ events: [COMPLETADA, { action: 'liquidacion_cierre_enviado', outputData: { ok: false } }] });
      await expect(fallido.service.enviar('11271')).resolves.toMatchObject({ sent: true });
    });
  });

  describe('nunca incompleto: lo que falta se lista y no se envía', () => {
    it.each([
      ['sin lista de distribución', { to: [] }, /liquidacion_cierre/],
      ['Lista Unificada sin datos', { unificada: { ok: false, failure: { key: 'empaque_unificada', label: 'x', error: 'Oben no tiene datos' } } }, /Lista de Empaque Unificada \(OV 11086\): Oben no tiene datos/],
      ['Proforma inaccesible', { proforma: { ok: false, mode: 'mock', error: 'timeout' } }, /no se pudo obtener el PDF de Oben\+ \(timeout\)/],
      ['Proforma que no es un PDF', { proforma: { ok: true, mode: 'real', data: { contentBase64: Buffer.from('hola').toString('base64') } } }, /no devolvió un PDF válido/],
      ['OV irresoluble', { events: [{ action: 'liquidacion_completada', outputData: { headId: 1 } }], consultar: { ok: false, error: 'x' } }, /Orden de venta/],
    ])('%s', async (_caso, extra, missing) => {
      const { service, emails, audit } = make({ events: [COMPLETADA], ...(extra as object) });

      const err = await service.enviar('11271').catch((e: BadRequestException) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({ missing: expect.arrayContaining([expect.stringMatching(missing)]) });
      expect(emails()).toHaveLength(0);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'liquidacion_cierre_incompleto' }));
    });
  });

  describe('disparo automático al completar (enviarTrasCompletar)', () => {
    it('si todo está, envía', async () => {
      const { service } = make({ events: [COMPLETADA] });
      await expect(service.enviarTrasCompletar('11271')).resolves.toMatchObject({ sent: true });
    });

    it('si falta algo, NO lanza (la liquidación ya existe en Oben): devuelve sent:false con lo que falta', async () => {
      const { service } = make({ events: [COMPLETADA], to: [] });
      const r = await service.enviarTrasCompletar('11271');
      expect(r).toMatchObject({ sent: false, numberPF: '11271', missing: [expect.stringContaining('liquidacion_cierre')] });
    });

    it('si el correo falla, NO lanza: devuelve el error y queda auditado con ok:false', async () => {
      const { service, audit } = make({ events: [COMPLETADA], email: { ok: false, error: 'smtp down' } });
      const r = await service.enviarTrasCompletar('11271');
      expect(r).toMatchObject({ sent: false, error: expect.stringContaining('smtp down') });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'liquidacion_cierre_enviado', outputData: expect.objectContaining({ ok: false }), reason: 'smtp down' }),
      );
    });
  });

  it.each(['abc', '0', '11271.5'])('numberPF %j inválido se rechaza sin consultar nada', async (pf) => {
    const { service, hub } = make();
    await expect(service.preview(pf)).rejects.toThrow(BadRequestException);
    expect(hub.call).not.toHaveBeenCalled();
  });

  describe('Proforma aprobada por el cliente (OBEN MAS §1.2: "aprobada por el cliente")', () => {
    const PDF = Buffer.from('%PDF-1.4 proforma firmada por el cliente');

    it('si el flujo Comercial recibió la Proforma firmada, se adjunta esa (no el PDF de OBEN MAS) y sin rótulo si es real', async () => {
      const { service, hub, sentEmail } = make({
        events: [COMPLETADA],
        firmada: { proformaFirmada: PDF, proformaFirmadaNombre: 'PF11271_firmada.pdf', simulated: false },
      });
      const r = await service.enviar('11271');
      expect(r.adjuntos.find((a) => a.key === 'proforma')).toMatchObject({ label: 'Proforma aprobada por el cliente', filename: 'PF11271_firmada.pdf', simulated: false });
      expect(hub.call.mock.calls.some((c) => c[1] === 'proforma.pdf')).toBe(false);
      const pdf = sentEmail().attachments.find((a) => a.filename === 'PF11271_firmada.pdf')!;
      expect(Buffer.from(pdf.content, 'base64').toString()).toContain('firmada por el cliente');
      expect(r.simulated).toBe(false);
    });

    it('si ese caso comercial era SIMULADO, se rotula como tal (asunto y cuerpo)', async () => {
      const { service, sentEmail } = make({
        events: [COMPLETADA],
        firmada: { proformaFirmada: PDF, proformaFirmadaNombre: 'x.pdf', simulated: true },
      });
      const p = await service.preview('11271');
      expect(p.simulatedItems).toEqual([PROFORMA_FIRMADA_SIMULADA_LABEL]);
      await service.enviar('11271');
      expect(sentEmail().subject).toMatch(/^\[SIMULADO\]/);
      expect(sentEmail().body).toContain(PROFORMA_FIRMADA_SIMULADA_LABEL);
      expect(sentEmail().body).toContain('Proforma_aprobada_SIMULADA-PF11271.pdf <strong>(SIMULADO)</strong>');
    });

    it('sin Proforma firmada en el flujo Comercial: sigue usando el PDF de OBEN MAS', async () => {
      const { service, hub } = make({ events: [COMPLETADA], firmada: null });
      const p = await service.preview('11271');
      expect(hub.call.mock.calls.some((c) => c[1] === 'proforma.pdf')).toBe(true);
      expect(p.simulatedItems).toContain(PROFORMA_SIMULADA_LABEL);
    });
  });
});
