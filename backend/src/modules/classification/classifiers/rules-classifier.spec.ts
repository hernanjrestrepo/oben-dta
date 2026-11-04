import { RulesClassifier } from './rules-classifier';

describe('RulesClassifier', () => {
  const classifier = new RulesClassifier();

  it('identifica una PO por CUERPO (no solo asunto) + adjunto', async () => {
    const result = await classifier.classify({
      from: 'compras@cliente.com',
      subject: 'Seguimiento pedido',
      body: 'Adjunto la orden de compra PO-108149 para su procesamiento. Confirmamos la compra de los ítems acordados.',
      attachments: [{ filename: 'OC-108149.pdf' }],
    });
    expect(result.category).toBe('purchase_order');
    expect(result.provider).toBe('rules');
    expect(result.reasons.length).toBeGreaterThan(1); // más de un patrón: no depende solo del asunto
  });

  it('identifica solicitud de cotización', async () => {
    const result = await classifier.classify({
      from: 'compras@cliente.com',
      subject: 'Consulta',
      body: 'Buenas tardes, favor cotizar 500 unidades de película BOPP. Es una solicitud de cotización urgente.',
    });
    expect(result.category).toBe('quote_request');
  });

  it('identifica correo de naviera por nombre de naviera + BL', async () => {
    const result = await classifier.classify({
      from: 'ops@maersk.com',
      subject: 'Booking confirmation',
      body: 'Se adjunta el Bill of Lading y la tarifa de flete marítimo para el contenedor reservado con Maersk.',
    });
    expect(result.category).toBe('carrier');
  });

  it('identifica correo COMEX por lista de empaque', async () => {
    const result = await classifier.classify({
      from: 'planta@oben.com',
      subject: 'Cierre de producción',
      body: 'Se generó la Lista de Empaque Unificada y el Consumo ME del pedido, junto con la liquidación de exportación.',
    });
    expect(result.category).toBe('comex');
  });

  it('sin ninguna señal reconocible → unknown con confianza baja', async () => {
    const result = await classifier.classify({
      from: 'alguien@dominio.com',
      subject: 'Hola',
      body: 'Buenos días, ¿cómo están?',
    });
    expect(result.category).toBe('unknown');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('cliente activo conocido refuerza (no decide por sí solo) la confianza de PO', async () => {
    const withoutContext = await classifier.classify({
      from: 'compras@cliente.com',
      subject: 'PO',
      body: 'orden de compra PO-1000',
    });
    const withContext = await classifier.classify({
      from: 'compras@cliente.com',
      subject: 'PO',
      body: 'orden de compra PO-1000',
      knownClient: { isActive: true, name: 'Cliente Test' },
    });
    expect(withContext.confidence).toBeGreaterThanOrEqual(withoutContext.confidence);
  });

  describe('pedidos reenviados por Comercial (3-nov)', () => {
    const clasifica = (subject: string, body = '', attachments: Array<{ filename: string }> = []) =>
      new RulesClassifier().classify({ from: 'alejandramolinares@obengroup.com', subject, body, attachments: attachments.map((a) => ({ filename: a.filename, mimeType: 'application/pdf' })) });

    it('"PEDIDO ... CONTENEDOR ..." es una orden, no un correo de naviera (el contenedor pesa 1, el pedido 2)', async () => {
      const r = await clasifica('RV: PEDIDO VICTOR CASTAÑEDA CONTENEDOR 1 MES NOVIEMBRE');
      expect(r.category).toBe('purchase_order');
    });

    it('"NUEVO PEDIDO ..." es una orden', async () => {
      expect((await clasifica('NUEVO PEDIDO VICTOR CASTAÑEDA')).category).toBe('purchase_order');
    });

    it('un correo de naviera de verdad sigue siendo naviera (booking / BL pesan más)', async () => {
      expect((await clasifica('Booking confirmation MSC contenedor 40HC', 'bill of lading adjunto')).category).toBe('carrier');
    });
  });
});

describe('RulesClassifier — "B/L" como condición de pago no es un documento de naviera (4-nov)', () => {
  const c = new RulesClassifier();
  const nl = String.fromCharCode(10);
  const cuerpo = [
    'Hola Sebastian, buenos días!',
    'Informo que cerramos la venta para Mega Goglio de 1 FCL 40" de BOPE ET12TA al precio de USD 2,60 CFR Puerto do Rio Grande y pago com 90 días BL.',
    'PEDIDO: 1737',
    'PRAZO DE PAGAMENTO: 90 DAYS FROM B/L',
    'Por favor, enviar la PI.',
  ].join(nl);

  it('el aviso de venta cerrada de Mega Goglio es un pedido, no una naviera', async () => {
    const r = await c.classify({ from: 'sebastiancastaneda@obengroup.com', subject: 'RV: PI 11831 PEDIDO 1737 - OPP FILM COLOMBIA - 23,2t BOPET ET12TA', body: cuerpo });
    expect(r.category).toBe('purchase_order');
  });

  it('un B/L de verdad sigue siendo naviera', async () => {
    const r = await c.classify({ from: 'ops@maersk.com', subject: 'Bill of Lading y booking confirmation', body: 'Adjunto el B/L del embarque.' });
    expect(r.category).toBe('carrier');
  });
});
