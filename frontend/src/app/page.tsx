"use client";

import { useState, useEffect } from "react";

const API = "http://127.0.0.1:3004";

interface QuoteItem {
  id: string;
  product: { name: string; sku: string };
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Quote {
  id: string;
  quoteNumber: string;
  status: string;
  client: { name: string; email: string };
  items: QuoteItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  pdfUrl?: string;
  paymentLink?: string;
  invoiceNumber?: string;
  createdAt: string;
  notes?: string;
}

const statusLabels: Record<string, string> = {
  RECEIVED: "Email Recibido", PARSING: "IA Analizando", QUOTED: "Cotización Generada",
  SENT: "PDF Enviado al Cliente", APPROVED: "Aprobada por Cliente", ORDERED: "Orden Creada",
  PAYMENT_PENDING: "Link de Pago Enviado", PAID: "Pago Verificado",
  IN_PRODUCTION: "En Producción", READY_FOR_DELIVERY: "Lista para Entrega",
  DELIVERED: "Entregada", REJECTED: "Rechazada",
};

const statusColors: Record<string, string> = {
  RECEIVED: "bg-blue-500",
  PARSING: "bg-indigo-500",
  QUOTED: "bg-cyan-500",
  SENT: "bg-teal-500",
  APPROVED: "bg-emerald-500",
  ORDERED: "bg-green-500",
  PAYMENT_PENDING: "bg-amber-500",
  PAID: "bg-lime-500",
  IN_PRODUCTION: "bg-orange-500",
  READY_FOR_DELIVERY: "bg-violet-500",
  DELIVERED: "bg-gray-500",
  REJECTED: "bg-red-500",
};

const flowSteps = [
  { key: "RECEIVED", label: "Email recibido", auto: true, desc: "La IA detecta un nuevo email del comprador" },
  { key: "PARSING", label: "IA analizando", auto: true, desc: "Parser extrae productos, cantidades y cliente" },
  { key: "QUOTED", label: "Cotización generada", auto: true, desc: "La IA calcula precios, IVA y totales" },
  { key: "SENT", label: "PDF enviado", auto: true, desc: "Documento de cotización generado y enviado al cliente" },
  { key: "APPROVED", label: "Cliente aprueba", auto: false, desc: "El comprador responde el email aprobando la cotización" },
  { key: "ORDERED", label: "Orden creada", auto: true, desc: "Se crea la orden de compra interna" },
  { key: "PAYMENT_PENDING", label: "Link de pago enviado", auto: true, desc: "La IA genera pasarela de pago y la envía al cliente" },
  { key: "PAID", label: "Pago verificado", auto: false, desc: "El comprador realiza el pago" },
  { key: "IN_PRODUCTION", label: "En producción", auto: true, desc: "Se asigna a producción, se descuenta inventario" },
  { key: "READY_FOR_DELIVERY", label: "Lista para entrega", auto: true, desc: "Empaque y preparación de envío" },
  { key: "DELIVERED", label: "Entregada", auto: true, desc: "Pedido entregado al cliente" },
];

const statusFlowIndex: Record<string, number> = {
  RECEIVED: 0, PARSING: 1, QUOTED: 2, SENT: 3, APPROVED: 4, ORDERED: 5,
  PAYMENT_PENDING: 6, PAID: 7, IN_PRODUCTION: 8, READY_FOR_DELIVERY: 9, DELIVERED: 10, REJECTED: -1,
};

export default function Home() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog((prev) => [msg, ...prev].slice(0, 50));

  const fetchQuotes = async () => {
    try {
      const res = await fetch(`${API}/quotes`);
      const data = await res.json();
      setQuotes(data);
    } catch {
      addLog("Error cargando cotizaciones");
    }
  };

  useEffect(() => {
    fetchQuotes();
    const iv = setInterval(fetchQuotes, 3000);
    return () => clearInterval(iv);
  }, []);

  const simulatePayment = async (quote: Quote) => {
    setLoading(true);
    try {
      await fetch(`${API}/quotes/${quote.id}/pay`, { method: "POST" });
      addLog(`Pago recibido para ${quote.quoteNumber}`);
      await fetchQuotes();
    } catch (e) {
      addLog(`Error pago: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const openPdf = (quote: Quote) => {
    window.open(`${API}/quotes/${quote.id}/pdf`, "_blank");
  };

  const currentStepIndex = (status: string) => statusFlowIndex[status] ?? -1;

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#333333]">
      <header className="bg-[#003366] text-white py-5 px-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <span className="text-[#003366] font-bold text-lg">O</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">OBEN GROUP</h1>
              <p className="text-xs text-blue-200">DTA — Automatización B2B con IA</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-blue-200">Estado del Sistema</div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              <span className="text-sm font-semibold">IA Activa</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Empty state helper */}
        {quotes.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-4xl mb-4">📧</div>
            <h2 className="text-lg font-bold text-[#003366] mb-2">No hay órdenes activas</h2>
            <p className="text-sm text-gray-500 mb-4">
              Simula un email de comprador desde terminal para ver la IA en acción.
            </p>
            <code className="text-xs bg-gray-900 text-green-300 px-4 py-3 rounded-lg block max-w-xl mx-auto font-mono">
              bash scripts/flow-simulator.sh
            </code>
          </div>
        )}

        {/* Orders with visual timeline */}
        {quotes.map((q) => {
          const currentIdx = currentStepIndex(q.status);
          return (
            <div key={q.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-[#003366] to-[#004080]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-white text-lg">{q.quoteNumber}</span>
                    <span className={`text-xs px-3 py-1 rounded-full text-white font-semibold ${statusColors[q.status] || "bg-gray-500"}`}>
                      {statusLabels[q.status] || q.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold text-xl">${Number(q.total).toLocaleString("es-CO")} COP</div>
                    <div className="text-blue-200 text-xs">{q.client?.name} — {q.client?.email}</div>
                  </div>
                </div>
              </div>

              {/* Visual Timeline */}
              <div className="px-6 py-6">
                <h3 className="text-sm font-semibold text-[#003366] mb-4 uppercase tracking-wider">Flujo Automatizado por IA</h3>
                <div className="relative">
                  {/* Progress line */}
                  <div className="absolute top-4 left-0 right-0 h-1 bg-gray-200 rounded-full">
                    <div
                      className="h-full bg-[#009966] rounded-full transition-all duration-1000"
                      style={{ width: `${Math.max(0, Math.min(100, ((currentIdx + 1) / flowSteps.length) * 100))}%` }}
                    />
                  </div>

                  {/* Steps */}
                  <div className="grid grid-cols-11 gap-1 relative z-10">
                    {flowSteps.map((step, idx) => {
                      const isDone = idx <= currentIdx && q.status !== "REJECTED";
                      const isCurrent = idx === currentIdx;
                      return (
                        <div key={step.key} className="flex flex-col items-center text-center">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-500 ${
                              isDone
                                ? "bg-[#009966] border-[#009966] text-white shadow-lg shadow-green-200"
                                : isCurrent
                                ? "bg-white border-[#FF6600] text-[#FF6600] animate-bounce"
                                : "bg-gray-100 border-gray-300 text-gray-400"
                            }`}
                          >
                            {isDone ? "✓" : idx + 1}
                          </div>
                          <div className={`mt-2 text-[10px] leading-tight font-medium ${isDone ? "text-[#009966]" : isCurrent ? "text-[#FF6600]" : "text-gray-400"}`}>
                            {step.label}
                          </div>
                          {isCurrent && (
                            <div className="mt-1 text-[10px] text-gray-500 max-w-[80px] leading-tight">
                              {step.desc}
                            </div>
                          )}
                          {!step.auto && idx === currentIdx && (
                            <div className="mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] rounded font-semibold">
                              Esperando comprador
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Items de la Cotización</h4>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div className="font-semibold text-gray-600">Producto</div>
                  <div className="font-semibold text-gray-600">SKU</div>
                  <div className="font-semibold text-gray-600">Cant.</div>
                  <div className="font-semibold text-gray-600">Total</div>
                  {q.items?.map((item) => (
                    <>
                      <div className="text-gray-700">{item.product?.name}</div>
                      <div className="font-mono text-gray-600 text-xs">{item.product?.sku}</div>
                      <div className="text-gray-700">{item.quantity}</div>
                      <div className="font-medium">${Number(item.totalPrice).toLocaleString("es-CO")}</div>
                    </>
                  ))}
                </div>
                <div className="mt-3 flex justify-between text-sm border-t border-gray-200 pt-2">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">${Number(q.subtotal).toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">IVA (19%)</span>
                  <span className="font-medium">${Number(q.taxAmount).toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-[#003366]">
                  <span>Total</span>
                  <span>${Number(q.total).toLocaleString("es-CO")}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {q.pdfUrl && (
                    <button
                      onClick={() => openPdf(q)}
                      className="flex items-center gap-2 bg-white border border-[#003366] text-[#003366] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#003366] hover:text-white transition"
                    >
                      <span>📄</span> Ver PDF de Cotización
                    </button>
                  )}
                  {q.paymentLink && (
                    <div className="text-sm text-gray-500">
                      Link enviado al cliente: <span className="font-mono text-[#FF6600]">{q.paymentLink}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {q.status === "PAYMENT_PENDING" && (
                    <button
                      onClick={() => simulatePayment(q)}
                      disabled={loading}
                      className="bg-[#FF6600] hover:bg-[#cc5200] text-white px-5 py-2 rounded-lg font-semibold transition disabled:opacity-50 flex items-center gap-2"
                    >
                      <span>💳</span> Simular Pago del Cliente
                    </button>
                  )}
                  {q.status === "PAID" && (
                    <span className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg font-semibold flex items-center gap-2">
                      <span>✓</span> PAGO VERIFICADO — En producción
                    </span>
                  )}
                  {q.invoiceNumber && (
                    <span className="bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-semibold">
                      Factura: {q.invoiceNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* Notes */}
              {q.notes && (
                <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 text-sm text-amber-800">
                  <span className="font-semibold">Nota del sistema:</span> {q.notes}
                </div>
              )}
            </div>
          );
        })}

        {/* Log */}
        {quotes.length > 0 && (
          <div className="bg-[#1a1a2e] rounded-xl p-4 shadow-md border border-gray-700">
            <h3 className="text-green-400 text-sm font-semibold mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Log de la IA
            </h3>
            <div className="bg-black/40 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs space-y-1">
              {log.length === 0 && <div className="text-gray-500 italic">Esperando actividad...</div>}
              {log.map((l, i) => (
                <div key={i} className="text-green-300">
                  <span className="text-gray-500">[{new Date().toLocaleTimeString("es-CO")}]</span> {l}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="bg-[#003366] text-white py-6 mt-12">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-blue-200">
          <p className="font-semibold">Oben Group — Digitalización Total Autónoma</p>
          <p className="text-xs mt-1 opacity-70">
            La IA automatiza: Email → Parser → Cotización → PDF → Aprobación → Pago → Producción → Entrega
          </p>
        </div>
      </footer>
    </div>
  );
}


