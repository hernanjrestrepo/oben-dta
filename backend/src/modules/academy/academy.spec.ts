import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { MODULOS_ACADEMY, buscarEnAcademy, moduloDePregunta, moduloDeRuta, planDe, quizObligatorio, sinRespuestas } from './academy-catalogo';
import { AcademyCertificacionPolicy, MOTIVO_ACADEMY } from './academy-certificacion.policy';
import { ajustesDe } from './academy-ajustes';

describe('Xmart Academy — catálogo', () => {
  it('cada módulo tiene contenido completo y un quiz con respuestas válidas', () => {
    for (const m of MODULOS_ACADEMY) {
      expect(m.pasos.length).toBeGreaterThan(0);
      expect(m.reglas.length).toBeGreaterThan(0);
      expect(m.quiz.length).toBeGreaterThan(0);
      for (const q of m.quiz) {
        expect(q.correcta).toBeGreaterThanOrEqual(0);
        expect(q.correcta).toBeLessThan(q.opciones.length);
      }
    }
    expect(new Set(MODULOS_ACADEMY.map((m) => m.key)).size).toBe(MODULOS_ACADEMY.length);
  });

  it('las respuestas del quiz nunca salen al navegador', () => {
    const m = sinRespuestas(MODULOS_ACADEMY.find((x) => x.key === 'facturacion')!);
    expect(JSON.stringify(m.quiz)).not.toMatch(/correcta|explicacion/);
  });

  // El plan sale de los mismos permisos del menú: si cambian en menu.ts, este test lo avisa.
  const menu = join(__dirname, '..', '..', '..', '..', 'frontend', 'src', 'lib', 'menu.ts');
  (existsSync(menu) ? it : it.skip)('cada opción del menú tiene su módulo con los mismos permisos', () => {
    const texto = readFileSync(menu, 'utf8');
    const grupos: Record<string, { ver: string[]; operar: string[] }> = {};
    for (const [, nombre, ver, operar] of texto.matchAll(/const (\w+) = \{ ver: \[([^\]]*)\], operar: \[([^\]]*)\] \};/g)) {
      grupos[nombre] = { ver: [...ver.matchAll(/'([^']+)'/g)].map((x) => x[1]), operar: [...operar.matchAll(/'([^']+)'/g)].map((x) => x[1]) };
    }
    const opciones = [...texto.matchAll(/\{\s*href: '([^']+)',[\s\S]*?(?=\n\s*\{\s*href:|\n\s*\],)/g)].map((m) => m[0]);
    expect(opciones.length).toBeGreaterThanOrEqual(19);
    for (const bloque of opciones) {
      const href = /href: '([^']+)'/.exec(bloque)![1];
      if (href === '/academy') continue;
      const m = MODULOS_ACADEMY.find((x) => x.href === href);
      expect(m).toBeDefined();
      const spread = /\.\.\.(\w+)/.exec(bloque);
      const ver = spread ? grupos[spread[1]].ver : [.../ver: \[([^\]]*)\]/.exec(bloque)![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
      const operar = spread ? grupos[spread[1]].operar : [.../operar: \[([^\]]*)\]/.exec(bloque)![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
      expect({ href, ver: m!.ver, operar: m!.operar }).toEqual({ href, ver, operar });
    }
  });

  it('el plan es por perfil: lectura ve sin quiz obligatorio; transaccional lo exige', () => {
    const lectura = new Set(['exportations.read', 'invoices.read']);
    const plan = planDe(lectura).map((m) => m.key);
    expect(plan).toEqual(expect.arrayContaining(['bienvenida', 'mia', 'facturacion', 'cuadro-integracion']));
    expect(plan).not.toContain('perfiles');
    const fact = MODULOS_ACADEMY.find((m) => m.key === 'facturacion')!;
    expect(quizObligatorio(fact, lectura)).toBe(false);
    expect(quizObligatorio(fact, new Set([...lectura, 'exportations.approve']))).toBe(true);
  });

  it('atribuye rutas de la API y preguntas a su módulo', () => {
    expect(moduloDeRuta('/api/liquidacion/11599/approve')).toBe('facturacion');
    expect(moduloDeRuta('/facturacion/parciales/123/facturar')).toBe('facturas-parciales');
    expect(moduloDeRuta('/packing-list/11433')).toBe('lista-empaque');
    expect(moduloDePregunta('¿Cómo cambio el flete de una liquidación?')).toBe('facturacion');
    expect(buscarEnAcademy('¿por qué no salió la lista de empaque?').modulos[0].key).toBe('lista-empaque');
  });
});

describe('Xmart Academy — certificación obligatoria (política de autorización)', () => {
  const armar = (o: { exigir: boolean; permisos: string[]; aprobados?: Array<{ modulo: string; version_aprobada: number }>; exentos?: string[] }) => {
    const ds = {
      query: jest.fn(async (sql: string) => {
        if (sql.startsWith('SELECT settings')) return [{ settings: { academy: { exigirCertificacion: o.exigir, exentos: o.exentos ?? [] } } }];
        if (sql.includes('FROM permissions')) return o.permisos.map((key) => ({ key }));
        if (sql.includes('FROM academy_progreso')) return o.aprobados ?? [];
        return [];
      }),
    };
    return { policy: new AcademyCertificacionPolicy(ds as never), ds };
  };
  const req = (permission: string) => ({ subject: { userId: 'u1', tenantId: 't1', isSuperAdmin: false }, permission, context: { route: '/liquidacion/11599/approve' } });
  const COMEX = ['exportations.read', 'invoices.read', 'exportations.liquidate', 'exportations.approve', 'invoices.send'];

  it('apagada (por defecto) no bloquea nada', async () => {
    const { policy } = armar({ exigir: false, permisos: COMEX });
    expect(await policy.evaluate(req('exportations.approve'))).toBeNull();
    expect(ajustesDe(null)).toEqual({ exigirCertificacion: false, puntajeMinimo: 80, exentos: [] });
  });

  it('encendida: niega lo transaccional sin el quiz aprobado y dice qué módulo aprobar', async () => {
    const { policy } = armar({ exigir: true, permisos: COMEX });
    const d = await policy.evaluate(req('exportations.approve'));
    expect(d).toMatchObject({ effect: 'deny', reason: MOTIVO_ACADEMY });
    expect(String(d?.metadata?.mensaje)).toContain('Liquidación y Facturación');
  });

  it('encendida: consultar nunca se bloquea, y con el quiz aprobado se habilita', async () => {
    const sin = armar({ exigir: true, permisos: COMEX });
    expect(await sin.policy.evaluate(req('exportations.read'))).toBeNull();
    const con = armar({ exigir: true, permisos: COMEX, aprobados: [{ modulo: 'facturacion', version_aprobada: 1 }] });
    expect(await con.policy.evaluate(req('exportations.approve'))).toBeNull();
  });

  it('permisos compartidos (invoices.send) exigen todos los módulos del plan que lo dan', async () => {
    const { policy } = armar({
      exigir: true,
      permisos: [...COMEX, 'invoices.create', 'invoices.update'],
      aprobados: [{ modulo: 'facturacion', version_aprobada: 1 }],
    });
    const d = await policy.evaluate(req('invoices.send'));
    expect(d?.metadata?.modulos).toEqual(['facturas-parciales', 'invoices']);
  });

  it('no actúa si la persona no tiene el permiso (lo niega RBAC), ni con exentos ni superadmin', async () => {
    expect(await armar({ exigir: true, permisos: ['exportations.read'] }).policy.evaluate(req('exportations.approve'))).toBeNull();
    expect(await armar({ exigir: true, permisos: COMEX, exentos: ['u1'] }).policy.evaluate(req('exportations.approve'))).toBeNull();
    const { policy } = armar({ exigir: true, permisos: COMEX });
    expect(await policy.evaluate({ ...req('exportations.approve'), subject: { userId: 'u1', tenantId: 't1', isSuperAdmin: true } })).toBeNull();
  });
});
