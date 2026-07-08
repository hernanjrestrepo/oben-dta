// El backend simula el correo entrante en memoria de proceso (EmailService no
// persiste en BD) y `approveQuote`/`rejectQuote` requieren el emailId original
// para "responder" ese mensaje. No hay columna que asocie quote -> emailId,
// así que se guarda la asociación en localStorage al momento de crear la
// cotización desde el flujo de correo. Si el emailId no está disponible
// (cotización creada en otra sesión o el backend se reinició), la UI lo
// informa en vez de inventar un valor.
const STORAGE_KEY = 'oben_quote_email_map';

function readMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveQuoteEmailId(quoteId: string, emailId: string) {
  if (typeof window === 'undefined') return;
  const map = readMap();
  map[quoteId] = emailId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getQuoteEmailId(quoteId: string): string | null {
  return readMap()[quoteId] || null;
}
