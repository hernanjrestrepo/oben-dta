'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Package, Loader2, AlertCircle, Search, ShieldCheck, Mail, Send, CheckCircle2, Download } from 'lucide-react';

interface PackingLine {
  [key: string]: unknown;
}

export default function ListaEmpaquePage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sentOk, setSentOk] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  async function handleSearch() {
    if (!orderNumber.trim()) return;
    try {
      setLoading(true);
      setError('');
      setData(null);
      setSentOk(false);
      setSendError('');
      const result = await api.getPackingList(orderNumber.trim());
      setData(result);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'No se pudo consultar la lista de empaque.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail() {
    if (!orderNumber.trim()) return;
    try {
      setSending(true);
      setSendError('');
      setSentOk(false);
      // Si no se escribe correo, el backend usa la lista de distribución
      // asociada a "packing_list" (ver /distribucion) — si tampoco hay
      // ninguna configurada, rechaza con un mensaje claro, no inventa nada.
      const result = await api.sendPackingListEmail(orderNumber.trim(), emailTo.trim() || undefined);
      setSentOk(true);
      setEmailTo(result.to);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSendError(msg || 'No se pudo enviar el correo.');
    } finally {
      setSending(false);
    }
  }

  async function handleDownload() {
    if (!orderNumber.trim()) return;
    try {
      setDownloading(true);
      setDownloadError('');
      const blob = await api.downloadPackingListExcel(orderNumber.trim());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Lista_de_Empaque-OV${orderNumber.trim()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDownloadError(msg || 'No se pudo descargar el Excel.');
    } finally {
      setDownloading(false);
    }
  }

  const lines = (data?.DetailedPackingList as PackingLine[] | undefined) ?? [];
  const columns = lines.length > 0 ? Object.keys(lines[0]).filter((k) => k !== 'PO') : [];
  const summaryFields: Array<[string, string]> = [
    ['Cliente', 'Cliente'],
    ['Documento', 'Documento'],
    ['Numero', 'Número'],
    ['Fecha', 'Fecha'],
    ['Almacen', 'Almacén'],
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="w-6 h-6 text-[#F47735]" />
          Lista de Empaque
        </h1>
        <p className="text-gray-500 mt-1">
          Consulta en vivo al ERP real de Oben — no se generan datos localmente, se trae la información real del sistema de producción.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número de orden de venta (Oben)
            </label>
            <div className="flex gap-2">
              <input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Ej: 10794"
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none text-gray-900"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !orderNumber.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Consultar
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Este número corresponde a una orden que ya existe en el sistema de Oben (no una orden interna de Oben Xmart) — el vínculo entre ambos sistemas está pendiente de definir con Oben.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {data && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-green-700">
                <ShieldCheck className="w-5 h-5" />
                <p className="text-sm font-semibold">Datos reales de Oben — {lines.length} línea{lines.length !== 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition disabled:opacity-50 text-sm"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Descargar Excel
              </button>
            </div>
            {downloadError && (
              <p className="mb-4 text-sm text-red-700 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> {downloadError}
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {summaryFields.map(([key, label]) => (
                <div key={key}>
                  <p className="text-xs text-gray-500 uppercase">{label}</p>
                  <p className="font-medium text-gray-900 text-sm truncate">{String(data[key] ?? '—')}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-5 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-1">Enviar por correo</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={emailTo}
                    onChange={(e) => { setEmailTo(e.target.value); setSentOk(false); setSendError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendEmail()}
                    placeholder="correo@destino.com (vacío = usa la lista de distribución asociada)"
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none text-gray-900 text-sm"
                  />
                </div>
                <button
                  onClick={handleSendEmail}
                  disabled={sending}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-50 text-sm"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar por correo
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Déjalo en blanco para usar la lista de distribución asociada a &quot;packing_list&quot; (configúrala en Listas de Distribución).
              </p>
              {sentOk && (
                <p className="mt-2 text-sm text-green-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Enviado a {emailTo}
                </p>
              )}
              {sendError && (
                <p className="mt-2 text-sm text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> {sendError}
                </p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    {columns.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((line, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {columns.map((c) => (
                        <td key={c} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                          {String(line[c] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
