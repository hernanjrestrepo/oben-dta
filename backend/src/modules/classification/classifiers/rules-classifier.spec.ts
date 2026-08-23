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
});
