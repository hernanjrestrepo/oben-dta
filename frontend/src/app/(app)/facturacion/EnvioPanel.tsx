'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { FacturacionDraft, FacturacionHistorial, FacturacionInput, FacturacionSendResult } from '@/types';
import { AlertCircle, CheckCircle2, Copy, FileText, History, Loader2, Mail, Paperclip, Receipt, Send, ShieldAlert, X, XCircle } from 'lucide-react';
import { Card, CardHeader, EmailChips, Faltantes, btnPrimary, btnSecondary, fecha } from './ui';

const ULTIMOS_KEY = 'oben-xmart:facturacion:destinatarios';

function leerUltimos(): { to: string[]; cc: string[] } | null {
  try {
    const raw = localStorage.getItem(ULTIMOS_KEY);
    const v = raw ? (JSON.parse(raw) as { to?: unknown; cc?: unknown }) : null;
    if (!v || !Array.isArray(v.to) || v.to.length === 0) return null;
    return { to: v.to.filter((x): x is string => typeof x === 'string'), cc: Array.isArray(v.cc) ? v.cc.filter((x): x is string => typeof x === 'string') : [] };
  } catch {
    return null;
  }
}

function guardarUltimos(to: string[], cc: string[]) {
  try {
    localStorage.setItem(ULTIMOS_KEY, JSON.stringify({ to, cc }));
  } catch {
    /* sin almacenamiento local: no pasa nada */
  }
}

/**
 * Envío a Facturación/COMEX: un correo REAL con el PDF adjunto. La factura
 * electrónica se emite una sola vez por orden (reenviar reutiliza el mismo
 * CUFE). Los destinatarios se precargan de la lista de distribución
 * "facturacion" y se pueden ajustar solo para este envío.
 */
export function EnvioPanel({
  draft,
  input,
  historial,
  onEnviado,
}: {
  draft: FacturacionDraft;
  input: FacturacionInput;
  historial: FacturacionHistorial | null;
  onEnviado: () => void;
}) {
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [origenDest, setOrigenDest] = useState<'lista' | 'ultimos' | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<FacturacionSendResult | null>(null);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  useEffect(() => {
    const desdeUltimos = () => {
      const u = leerUltimos();
      if (u) {
        setTo(u.to);
        setCc(u.cc);
        setOrigenDest('ultimos');
      }
    };
    api
      .getFacturacionDestinatarios()
      .then((d) => {
        if (d.to.length) {
          setTo(d.to);
          setCc(d.cc);
          setOrigenDest('lista');
        } else desdeUltimos();
      })
      .catch(desdeUltimos);
  }, []);

  const n = draft.numberOrderSales;
  const envioPrevio = historial?.envios.find((e) => e.ok) ?? null;
  const factura = historial?.facturaElectronica ?? null;
  const puedeEnviar = draft.readyToGenerate && to.length > 0 && !enviando;

  async function enviar() {
    try {
      setEnviando(true);
      setError('');
      const r = await api.sendFacturacion(n, input, { to, cc, force: !!envioPrevio });
      setResultado(r);
      guardarUltimos(to, cc);
      setConfirmar(false);
      onEnviado();
    } catch (err) {
      setError(extractMessage(err, 'No se pudo enviar el documento de facturación.'));
      setConfirmar(false);
    } finally {
      setEnviando(false);
    }
  }

  /**
   * Abre el PDF adjunto en una pestaña nueva. La pestaña se abre en el mismo
   * clic (antes de esperar al servidor): si se abre después del await, el
   * navegador la bloquea como ventana emergente.
   */
  async function abrirAdjunto() {
    if (abriendo) return;
    const ventana = window.open('', '_blank');
    setAbriendo(true);
    setError('');
    try {
      const blob = await api.downloadFacturacionPdf(n, input);
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      if (ventana) ventana.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      ventana?.close();
      setError(extractMessage(err, 'No se pudo abrir el PDF.'));
    } finally {
      setAbriendo(false);
    }
  }

  const adjunto = (nombre: string, clase = '') => (
    <button
      type="button"
      onClick={() => void abrirAdjunto()}
      disabled={abriendo}
      title="Abrir el PDF"
      className={`inline-flex items-center gap-1.5 text-[#C4521A] hover:underline disabled:opacity-60 disabled:no-underline ${clase}`}
    >
      {abriendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />} {nombre}
    </button>
  );

  async function copiarCufe(cufe: string) {
    try {
      await navigator.clipboard.writeText(cufe);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* portapapeles no disponible */
    }
  }

  if (resultado) {
    return (
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-50 to-white p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center animate-[pulse_1.2s_ease-out_1]">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
          <h3 className="mt-4 text-xl font-bold text-gray-900">Documento de facturación enviado</h3>
          <p className="mt-1 text-sm text-gray-600">
            Orden {n} · {draft.cliente}
          </p>
          <div className="mt-5 inline-flex flex-col items-stretch gap-2 text-left text-sm max-w-xl w-full">
            <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Enviado a</p>
              <p className="text-gray-900">{resultado.to.join(', ')}</p>
              {resultado.cc.length > 0 && <p className="text-gray-600 text-xs mt-0.5">CC: {resultado.cc.join(', ')}</p>}
            </div>
            <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 flex items-center gap-2">
                Factura electrónica · CUFE
                {resultado.cufeSimulado && <span className="px-1.5 py-px rounded bg-purple-100 text-purple-800 font-semibold normal-case">SIMULADO · sin validez fiscal</span>}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-xs text-gray-800 break-all flex-1">{resultado.cufe}</code>
                <button onClick={() => void copiarCufe(resultado.cufe)} className="p-1.5 rounded hover:bg-gray-100 shrink-0" title="Copiar CUFE">
                  {copiado ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
                </button>
              </div>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 px-4 py-3 flex items-center gap-2 text-gray-700">
              {adjunto(resultado.filename)}
            </div>
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>
          <div className="mt-6">
            <button className={btnSecondary} onClick={() => setResultado(null)}>
              Volver al envío
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
      <div className="xl:col-span-3 space-y-5">
        <Card>
          <CardHeader
            icon={<Mail className="w-4 h-4 text-[#F47735]" />}
            title="Destinatarios"
            subtitle={
              origenDest === 'lista'
                ? 'Precargados desde la lista de distribución "facturacion". Los cambios aplican solo a este envío.'
                : origenDest === 'ultimos'
                  ? 'Precargados con los del último envío desde este equipo.'
                  : 'Escribe los correos y presiona Enter.'
            }
          />
          <div className="p-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Para</p>
              <EmailChips value={to} onChange={setTo} placeholder="correo@obengroup.com" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Con copia</p>
              <EmailChips value={cc} onChange={setCc} placeholder="Opcional" />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<FileText className="w-4 h-4 text-[#F47735]" />} title="Qué se envía" />
          <dl className="p-4 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-gray-500">Asunto</dt>
            <dd className="text-gray-900">Borrador de Facturación — Orden {n}</dd>
            <dt className="text-gray-500">Adjunto</dt>
            <dd>{adjunto(`Factura_Borrador-OV${n}.pdf`)}</dd>
            <dt className="text-gray-500">Factura electrónica</dt>
            <dd className="text-gray-900">
              {factura ? (
                <>
                  Ya emitida · CUFE <code className="text-xs">{factura.cufe.slice(0, 16)}…</code>
                  {factura.simulated && <span className="ml-1.5 text-[10px] font-semibold text-purple-700">SIMULADO</span>}
                  <span className="block text-xs text-gray-500">Reenviar reutiliza el mismo CUFE: nunca se emite dos veces.</span>
                </>
              ) : (
                <>
                  Se emite al enviar, una sola vez por orden.
                  <span className="block text-xs text-gray-500">
                    Mientras no esté conectado el proveedor de facturación real, el CUFE es SIMULADO (sin validez fiscal) y el correo lo indica.
                  </span>
                </>
              )}
            </dd>
          </dl>
        </Card>
      </div>

      <div className="xl:col-span-2 space-y-5">
        <Card>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-[#F47735]" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Orden {n}</p>
                <p className="text-xs text-gray-500">{draft.cliente}</p>
              </div>
            </div>
            {!draft.readyToGenerate && <Faltantes items={draft.missing} titulo="El documento aún no está listo" />}
            {envioPrevio && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  Ya se envió el {fecha(envioPrevio.fecha)} a {[...envioPrevio.to, ...envioPrevio.cc].join(', ')}. Enviar de nuevo es un reenvío.
                </span>
              </div>
            )}
            {error && (
              <p className="text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
              </p>
            )}
            <button className={`${btnPrimary} w-full py-3 text-base`} onClick={() => setConfirmar(true)} disabled={!puedeEnviar}>
              <Send className="w-4 h-4" /> {envioPrevio ? 'Reenviar a Facturación' : 'Enviar a Facturación'}
            </button>
            {to.length === 0 && <p className="text-[11px] text-gray-500 text-center">Agrega al menos un destinatario.</p>}
          </div>
        </Card>

        {historial && historial.envios.length > 0 && (
          <Card>
            <CardHeader icon={<History className="w-4 h-4 text-gray-400" />} title="Historial de envíos" />
            <ul className="divide-y divide-gray-100">
              {historial.envios.map((e) => (
                <li key={e.fecha} className="px-4 py-2.5 text-xs flex gap-2">
                  {e.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-gray-900">{fecha(e.fecha)}</p>
                    <p className="text-gray-500 truncate">{[...e.to, ...e.cc].join(', ')}</p>
                    {!e.ok && e.error && <p className="text-red-600">{e.error}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4" onClick={() => !enviando && setConfirmar(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">{envioPrevio ? 'Reenviar' : 'Enviar'} documento de facturación</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Orden {n} · {draft.cliente}
                </p>
              </div>
              <button onClick={() => setConfirmar(false)} disabled={enviando} className="p-1 rounded hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <p className="text-gray-700">Se enviará un correo real con el PDF adjunto a:</p>
              <ul className="space-y-1">
                {to.map((e) => (
                  <li key={e} className="flex items-center gap-2 text-gray-900">
                    <Mail className="w-3.5 h-3.5 text-[#F47735]" /> {e}
                  </li>
                ))}
                {cc.map((e) => (
                  <li key={e} className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400" /> {e} <span className="text-[10px] text-gray-400">CC</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button className={btnSecondary} onClick={() => setConfirmar(false)} disabled={enviando}>
                Cancelar
              </button>
              <button className={btnPrimary} onClick={() => void enviar()} disabled={enviando}>
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {enviando ? 'Enviando…' : 'Enviar ahora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
