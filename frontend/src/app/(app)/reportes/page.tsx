'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { FileSpreadsheet, Loader2, AlertCircle, Search, ShieldCheck, Mail, Send, CheckCircle2, Package, Download } from 'lucide-react';

interface ReportType {
  key: string;
  label: string;
}

export default function ReportesPage() {
  const [types, setTypes] = useState<ReportType[]>([]);
  const [reportKey, setReportKey] = useState('');
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

  const [packageEmailTo, setPackageEmailTo] = useState('');
  const [sendingPackage, setSendingPackage] = useState(false);
  const [packageResult, setPackageResult] = useState<{ to: string; included: string[]; failed: { key: string; error: string }[] } | null>(null);
  const [packageError, setPackageError] = useState('');

  useEffect(() => {
    api.getObenReportTypes().then((list) => {
      setTypes(list);
      if (list.length > 0) setReportKey(list[0].key);
    }).catch(() => setError('No se pudo cargar la lista de reportes disponibles.'));
  }, []);

  async function handleSearch() {
    if (!orderNumber.trim() || !reportKey) return;
    try {
      setLoading(true);
      setError('');
      setData(null);
      setSentOk(false);
      setSendError('');
      const result = await api.getObenReport(reportKey, orderNumber.trim());
      setData(result);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'No se pudo consultar el reporte.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail() {
    if (!orderNumber.trim() || !reportKey) return;
    try {
      setSending(true);
      setSendError('');
      setSentOk(false);
      const result = await api.sendObenReportEmail(reportKey, orderNumber.trim(), emailTo.trim() || undefined);
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
    if (!orderNumber.trim() || !reportKey) return;
    try {
      setDownloading(true);
      setDownloadError('');
      const blob = await api.downloadObenReportExcel(reportKey, orderNumber.trim());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentLabel.replace(/\s+/g, '_')}-OV${orderNumber.trim()}.xlsx`;
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

  async function handleSendPackage() {
    if (!orderNumber.trim()) return;
    try {
      setSendingPackage(true);
      setPackageError('');
      setPackageResult(null);
      const result = await api.sendObenReportPackage(orderNumber.trim(), packageEmailTo.trim() || undefined);
      setPackageResult({ to: result.to, included: result.included, failed: result.failed });
      setPackageEmailTo(result.to);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPackageError(msg || 'No se pudo enviar el paquete de documentos.');
    } finally {
      setSendingPackage(false);
    }
  }

  const currentLabel = types.find((t) => t.key === reportKey)?.label ?? '';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-[#F47735]" />
          Reportes Oben
        </h1>
        <p className="text-gray-500 mt-1">
          Consulta en vivo al ERP real de Oben (consumo de materiales, empaque, chequeos) y envío por correo en Excel — no se generan datos localmente.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border-2 border-[#F47735]/30 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Package className="w-5 h-5 text-[#F47735]" />
          <h2 className="font-semibold text-gray-900">Enviar paquete completo</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Junta en un solo correo todos los reportes que se puedan consultar para esta orden — el conjunto de documentos que se arma al insertar el último pallet.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              value={packageEmailTo}
              onChange={(e) => { setPackageEmailTo(e.target.value); setPackageResult(null); setPackageError(''); }}
              placeholder="correo@destino.com (vacío = lista de distribución de 'document_package')"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none text-gray-900 text-sm"
            />
          </div>
          <button
            onClick={handleSendPackage}
            disabled={sendingPackage || !orderNumber.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-50 text-sm whitespace-nowrap"
          >
            {sendingPackage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Enviar paquete completo
          </button>
        </div>
        {!orderNumber.trim() && (
          <p className="mt-2 text-xs text-gray-400">Escribe primero el número de orden abajo.</p>
        )}
        {packageResult && (
          <div className="mt-3 text-sm">
            <p className="text-green-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Enviado a {packageResult.to} — {packageResult.included.length} reporte{packageResult.included.length !== 1 ? 's' : ''} incluido{packageResult.included.length !== 1 ? 's' : ''}
            </p>
            {packageResult.failed.length > 0 && (
              <p className="text-amber-700 mt-1 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                No se pudieron incluir: {packageResult.failed.map((f) => f.key).join(', ')}
              </p>
            )}
          </div>
        )}
        {packageError && (
          <p className="mt-3 text-sm text-red-700 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> {packageError}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reporte</label>
            <select
              value={reportKey}
              onChange={(e) => setReportKey(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none text-gray-900"
            >
              {types.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número de orden de venta (Oben)</label>
            <input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Ej: 10794"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none text-gray-900"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !orderNumber.trim() || !reportKey}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Consultar
          </button>
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
                <p className="text-sm font-semibold">{currentLabel} — datos reales de Oben</p>
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

            <div className="mt-1 pt-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">Enviar por correo (Excel)</label>
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
                Déjalo en blanco para usar la lista de distribución asociada a &quot;{reportKey}&quot; (configúrala en Listas de Distribución).
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

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <p className="text-xs font-medium text-gray-500 uppercase mb-3">Vista previa (JSON crudo de Oben)</p>
            <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
