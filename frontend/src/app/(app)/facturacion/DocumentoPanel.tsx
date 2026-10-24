'use client';

import { useT } from '@/i18n/idioma';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { FacturacionDraft, FacturacionInput } from '@/types';
import { AlertCircle, ArrowRight, Download, Eye, FileText, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardHeader, Faltantes, Field, Listo, SimuladoBadge, btnPrimary, btnSecondary, inputCls, kg, num2, unit, usd } from './ui';

const FUENTE: Record<NonNullable<FacturacionDraft['direccionFuente']>, { label: string; cls: string }> = {
  maestro_clientes: { label: 'Maestro de clientes', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  oben_erp: { label: 'ERP Oben', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  oben_plus: { label: 'Oben+ · SIMULADO', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  digitada: { label: 'Digitada', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
};

export const TIPO_LABEL: Record<NonNullable<FacturacionDraft['kind']>, string> = {
  exportacion: 'Exportación',
  nacional_completo: 'Nacional completo',
  nacional_parcial: 'Nacional parcial',
};

/**
 * Documento de facturación: datos reales del pedido (ERP de Oben) + lo que
 * confirma el usuario. La vista previa es el mismo PDF que se adjunta al
 * enviar; descargarla nunca emite la factura electrónica.
 */
export function DocumentoPanel({
  draft,
  input,
  onInput,
  actualizando,
  onContinuar,
}: {
  draft: FacturacionDraft;
  input: FacturacionInput;
  onInput: (patch: Partial<FacturacionInput>) => void;
  actualizando: boolean;
  onContinuar: () => void;
}) {
  const t = useT();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFirma, setPdfFirma] = useState('');
  const [cargando, setCargando] = useState<'preview' | 'download' | null>(null);
  const [error, setError] = useState('');
  const firma = JSON.stringify(input);
  const esNacional = draft.kind === 'nacional_completo' || draft.kind === 'nacional_parcial';
  // Clientes que facturan con la TRM de su orden de compra (Hernán, 21-oct). Misma regla que el backend.
  const trmPropia = /\bPPC\s*FLEX/i.test(draft.cliente ?? '');

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  async function pdf(modo: 'preview' | 'download') {
    try {
      setCargando(modo);
      setError('');
      const blob = await api.downloadFacturacionPdf(draft.numberOrderSales, input);
      const url = URL.createObjectURL(blob);
      if (modo === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Factura_Borrador-OV${draft.numberOrderSales}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        setPdfUrl(url);
        setPdfFirma(firma);
      }
    } catch (err) {
      setError(extractMessage(err, 'No se pudo generar el PDF.'));
    } finally {
      setCargando(null);
    }
  }

  const direccion = input.direccionEntrega ?? draft.direccionEntrega ?? '';
  const fuente = input.direccionEntrega !== undefined ? 'digitada' : draft.direccionFuente;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <Card className="xl:col-span-2">
          <CardHeader title={t('Datos del documento')} subtitle={t('Lo que no viene del ERP lo confirma quien factura. Nada se inventa.')} />
          <div className="p-4 space-y-3">
            <Field
              label={
                <>
                  {t('Dirección de entrega')}{draft.kind === 'exportacion' && <span className="text-red-500"> *</span>}
                  {fuente && (
                    <span className={`ml-1.5 inline-block px-1.5 py-px rounded border text-[10px] font-medium ${FUENTE[fuente].cls}`}>{FUENTE[fuente].label}</span>
                  )}
                </>
              }
            >
              <textarea
                value={direccion}
                onChange={(e) => onInput({ direccionEntrega: e.target.value })}
                rows={2}
                className={`${inputCls} w-full resize-none`}
                placeholder={draft.kind === 'exportacion' ? 'Requerida para exportación' : 'Opcional en pedidos nacionales'}
              />
            </Field>
            {esNacional && (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('Despacho parcial')}</p>
                  <p className="text-[11px] text-gray-500">{t('Nacional parcial vs. completo (lo indica quien factura).')}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={!!input.parcial}
                  onClick={() => onInput({ parcial: !input.parcial })}
                  className={`relative w-11 h-6 rounded-full transition ${input.parcial ? 'bg-[#F47735]' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${input.parcial ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            )}
            <Field label={t('TRM de la orden de compra')}>
              <input
                type="number"
                inputMode="decimal"
                min={1000}
                max={20000}
                step="0.01"
                value={input.trmOrdenCompra ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? undefined : Number(e.target.value);
                  onInput({ trmOrdenCompra: v !== undefined && Number.isFinite(v) ? v : undefined });
                }}
                className={`${inputCls} w-full`}
                placeholder={trmPropia ? 'Obligatoria: la que trae la orden de compra' : 'Vacía = TRM oficial del día'}
              />
              <p className={`mt-1 text-[11px] ${trmPropia && !input.trmOrdenCompra ? 'text-amber-700' : 'text-gray-500'}`}>
                {trmPropia
                  ? `${draft.cliente} factura con su propia TRM (la de su orden de compra${draft.ordenCompra ? ` ${draft.ordenCompra}` : ''}), nunca con la oficial.`
                  : 'Solo si el cliente pactó su propia TRM en la orden de compra; si no, se usa la oficial del día.'}
              </p>
            </Field>
            <Field label={t('Observaciones')}>
              <textarea value={input.observaciones ?? ''} onChange={(e) => onInput({ observaciones: e.target.value })} rows={3} className={`${inputCls} w-full resize-none`} />
            </Field>
            <Field label={t('Información comercial')}>
              <textarea value={input.infoComercial ?? ''} onChange={(e) => onInput({ infoComercial: e.target.value })} rows={3} className={`${inputCls} w-full resize-none`} />
            </Field>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            icon={<FileText className="w-4 h-4 text-[#F47735]" />}
            title={t('Detalle a facturar')}
            subtitle={`Precios y kilos de la Proforma ${draft.proforma ?? '—'} en el ERP de Oben`}
            right={
              <div className="flex items-center gap-2">
                {actualizando && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                {draft.simulated && <SimuladoBadge items={draft.simulatedFields} />}
              </div>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-800">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-4 py-2 text-left font-semibold">{t('Película')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('Kilos')}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t('Precio USD/kg')}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t('Valor (USD)')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {draft.lines.map((l) => (
                  <tr key={l.codSecLineFilm}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{l.tipoPelicula}</p>
                      <p className="text-[10px] text-gray-400">{t('Línea')}{' '}{l.codSecLineFilm}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{kg(l.kilosTotal)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{unit(l.precio)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{num2(l.valorLinea)}</td>
                  </tr>
                ))}
                {draft.lines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">
                      {t('Sin líneas: Oben no devolvió precios para esta proforma.')}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-orange-50/60">
                  <td className="px-4 py-3 font-semibold text-gray-900">{t('Total')}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold">{kg(draft.totalKilos)}</td>
                  <td />
                  <td className="px-4 py-3 text-right tabular-nums text-lg font-bold text-[#C4521A]">{usd(draft.totalValor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-4 space-y-3">
          {draft.missing.length > 0 ? <Faltantes items={draft.missing} /> : <Listo>{t('Documento listo: se puede revisar, descargar y enviar.')}</Listo>}
          {error && (
            <p className="text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnSecondary} onClick={() => void pdf('preview')} disabled={!draft.readyToGenerate || !!cargando}>
              {cargando === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {pdfUrl ? 'Actualizar vista previa' : 'Vista previa del PDF'}
            </button>
            <button className={btnSecondary} onClick={() => void pdf('download')} disabled={!draft.readyToGenerate || !!cargando}>
              {cargando === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {t('Descargar PDF')}
            </button>
            <button className={`${btnPrimary} ml-auto`} onClick={onContinuar} disabled={!draft.readyToGenerate}>
              {t('Continuar al envío')}{' '}<ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {pdfUrl && (
          <div className="border-t border-gray-100 p-4">
            {pdfFirma !== firma && (
              <button onClick={() => void pdf('preview')} className="mb-3 w-full text-left rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center gap-2 hover:bg-amber-100">
                <RefreshCw className="w-3.5 h-3.5" />{' '}{t('Cambiaste datos del documento: la vista previa está desactualizada. Clic para actualizarla.')}
              </button>
            )}
            <iframe title={`Documento de facturación OV ${draft.numberOrderSales}`} src={pdfUrl} className="w-full h-[78vh] rounded-lg border border-gray-200 bg-gray-50" />
          </div>
        )}
      </Card>
    </div>
  );
}
