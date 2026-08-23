import { OllamaClassifier } from './ollama-classifier';

describe('OllamaClassifier', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('parsea correctamente una respuesta JSON válida del modelo', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          category: 'purchase_order',
          confidence: 0.87,
          reasons: ['menciona orden de compra', 'adjunto PO'],
        }),
      }),
    }) as never;

    const classifier = new OllamaClassifier({ host: 'http://localhost:11434', model: 'test-model' });
    const result = await classifier.classify({
      from: 'compras@cliente.com',
      subject: 'PO',
      body: 'orden de compra adjunta',
    });

    expect(result.category).toBe('purchase_order');
    expect(result.confidence).toBe(0.87);
    expect(result.provider).toBe('ollama');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('categoría inválida devuelta por el modelo → cae a "unknown", no revienta', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: JSON.stringify({ category: 'algo_raro', confidence: 0.5 }) }),
    }) as never;
    const classifier = new OllamaClassifier({ host: 'http://localhost:11434', model: 'test-model' });
    const result = await classifier.classify({ from: 'a@b.com', subject: 's', body: 'b' });
    expect(result.category).toBe('unknown');
  });

  it('Ollama inalcanzable → lanza error claro, no falla en silencio', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) as never;
    const classifier = new OllamaClassifier({ host: 'http://localhost:11434', model: 'test-model' });
    await expect(
      classifier.classify({ from: 'a@b.com', subject: 's', body: 'b' }),
    ).rejects.toThrow(/ollama_unreachable/);
  });

  it('respuesta HTTP no-OK → lanza error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'model not found',
    }) as never;
    const classifier = new OllamaClassifier({ host: 'http://localhost:11434', model: 'ghost-model' });
    await expect(
      classifier.classify({ from: 'a@b.com', subject: 's', body: 'b' }),
    ).rejects.toThrow(/ollama_unreachable/);
  });

  it('respuesta que no es JSON válido → lanza error claro', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'esto no es json' }),
    }) as never;
    const classifier = new OllamaClassifier({ host: 'http://localhost:11434', model: 'test-model' });
    await expect(
      classifier.classify({ from: 'a@b.com', subject: 's', body: 'b' }),
    ).rejects.toThrow(/ollama_invalid_response/);
  });
});
