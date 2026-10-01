'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { MiaAccion, MiaTurno } from '@/types';
import { X, Send, Loader2, Download, ArrowRight, RotateCcw } from 'lucide-react';
import { OMark } from '@/components/icons/OMark';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  role: 'user' | 'eva';
  text: string;
  acciones?: MiaAccion[];
}

const SALUDO: ChatMessage = {
  role: 'eva',
  text: 'Hola, soy MIA. Consulto en vivo Oben Xmart y el ERP de Oben: facturas, órdenes, liquidaciones, reportes, fletes, cotizaciones y clientes. También te preparo documentos. Pregúntame, por ejemplo: "¿cuándo fue la última factura?"',
};

const SUGERENCIAS = ['¿Cuándo fue la última factura?', 'Órdenes recientes', 'Tarifa de Inland a Dallas'];

/** Turnos que se reenvían a MIA como contexto de la conversación. */
const TURNOS_PREVIOS = 20;

export function EvaWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([SALUDO]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [descargando, setDescargando] = useState<string | null>(null);  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function handleSend(preset?: string) {
    const text = (preset ?? input).trim();
    if (!text || loading) return;
    const historial: MiaTurno[] = messages
      .slice(-TURNOS_PREVIOS)
      .map((m) => ({ rol: m.role === 'user' ? 'usuario' : 'mia', texto: m.text }));
    // La OV abierta en Liquidación y Facturación viaja en la URL (?ov=).
    const ov = Number(new URLSearchParams(window.location.search).get('ov'));
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    try {
      const result = await api.evaChat(text, historial, { ruta: pathname, ...(Number.isInteger(ov) && ov > 0 ? { ov } : {}) });
      setMessages((m) => [...m, { role: 'eva', text: result.reply, acciones: result.acciones }]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessages((m) => [...m, { role: 'eva', text: msg || 'Hubo un error conectando con MIA. Intenta de nuevo.' }]);
    } finally {
      setLoading(false);
    }
  }

  async function ejecutar(accion: MiaAccion) {
    if (accion.tipo === 'navegar') {
      router.push(accion.ruta);
      return;
    }
    setDescargando(accion.etiqueta);
    try {
      const blob =
        accion.documento === 'factura_pdf'
          ? await api.downloadFacturacionPdf(accion.ov)
          : await api.downloadObenReportExcel(accion.documento, String(accion.ov));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = accion.documento === 'factura_pdf' ? `Factura-OV${accion.ov}.pdf` : `${accion.documento}-OV${accion.ov}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const porque = await motivo(err);
      setMessages((m) => [...m, { role: 'eva', text: `No pude generar "${accion.etiqueta}": ${porque}` }]);
    } finally {
      setDescargando(null);
    }
  }

  return (
    <>
      {/* Botón flotante: solo la "O" de Oben, encima de la firma "made by Paradixe". */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-12 right-5 z-50 w-14 h-14 rounded-full bg-[#F47735] hover:bg-[#E5641F] text-white shadow-lg ring-2 ring-white flex items-center justify-center transition hover:scale-105"
          title="Hablar con MIA"
          aria-label="Hablar con MIA"
        >
          <OMark className="w-7 h-7" />
        </button>
      )}

      {/* Chat panel (sin banner: la foto con su nombre abre la conversación). */}
      {open && (
        <div className="fixed bottom-12 right-5 z-50 w-[27rem] max-w-[calc(100vw-2.5rem)] h-[42rem] max-h-[calc(100vh-5rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
            <button
              onClick={() => setMessages([SALUDO])}
              disabled={loading}
              className="w-8 h-8 rounded-full bg-white/90 shadow ring-1 ring-black/5 text-gray-600 hover:text-[#C4521A] flex items-center justify-center disabled:opacity-50"
              title="Nueva conversación"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-full bg-white/90 shadow ring-1 ring-black/5 text-gray-600 hover:text-[#C4521A] flex items-center justify-center"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-12 space-y-3 bg-gray-50">
            {/* Foto con su nombre: solo al empezar; se oculta en cuanto avanza la conversación. */}
            {messages.length === 1 && (
              <div className="flex justify-center -mt-8">
                <div className="relative w-[15rem] rounded-2xl overflow-hidden shadow-md ring-1 ring-black/5 bg-orange-50">
                  <MiaAvatar src="/mia-completa.jpg" shape="rounded-none" className="w-full h-auto block" fallback={null} />
                  {/* El nombre va debajo de la foto (no encima) para no tapar el logo del polo. */}
                  <div className="px-4 py-2.5 bg-[#F47735] text-white">
                    <p className="text-xl font-bold tracking-wide leading-none">MIA</p>
                    <p className="text-xs text-white/90 mt-1">Asistente de Oben Xmart</p>
                  </div>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                {m.role === 'user' ? (
                  <div className="max-w-[88%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap bg-[#F47735] text-white">
                    {m.text}
                  </div>
                ) : (
                  <div className="max-w-[92%] rounded-xl px-3 py-2 text-sm bg-white text-gray-800 border border-gray-200 break-words">
                    <MiaMarkdown text={m.text} />
                  </div>
                )}
                {m.acciones && m.acciones.length > 0 && (
                  <div className="mt-1.5 flex flex-col gap-1.5 max-w-[88%]">
                    {m.acciones.map((a, j) => (
                      <button
                        key={j}
                        onClick={() => ejecutar(a)}
                        disabled={descargando !== null}
                        className="flex items-center gap-2 text-left text-xs font-medium px-3 py-2 rounded-lg border border-[#F47735]/40 bg-orange-50 text-[#C4521A] hover:bg-orange-100 disabled:opacity-60"
                      >
                        {descargando === a.etiqueta ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        ) : a.tipo === 'descargar' ? (
                          <Download className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        )}
                        {a.etiqueta}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {messages.length === 1 && !loading && (
              <div className="flex flex-wrap gap-1.5">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="text-xs px-2.5 py-1 rounded-full border border-gray-300 bg-white text-gray-700 hover:border-[#F47735] hover:text-[#C4521A]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin text-[#F47735]" />
                  MIA está consultando…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-gray-200 bg-white flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Escríbele a MIA..."
              disabled={loading}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 caret-[#F47735] placeholder:text-gray-500 focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none disabled:opacity-60"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="w-9 h-9 shrink-0 rounded-lg bg-[#F47735] hover:bg-[#E5641F] text-white flex items-center justify-center disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Las respuestas de MIA vienen en Markdown (negritas, listas, tablas): se
 * renderizan en vez de mostrar los asteriscos. react-markdown no interpreta
 * HTML crudo, así que el texto del modelo nunca inyecta marcado.
 */
const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  ul: ({ children }) => <ul className="my-1.5 pl-4 list-disc space-y-0.5 marker:text-[#F47735]">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 pl-5 list-decimal space-y-0.5 marker:text-gray-500">{children}</ol>,
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  h1: ({ children }) => <p className="mt-2 mb-1 first:mt-0 font-bold text-gray-900">{children}</p>,
  h2: ({ children }) => <p className="mt-2 mb-1 first:mt-0 font-bold text-gray-900">{children}</p>,
  h3: ({ children }) => <p className="mt-2 mb-1 first:mt-0 font-semibold text-gray-900">{children}</p>,
  h4: ({ children }) => <p className="mt-2 mb-1 first:mt-0 font-semibold text-gray-900">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#C4521A] underline">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="px-1 py-0.5 rounded bg-gray-100 text-[0.85em] font-mono">{children}</code>,
  pre: ({ children }) => <pre className="my-1.5 p-2 rounded bg-gray-100 overflow-x-auto text-xs">{children}</pre>,
  hr: () => <hr className="my-2 border-gray-200" />,
  blockquote: ({ children }) => <blockquote className="my-1.5 pl-2 border-l-2 border-[#F47735]/50 text-gray-600">{children}</blockquote>,
  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="px-2 py-1 text-left font-semibold bg-orange-50 border border-gray-200">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1 border border-gray-200 align-top">{children}</td>,
};

function MiaMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
}

/** Motivo legible de un error de descarga (con responseType 'blob' el JSON del backend llega como Blob). */
async function motivo(err: unknown): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const json = JSON.parse(await data.text()) as { message?: string };
      if (json.message) return json.message;
    } catch {
      /* no era JSON */
    }
  }
  const message = (data as { message?: string } | undefined)?.message;
  return message || 'intenta de nuevo o descárgalo desde su pantalla.';
}

/**
 * Foto de MIA (`public/mia.jpg`). Mientras el archivo no exista se muestra el
 * símbolo de Oben — la ventana nunca queda con una imagen rota.
 */
function MiaAvatar({
  className = '',
  fallback,
  src = '/mia.jpg',
  shape = 'rounded-full',
}: {
  className?: string;
  fallback: React.ReactNode;
  src?: string;
  shape?: string;
}) {
  const [ok, setOk] = useState(true);
  if (!ok) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="MIA" onError={() => setOk(false)} className={`${shape} object-cover ${className}`} />
  );
}
