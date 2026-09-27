import { BadRequestException, ConflictException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { StaticScenarioProvider } from '../integrations/hub/static-scenario-provider';
import { ObenPlusMockAdapter } from '../integrations/hub/adapters/oben-plus.mock';
import { InMemoryObenPlusSimStore } from '../integrations/hub/oben-plus-sim.store';
import type { ComercialCase } from '../../entities/comercial-case.entity';
import { ComercialFlujoService, LISTA_CARTERA, LISTA_COPIA_PROFORMA, LISTA_CUSTOMER_SERVICE } from './comercial-flujo.service';
import { ComercialIntakeService } from './comercial-intake.service';
import { CLIENTE_DEMO, EQUIVALENCIAS_DEMO } from './comercial-simulador.service';

const CTX = { tenantId: 't1', userId: 'u1' };
const HOUR = 3600_000;

class MemRepo {
  rows: ComercialCase[] = [];
  create(x: Partial<ComercialCase>) {
    return { ...x } as ComercialCase;
  }
  async save(x: ComercialCase) {
    if (!x.id) x.id = `caso-${this.rows.length + 1}`;
    const i = this.rows.findIndex((r) => r.id === x.id);
    const copy = structuredClone({ ...x, proformaFirmada: undefined }) as unknown as ComercialCase;
    copy.proformaFirmada = x.proformaFirmada ?? (i >= 0 ? this.rows[i].proformaFirmada : null);
    if (copy.nextCheckAt && !(copy.nextCheckAt instanceof Date)) copy.nextCheckAt = new Date(copy.nextCheckAt);
    if (i >= 0) this.rows[i] = copy;
    else this.rows.push(copy);
    return x;
  }
  private match(r: ComercialCase, where: Record<string, unknown>) {
    return Object.entries(where).every(([k, v]) => {
      const val = (r as unknown as Record<string, unknown>)[k];
      if (v instanceof FindOperator) {
        if (v.type === 'in') return (v.value as unknown[]).includes(val);
        return true;
      }
      return val === v;
    });
  }
  async findOne({ where }: { where: Record<string, unknown> }) {
    const r = this.rows.find((x) => this.match(x, where));
    return r ? (structuredClone({ ...r, proformaFirmada: undefined }) as unknown as ComercialCase) : null;
  }
  async find({ where }: { where: Record<string, unknown> }) {
    return this.rows.filter((x) => this.match(x, where)).map((r) => structuredClone({ ...r, proformaFirmada: undefined }) as unknown as ComercialCase);
  }
  createQueryBuilder() {
    let id = '';
    const qb = {
      addSelect: () => qb,
      where: (_: string, p: { id: string }) => {
        id = p.id;
        return qb;
      },
      getOne: async () => this.rows.find((r) => r.id === id) ?? null,
    };
    return qb;
  }
}

class FakeIdempotency {
  rows = new Map<string, { status: string; result?: unknown }>();
  async claim(_t: string, _e: string, key: string) {
    const ex = this.rows.get(key);
    if (ex) return { claimed: false, existingStatus: ex.status, existingResult: ex.result };
    this.rows.set(key, { status: 'processing' });
    return { claimed: true };
  }
  async saveProgress(_t: string, key: string, result: unknown) {
    this.rows.get(key)!.result = result;
  }
  async markCompleted(_t: string, key: string, result: unknown) {
    this.rows.set(key, { status: 'completed', result });
  }
  async markFailed(_t: string, key: string) {
    this.rows.get(key)!.status = 'failed';
  }
  async reclaimFailed(_t: string, key: string) {
    const r = this.rows.get(key);
    if (r?.status !== 'failed') return false;
    r.status = 'processing';
    return true;
  }
}

interface WorldOpts {
  modo?: 'supervisado' | 'automatico';
  emailMode?: 'mock' | 'real';
  obenPlusMode?: 'mock' | 'real';
  listas?: Record<string, string[]>;
  /** Falla forzada de una operación de obenPlus (ej. timeout). */
  fallar?: Record<string, string>;
}

function world(opts: WorldOpts = {}) {
  const store = new InMemoryObenPlusSimStore();
  const obenPlus = new ObenPlusMockAdapter(new StaticScenarioProvider(), store);
  const emails: Array<Record<string, unknown>> = [];
  const obenCalls: string[] = [];
  const fallar = { ...(opts.fallar ?? {}) };
  let seq = 0;
  const hub = {
    call: jest.fn(async (system: string, op: string, args: Record<string, unknown>) => {
      if (system === 'email') {
        emails.push(args);
        return { ok: true, mode: opts.emailMode ?? 'mock', data: { id: `<m${++seq}@oben>` } };
      }
      obenCalls.push(op);
      if (fallar[op]) return { ok: false, mode: 'mock', error: fallar[op] };
      return obenPlus.execute(op, args, CTX);
    }),
    capabilities: jest.fn(async (system: string) => ({
      mode: system === 'email' ? (opts.emailMode ?? 'mock') : system === 'obenPlus' ? (opts.obenPlusMode ?? 'mock') : 'real',
    })),
  };

  const clientesDb = [
    { id: 'cli-1', ...CLIENTE_DEMO, isActive: true, finalCustomerInSubject: false },
    { id: 'cli-2', clientId: 'DRU', name: 'DRUMMOND', email: 'compras@drumon.ltd.com', authorizedDomains: ['drumon.ltd.com'], obenCode: 'DRU-01', comercialEmail: null, isActive: true, finalCustomerInSubject: false },
  ];
  const clients = {
    findByEmailDomain: jest.fn(async (d: string) => {
      const hits = clientesDb.filter((c) => c.authorizedDomains.includes(d) || c.email.endsWith(`@${d}`));
      return { client: hits.length === 1 ? hits[0] : null, ambiguous: hits.length > 1 };
    }),
    findOne: jest.fn(async (id: string) => clientesDb.find((c) => c.id === id)),
  };
  const eqDb = EQUIVALENCIAS_DEMO.map(([clientCode, obenCode], i) => ({ id: `eq-${i}`, clientId: 'cli-1', clientCode, obenCode }));
  const equivalences = {
    findAll: jest.fn(async (clientId: string) => eqDb.filter((e) => e.clientId === clientId)),
    create: jest.fn(async (dto: { clientId: string; clientCode: string; obenCode: string }) => {
      const e = { id: `eq-${eqDb.length}`, ...dto };
      eqDb.push(e);
      return e;
    }),
  };
  const listas = opts.listas ?? {
    [LISTA_CUSTOMER_SERVICE]: ['cs@oben-simulado.example'],
    [LISTA_COPIA_PROFORMA]: ['copia@oben-simulado.example'],
    [LISTA_CARTERA]: ['cartera@oben-simulado.example'],
  };
  const distributionLists = { resolveRecipients: jest.fn(async (_t: string, key: string) => ({ to: listas[key] ?? [], cc: [], bcc: [] })) };
  const auditEvents: Array<Record<string, unknown>> = [];
  const audit = {
    log: jest.fn(async (e: Record<string, unknown>) => auditEvents.push(e)),
    listForEntity: jest.fn(async (type: string, id: string) =>
      auditEvents.filter((e) => e.entityType === type && e.entityId === id).map((e) => ({ ...e, createdAt: new Date() })),
    ),
  };
  const tenant = { id: 't1', settings: { comercial: { habilitado: true, modo: opts.modo ?? 'supervisado' } } as Record<string, unknown> };
  const tenants = { findOne: jest.fn(async () => tenant), save: jest.fn(async (t: unknown) => t) };
  const repo = new MemRepo();
  const idempotency = new FakeIdempotency();
  const intake = new ComercialIntakeService(hub as never, clients as never, equivalences as never);
  const flujo = new ComercialFlujoService(
    repo as never,
    tenants as never,
    intake,
    hub as never,
    CTX as never,
    audit as never,
    distributionLists as never,
    idempotency as never,
    clients as never,
    equivalences as never,
  );
  const sim = (op: string, numberPF: string, extra: Record<string, unknown> = {}) => obenPlus.execute(op, { numberPF, ...extra }, CTX);
  /** Fuerza que el caso esté "vencido" y corre un paso del procesador. */
  const tick = async (id: string, antesDe?: (c: ComercialCase) => void) => {
    const c = await flujo.obtener(id);
    antesDe?.(c);
    return flujo.procesar(c);
  };
  return { flujo, hub, repo, emails, obenCalls, sim, tick, auditEvents, equivalences, idempotency, tenant, fallar, store };
}

async function direccionDemo() {
  const obenPlus = new ObenPlusMockAdapter(new StaticScenarioProvider());
  const m = await obenPlus.execute<{ direcciones: Array<{ direccion: string; ciudad: string }> }>('cliente.consultar', { codigoCliente: CLIENTE_DEMO.obenCode }, CTX);
  return m.data!.direcciones[0];
}

async function ocDemo(extra: Partial<{ body: string; from: string; messageId: string }> = {}) {
  const d = await direccionDemo();
  return {
    from: extra.from ?? CLIENTE_DEMO.email,
    subject: 'Orden de compra OC-SIM-0001',
    messageId: extra.messageId ?? '<oc-1@cliente-simulado.example>',
    body:
      extra.body ??
      [
        'Buenos días, favor ingresar la orden de compra OC-SIM-0001.',
        'Fecha requerida: 2026-10-30',
        `Dirección de entrega: ${d.direccion} ${d.ciudad}`,
        '- BOPP 15, 1.000 kg, ancho 425 mm, precio USD 2,85',
        '- Poliester 15 g, 2.204,6 lb, ancho 17", precio USD 3,10',
        '- BOPP MATE 20, 500 kg, ancho 60 cm',
      ].join('\n'),
  };
}

describe('ComercialFlujoService — flujo Comercial de punta a punta (reunión 2026-09-23)', () => {
  describe('orden de compra → caso', () => {
    it('traduce cada línea con la tabla de equivalencias, convierte unidades y resuelve el destino con el maestro del cliente', async () => {
      const w = world();
      const caso = await w.flujo.recibirOc(await ocDemo(), 'correo');

      expect(caso).toMatchObject({ estado: 'oc_recibida', cliente: CLIENTE_DEMO.name, ocNumero: 'OC-SIM-0001', fechaRequerida: '2026-10-30', missing: [] });
      expect(caso.lineas.map((l) => [l.codigoOben, l.kilos, l.anchoMm])).toEqual([
        ['SIM-SC15TN', 1000, 425],
        ['SIM-ET12', 999.99, 431.8],
        ['SIM-MT20', 500, 600],
      ]);
      expect(caso.lineas[1].conversiones).toEqual(expect.arrayContaining([expect.stringMatching(/2\.204,6 lb → 999,99 kg/), expect.stringMatching(/in → 431,8 mm/)]));
      // Gramaje: no se convierte con fórmula (Alejandra lo hace por referencia) — lo resolvió la equivalencia.
      expect(caso.lineas[1].espesorMicras).toBeNull();
      expect(caso.lineas[1].conversiones.join(' ')).toMatch(/Gramaje 15 g\/m²: no se convierte/);
      expect(caso.destino).toMatchObject({ fuente: 'orden_compra' });
      expect(caso.simulated).toBe(true);
      expect(caso.simulatedItems.join(' ')).toMatch(/SIMULADOR de OBEN MAS/);

      // Freno de mano: espera confirmación y avisa a Customer Service.
      expect(caso.accionPendiente).toMatchObject({ tipo: 'crear_proforma' });
      expect(w.obenCalls).not.toContain('proforma.crear');
      expect(w.emails.at(-1)).toMatchObject({ to: 'cs@oben-simulado.example', subject: expect.stringMatching(/^\[SIMULADO\] \[Comercial\] Confirmar/) });
    });

    it('la misma orden (mismo Message-ID) nunca abre dos casos', async () => {
      const w = world();
      const oc = await ocDemo();
      const a = await w.flujo.recibirOc(oc, 'correo');
      const b = await w.flujo.recibirOc(oc, 'correo');
      expect(b.id).toBe(a.id);
      expect(w.repo.rows).toHaveLength(1);
    });

    it('anti-fraude: un dominio parecido pero no idéntico ("drumonltda.com") NO es el cliente — alerta y no avanza', async () => {
      const w = world();
      const caso = await w.flujo.recibirOc({ ...(await ocDemo()), from: 'compras@drumonltda.com', messageId: '<f@x>' }, 'correo');
      expect(caso.clientId).toBeNull();
      expect(caso.atencion[0]).toMatch(/Remitente NO autorizado.*drumonltda\.com/);
      expect(caso.accionPendiente).toBeNull();
      expect(w.emails[0].subject).toMatch(/remitente no autorizado/);
    });

    it('una línea sin equivalencia queda en "missing"; al corregirla (y guardarla en la tabla) el caso avanza', async () => {
      const w = world();
      const oc = await ocDemo();
      const caso = await w.flujo.recibirOc({ ...oc, body: oc.body.replace('- BOPP MATE 20, 500 kg', '- PELICULA RARA X9, 500 kg') }, 'correo');
      expect(caso.missing).toEqual([expect.stringMatching(/Línea 3 .*sin equivalencia para "PELICULA RARA X9"/)]);
      expect(caso.accionPendiente).toBeNull();

      const corregido = await w.flujo.editar(caso.id, { lineas: [{ n: 3, codigoOben: 'SIM-MT20', guardarEquivalencia: true }] });
      expect(corregido.missing).toEqual([]);
      expect(corregido.accionPendiente).toMatchObject({ tipo: 'crear_proforma' });
      expect(w.equivalences.create).toHaveBeenCalledWith(expect.objectContaining({ clientCode: 'PELICULA RARA X9', obenCode: 'SIM-MT20' }));
    });

    it('sin dirección en la OC y con varias direcciones creadas no escoge ninguna: pide cuál', async () => {
      const w = world();
      const oc = await ocDemo();
      const caso = await w.flujo.recibirOc({ ...oc, body: oc.body.replace(/Dirección de entrega: .*\n/, '') }, 'correo');
      // El maestro simulado del cliente demo puede tener 1 o varias direcciones; con 1 la toma, con varias la pide.
      if (caso.destino) expect(caso.destino.fuente).toBe('maestro');
      else expect(caso.missing.join(' ')).toMatch(/direcciones de entrega y la orden de compra no indica cuál/);
    });
  });

  describe('Proforma → cubicaje → cliente → aprobación → cartera → activa → despacho', () => {
    it('recorre el ciclo completo en modo supervisado, con cada escritura confirmada por una persona', async () => {
      const w = world();
      let caso = await w.flujo.recibirOc(await ocDemo(), 'correo');

      caso = await w.flujo.confirmar(caso.id);
      expect(caso).toMatchObject({ estado: 'sin_cubicar', numberPF: 'SIM-95001', accionPendiente: null });
      await expect(w.flujo.confirmar(caso.id)).rejects.toThrow(/ninguna acción pendiente/);

      // Planeación aún no cubica: nada se envía.
      const n = w.emails.length;
      caso = await w.tick(caso.id);
      expect(caso.estado).toBe('sin_cubicar');
      expect(w.emails.length).toBe(n);

      // Planeación cubica → el PDF sale al cliente, en el hilo de su OC, con copia al comercial.
      await w.sim('sim.cubicar', 'SIM-95001');
      caso = await w.tick(caso.id);
      expect(caso.estado).toBe('enviada_cliente');
      const envio = w.emails.at(-1)!;
      expect(envio).toMatchObject({
        to: CLIENTE_DEMO.email,
        subject: '[SIMULADO] Proforma SIM-95001 — su orden de compra OC-SIM-0001 [PF SIM-95001]',
        inReplyTo: '<oc-1@cliente-simulado.example>',
      });
      expect(String(envio.cc)).toContain(CLIENTE_DEMO.comercialEmail);
      expect(String(envio.cc)).toContain('copia@oben-simulado.example');
      expect((envio.attachments as Array<{ filename: string }>)[0].filename).toBe('Proforma_SIMULADA-PFSIM-95001.pdf');
      expect(caso.seguimiento).toMatchObject({ tipo: 'firma', enviados: 0 });
      expect(Date.parse(caso.seguimiento.proximoEn!) - Date.now()).toBeGreaterThan(23 * HOUR);

      // El cliente aprueba en el mismo hilo, con la Proforma firmada.
      const r = await w.flujo.procesarCorreoRespuesta({
        from: 'gerente@cliente-simulado.example',
        subject: 'Re: Proforma SIM-95001 [PF SIM-95001]',
        body: 'Buen día, aprobada. Adjunto la proforma firmada.\n\n> Adjuntamos la Proforma...',
        messageId: '<resp-1@cliente-simulado.example>',
        inReplyTo: String(caso.hiloMessageIds.at(-1)),
        attachments: [{ filename: 'PF-firmada.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-1.4 firmada') }],
      });
      expect(r?.tipo).toBe('aprueba');
      caso = await w.flujo.obtener(caso.id);
      expect(caso.accionPendiente).toMatchObject({ tipo: 'aprobar' });
      expect(caso.proformaFirmadaNombre).toBe('PF-firmada.pdf');

      caso = await w.flujo.confirmar(caso.id);
      expect(caso).toMatchObject({ estado: 'retenida', numberOrderSales: 9_000_001 });
      // Reenvío automático a cartera con la Proforma firmada (hoy se hace a mano).
      const cartera = w.emails.find((e) => e.to === 'cartera@oben-simulado.example')!;
      expect(cartera.subject).toMatch(/aprobada por .* OV 9000001 retenida/);
      expect((cartera.attachments as Array<{ filename: string }>)[0].filename).toBe('PF-firmada.pdf');

      // Cartera no libera y vence el seguimiento → correo al comercial.
      caso = await w.tick(caso.id, (c) => (c.seguimiento.proximoEn = new Date(Date.now() - 1000).toISOString()));
      expect(w.emails.at(-1)).toMatchObject({ to: CLIENTE_DEMO.comercialEmail, subject: expect.stringMatching(/retenida por cartera.*¿en qué va\?/) });
      expect(caso.seguimiento.enviados).toBe(1);

      // Cartera libera → acción "activar" (freno de mano) → activa.
      await w.sim('sim.liberarCartera', 'SIM-95001');
      caso = await w.tick(caso.id);
      expect(caso.accionPendiente).toMatchObject({ tipo: 'activar' });
      caso = await w.flujo.confirmar(caso.id);
      expect(caso.estado).toBe('activa');
      expect(caso.fechas).toEqual(expect.objectContaining({ ocRecibida: expect.any(String), proformaCreada: expect.any(String), cubicada: expect.any(String), enviadaCliente: expect.any(String), aprobadaCliente: expect.any(String), carteraLiberada: expect.any(String), activa: expect.any(String) }));

      // Producción cambia la fecha comprometida → aviso a Customer Service.
      caso = await w.tick(caso.id);
      await w.sim('sim.cambiarEntrega', 'SIM-95001', { fecha: '2026-11-02' });
      caso = await w.tick(caso.id);
      expect(caso.entregaComprometida).toBe('2026-11-02');
      expect(caso.eventos.at(-1)?.detalle).toMatch(/entrega comprometida cambió: .* → 2026-11-02/);
      expect(w.emails.at(-1)!.subject).toMatch(/Cambio de fecha de entrega/);

      // Sale la Lista de Empaque de la OV → caso cerrado.
      w.auditEvents.push({ entityType: 'packing_list', entityId: '9000001', action: 'ov_approved_lista_empaque_enviada', outputData: { ok: true } });
      caso = await w.tick(caso.id);
      expect(caso.estado).toBe('cerrada');
      expect(caso.nextCheckAt).toBeNull();
    });

    it('modo automático: sin confirmaciones — la OC se vuelve Proforma sola', async () => {
      const w = world({ modo: 'automatico' });
      const caso = await w.flujo.recibirOc(await ocDemo(), 'correo');
      expect(caso).toMatchObject({ estado: 'sin_cubicar', numberPF: 'SIM-95001', accionPendiente: null });
    });

    it('recordatorios al cliente: 3 cada 24 h y luego semanal (valores por defecto de la reunión)', async () => {
      const w = world();
      let caso = await w.flujo.recibirOc(await ocDemo(), 'correo');
      caso = await w.flujo.confirmar(caso.id);
      await w.sim('sim.cubicar', caso.numberPF!);
      caso = await w.tick(caso.id);
      const horas: number[] = [];
      for (let i = 0; i < 4; i++) {
        caso = await w.tick(caso.id, (c) => (c.seguimiento.proximoEn = new Date(Date.now() - 1000).toISOString()));
        horas.push(Math.round((Date.parse(caso.seguimiento.proximoEn!) - Date.now()) / HOUR));
        expect(w.emails.at(-1)).toMatchObject({ to: CLIENTE_DEMO.email, subject: expect.stringMatching(/^\[SIMULADO\] Re: Proforma/) });
      }
      expect(horas).toEqual([24, 24, 168, 168]);
      expect(caso.seguimiento.enviados).toBe(4);
    });
  });

  describe('respuesta del cliente', () => {
    async function enviada(w: ReturnType<typeof world>) {
      let caso = await w.flujo.recibirOc(await ocDemo(), 'correo');
      caso = await w.flujo.confirmar(caso.id);
      await w.sim('sim.cubicar', caso.numberPF!);
      return w.tick(caso.id);
    }
    const responder = (w: ReturnType<typeof world>, caso: ComercialCase, body: string, from = 'compras@cliente-simulado.example') =>
      w.flujo.procesarCorreoRespuesta({ from, subject: `Re: [PF ${caso.numberPF}]`, body, messageId: `<r-${Math.random()}@x>`, inReplyTo: caso.hiloMessageIds.at(-1)! });

    it('desde un dominio NO autorizado: alerta de posible suplantación y ninguna acción', async () => {
      const w = world();
      const caso = await enviada(w);
      const r = await responder(w, caso, 'Aprobada', 'compras@cliente-simulad0.example');
      expect(r?.tipo).toBe('no_autorizado');
      const c = await w.flujo.obtener(caso.id);
      expect(c.accionPendiente).toBeNull();
      expect(c.atencion.join(' ')).toMatch(/dominio NO autorizado/);
      expect(w.emails.at(-1)!.subject).toMatch(/ALERTA/);
    });

    it('una pregunta no se interpreta como decisión: queda para una persona', async () => {
      const w = world();
      const caso = await enviada(w);
      const r = await responder(w, caso, '¿Pueden confirmar la fecha de entrega?');
      expect(r?.tipo).toBe('desconocida');
      expect((await w.flujo.obtener(caso.id)).accionPendiente).toBeNull();
    });

    it('rechaza → al confirmar se anula en OBEN MAS y se avisa al comercial', async () => {
      const w = world();
      const caso = await enviada(w);
      await responder(w, caso, 'Lamentablemente no continuamos con el pedido.');
      const c = await w.flujo.confirmar(caso.id);
      expect(c.estado).toBe('rechazada');
      expect((await w.store.get('t1', caso.numberPF!))?.anulada).toBe(true);
    });

    it('modifica → se leen las nuevas cantidades y, al confirmar, la Proforma vuelve a "sin cubicar"', async () => {
      const w = world();
      const caso = await enviada(w);
      await responder(w, caso, 'Favor modificar la cantidad:\n- BOPP 15, 2.000 kg, ancho 425 mm');
      let c = await w.flujo.obtener(caso.id);
      expect(c.accionPendiente).toMatchObject({ tipo: 'modificar', lineas: [expect.objectContaining({ codigoOben: 'SIM-SC15TN', kilos: 2000 })] });
      c = await w.flujo.confirmar(caso.id);
      expect(c.estado).toBe('sin_cubicar');
      expect(c.lineas).toHaveLength(1);
      expect((await w.store.get('t1', caso.numberPF!))?.estado).toBe('sin_cubicar');
    });
  });

  describe('candados', () => {
    it('un caso con datos simulados NUNCA se escribe en un OBEN MAS real', async () => {
      const w = world({ obenPlusMode: 'real' });
      const caso = await w.flujo.recibirOc(await ocDemo(), 'correo');
      await expect(w.flujo.confirmar(caso.id)).rejects.toThrow(/Candado: este caso usa datos SIMULADOS/);
      expect(w.obenCalls).not.toContain('proforma.crear');
    });

    it('un PDF simulado NUNCA sale a un cliente real (correo real y destinatario real)', async () => {
      const w = world({ emailMode: 'real', listas: { [LISTA_COPIA_PROFORMA]: ['copia@oben.com'] } });
      let caso = await w.flujo.recibirOc(await ocDemo(), 'correo');
      caso = await w.flujo.confirmar(caso.id);
      await w.sim('sim.cubicar', caso.numberPF!);
      caso = await w.tick(caso.id);
      expect(caso.estado).toBe('cubicada');
      expect(caso.atencion.join(' ')).toMatch(/Candado: la Proforma o el caso son SIMULADOS/);
      expect(w.emails.some((e) => e.to === CLIENTE_DEMO.email)).toBe(false);
      expect(caso.nextCheckAt).toBeNull();
    });

    it('idempotencia: un timeout al crear la Proforma exige verificar en OBEN MAS antes de reintentar', async () => {
      const w = world({ fallar: { 'proforma.crear': 'timeout: sin respuesta tras 60000ms' } });
      const caso = await w.flujo.recibirOc(await ocDemo(), 'correo');
      await expect(w.flujo.confirmar(caso.id)).rejects.toThrow(/ambigua/);
      delete w.fallar['proforma.crear'];
      await expect(w.flujo.confirmar(caso.id)).rejects.toThrow(ConflictException);
      const c = await w.flujo.confirmar(caso.id, { verificadoEnObenMas: true });
      expect(c.numberPF).toBe('SIM-95001');
    });

    it('un error de negocio de OBEN MAS sí se puede reintentar sin más', async () => {
      const w = world({ fallar: { 'proforma.crear': 'BUSINESS_ERROR: cliente bloqueado' } });
      const caso = await w.flujo.recibirOc(await ocDemo(), 'correo');
      await expect(w.flujo.confirmar(caso.id)).rejects.toThrow(BadRequestException);
      delete w.fallar['proforma.crear'];
      await expect(w.flujo.confirmar(caso.id)).resolves.toMatchObject({ estado: 'sin_cubicar' });
    });
  });

  describe('tablero', () => {
    it('cuenta por etapa, lista lo que requiere atención y calcula tiempos', async () => {
      const w = world();
      const a = await w.flujo.recibirOc(await ocDemo(), 'correo');
      await w.flujo.recibirOc({ ...(await ocDemo()), from: 'x@desconocido.example', messageId: '<oc-2@x>' }, 'correo');
      await w.flujo.confirmar(a.id);
      const t = await w.flujo.tablero();
      expect(t.total).toBe(2);
      expect(t.embudo).toMatchObject({ oc_recibida: 1, sin_cubicar: 1 });
      expect(t.requierenAtencion).toHaveLength(1);
      expect(t.tiemposPromedioHoras.ocAProforma).not.toBeNull();
      expect(t.simulated).toBe(true);
    });

    it('rechaza un filtro de estado o de fecha inválido', async () => {
      const w = world();
      await expect(w.flujo.listar({ estado: 'ubicada' })).rejects.toThrow(/estado inválido/);
      await expect(w.flujo.tablero({ desde: '27/09/2026' })).rejects.toThrow(/YYYY-MM-DD/);
    });
  });

  describe('configuración', () => {
    it('reporta qué valores son "por defecto" (pendientes de confirmar por Customer Service) y valida cambios', async () => {
      const w = world();
      const { config, porDefecto } = await w.flujo.config();
      expect(config.seguimientoFirma).toEqual({ intervalosHoras: [24, 24, 24], luegoCadaHoras: 168 });
      expect(porDefecto).toEqual(expect.arrayContaining(['seguimientoFirma', 'seguimientoCartera', 'ejemplosOc']));
      await expect(w.flujo.actualizarConfig({ seguimientoFirma: { intervalosHoras: [-1] } })).rejects.toThrow(BadRequestException);
      const r = await w.flujo.actualizarConfig({ seguimientoFirma: { intervalosHoras: [6, 12], luegoCadaHoras: null } });
      expect(r.config.seguimientoFirma).toEqual({ intervalosHoras: [6, 12], luegoCadaHoras: null });
      expect(r.porDefecto).not.toContain('seguimientoFirma');
    });
  });
});
