import { clasificarRespuesta, cortarCitado } from './comercial-respuesta';
import { horasHastaSiguiente, leerConfig, parseSeguimiento } from './comercial-config';

describe('clasificarRespuesta (respuesta del cliente a la Proforma)', () => {
  it.each([
    ['Buen día, aprobada. Adjunto firmada.', 'aprueba'],
    ['Confirmamos el pedido, pueden proceder.', 'aprueba'],
    ['Approved, thanks', 'aprueba'],
    ['Lamentablemente no continuamos con el pedido', 'rechaza'],
    ['Por favor cancelar la orden', 'rechaza'],
    ['No aprobamos esta proforma', 'rechaza'],
    ['Favor aumentar la cantidad del BOPP 15 a 2.000 kg', 'modifica'],
    ['Aprobamos, pero en lugar de 1000 kg necesitamos 1500 kg', 'modifica'],
    ['Recibido', 'desconocida'],
  ])('"%s" → %s', (texto, tipo) => {
    expect(clasificarRespuesta(texto, []).tipo).toBe(tipo);
  });

  it('una pregunta nunca es una decisión (ni "¿pueden confirmar?" ni "¿se puede cancelar?")', () => {
    expect(clasificarRespuesta('¿Pueden confirmar la fecha de entrega?', []).tipo).toBe('desconocida');
    expect(clasificarRespuesta('¿Se puede cancelar?', []).tipo).toBe('desconocida');
  });

  it('solo cuenta lo nuevo: el texto citado del correo anterior no se interpreta', () => {
    const texto = 'Recibido, lo revisamos.\n\nEl lun, 28 sep 2026 escribió:\n> Por favor confirmar y aprobar la proforma';
    expect(cortarCitado(texto)).toBe('Recibido, lo revisamos.');
    expect(clasificarRespuesta(texto, []).tipo).toBe('desconocida');
  });

  it('un PDF devuelto sin texto se toma como la Proforma firmada', () => {
    expect(clasificarRespuesta('', [{ filename: 'proforma firmada.pdf' }]).tipo).toBe('aprueba');
  });
});

describe('configuración del flujo Comercial', () => {
  it('por defecto: apagado, supervisado ("freno de mano"), 3 recordatorios cada 24 h y luego semanal', () => {
    const { config, porDefecto } = leerConfig({});
    expect(config).toMatchObject({ habilitado: false, modo: 'supervisado', extractor: { provider: 'reglas' } });
    expect(config.seguimientoFirma).toEqual({ intervalosHoras: [24, 24, 24], luegoCadaHoras: 168 });
    expect([...porDefecto].sort()).toEqual(['ejemplosOc', 'modo', 'seguimientoCartera', 'seguimientoFirma']);
  });

  it('respeta lo configurado y descarta valores inválidos', () => {
    const { config, porDefecto } = leerConfig({
      comercial: { habilitado: true, modo: 'automatico', seguimientoFirma: { intervalosHoras: [6], luegoCadaHoras: null }, seguimientoCartera: { intervalosHoras: [0] }, extractor: { provider: 'ollama', host: 'http://x', model: 'm' } },
    });
    expect(config).toMatchObject({ habilitado: true, modo: 'automatico', extractor: { provider: 'ollama', host: 'http://x', model: 'm' } });
    expect(config.seguimientoFirma).toEqual({ intervalosHoras: [6], luegoCadaHoras: null });
    expect(porDefecto).toContain('seguimientoCartera');
    expect(parseSeguimiento({ intervalosHoras: ['24'] })).toBeNull();
  });

  it('horas hasta el siguiente recordatorio', () => {
    const s = { intervalosHoras: [24, 48], luegoCadaHoras: 168 };
    expect([0, 1, 2, 5].map((n) => horasHastaSiguiente(s, n))).toEqual([24, 48, 168, 168]);
    expect(horasHastaSiguiente({ intervalosHoras: [24], luegoCadaHoras: null }, 1)).toBeNull();
  });
});
