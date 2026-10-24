import { TraductorService, idiomaDe, traducirCampos } from './traductor.service';

function armar(responder: (lote: string[]) => unknown) {
  const filas: Array<{ idioma: string; hash: string; texto: string }> = [];
  const ds = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT')) {
        const [idioma, hashes] = params as [string, string[]];
        return filas.filter((f) => f.idioma === idioma && hashes.includes(f.hash));
      }
      for (let i = 0; i < params.length; i += 4) filas.push({ idioma: params[i] as string, hash: params[i + 1] as string, texto: params[i + 3] as string });
      return [];
    }),
  };
  const svc = new TraductorService(ds as never);
  const llm = {
    completar: jest.fn(async (mensajes: Array<{ content: string }>) => {
      const lote = JSON.parse(mensajes[1].content) as string[];
      return { texto: JSON.stringify(responder(lote)), llamadas: [], cortada: false };
    }),
  };
  (svc as unknown as { llm: typeof llm }).llm = llm;
  return { svc, llm, filas };
}

describe('TraductorService (Oben Xmart en 4 idiomas)', () => {
  it('lee el idioma del navegador', () => {
    expect(idiomaDe('en-US,en;q=0.9')).toBe('en');
    expect(idiomaDe('pt')).toBe('pt');
    expect(idiomaDe('de')).toBe('es');
    expect(idiomaDe(undefined)).toBe('es');
  });

  it('traduce una vez y luego sale del caché (memoria y base)', async () => {
    const { svc, llm, filas } = armar((lote) => lote.map((t) => `EN:${t}`));
    expect(await svc.varios(['Cargar proforma', 'Aplicar'], 'en')).toEqual(['EN:Cargar proforma', 'EN:Aplicar']);
    expect(await svc.varios(['Aplicar'], 'en')).toEqual(['EN:Aplicar']);
    expect(llm.completar).toHaveBeenCalledTimes(1);
    expect(filas).toHaveLength(2);
    expect(await svc.varios(['Aplicar'], 'es')).toEqual(['Aplicar']);
  });

  it('si el modelo responde mal o falla, sale en español (nunca vacío)', async () => {
    const mal = armar(() => ['solo uno']);
    expect(await mal.svc.varios(['Uno dos', 'Tres cuatro'], 'fr')).toEqual(['solo uno', 'solo uno']);
    const roto = armar(() => {
      throw new Error('sin saldo');
    });
    expect(await roto.svc.varios(['Uno dos'], 'pt')).toEqual(['Uno dos']);
  });

  it('traducirCampos solo toca los campos pedidos y nunca cambia el original', async () => {
    const { svc } = armar((lote) => lote.map((t) => `EN:${t}`));
    const original = { titulo: 'Hola mundo', key: 'facturacion', reglas: ['Regla uno'], pasos: [{ titulo: 'Paso uno', href: '/x' }] };
    const r = await traducirCampos(original, new Set(['titulo', 'reglas']), 'en', svc);
    expect(r).toEqual({ titulo: 'EN:Hola mundo', key: 'facturacion', reglas: ['EN:Regla uno'], pasos: [{ titulo: 'EN:Paso uno', href: '/x' }] });
    expect(original.titulo).toBe('Hola mundo');
    expect(original.reglas[0]).toBe('Regla uno');
  });
});
