'use client';

import { useT } from '@/i18n/idioma';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { CasoEstado, CasoLinea, ComercialCaso, ProformaOben } from '@/types';
import { AlertCircle, AlertTriangle, Building2, Check, CheckCircle2, Download, FlaskConical, Loader2, Send, ShieldAlert, X } from 'lucide-react';
import { ACCION_LABEL, EstadoBadge, SimuladoBadge, btnPrimary, btnSecondary, fecha, inputCls } from './comun';

/** Etapas del caso, en orden, para la línea de progreso. */
const PASOS: Array<{ estados: CasoEstado[]; titulo: string }> = [
  { estados: ['oc_recibida'], titulo: 'OC recibida' },
  { estados: ['sin_cubicar'], titulo: 'Proforma' },
  { estados: ['cubicada'], titulo: 'Cubicada' },
  { estados: ['enviada_cliente'], titulo: 'Con el cliente' },
  { estados: ['retenida'], titulo: 'OV retenida' },
  { estados: ['activa', 'cerrada'], titulo: 'OV activa' },
];

/** Qué hace el botón de confirmar según la acción pendiente (dicho exacto). */
const BOTON_CONFIRMAR: Record<string, string> = {
  crear_proforma: 'Crear la Proforma en OBEN MAS',
  aprobar: 'Crear la orden de venta en OBEN MAS',
  rechazar: 'Anular la Proforma',
  modificar: 'Modificar la Proforma',
  activar: 'Activar la orden de venta',
};

const PASO_OBEN: Record<string, string> = { encabezado: 'Encabezado', detalle: 'Línea', ov: 'Orden de venta', activar: 'Activar', validar: 'Validar' };

const FASES: Array<[string, string]> = [
  ['ocRecibida', 'OC recibida'],
  ['proformaCreada', 'Proforma creada'],
  ['cubicada', 'Cubicada'],
  ['enviadaCliente', 'Enviada al cliente'],
  ['aprobadaCliente', 'Aprobada por el cliente'],
  ['retenida', 'OV retenida'],
  ['carteraLiberada', 'Cartera liberó'],
  ['activa', 'OV activa'],
  ['cerrada', 'Despachada'],
  ['rechazada', 'Rechazada'],
  ['anulada', 'Anulada'],
];

type EdicionLinea = { codigoOben: string; kilos: string; anchoMm: string; precio: string; guardarEquivalencia: boolean };

export function CasoDetalle({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const t = useT();
  const [caso, setCaso] = useState<ComercialCaso | null>(null);
  const [oben, setOben] = useState<ProformaOben | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<Record<number, EdicionLinea>>({});
  const [respuesta, setRespuesta] = useState<{ tipo: 'aprueba' | 'rechaza' | 'modifica'; nota: string; lineas: string }>({ tipo: 'aprueba', nota: '', lineas: '' });

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cargar() {
    try {
      setError('');
      const [c, o] = await Promise.all([api.getComercialCaso(id), api.getComercialCasoOben(id).catch(() => null)]);
      setCaso(c);
      setOben(o);
      setEdits({});
    } catch (err) {
      setError(extractMessage(err, 'No se pudo cargar el caso.'));
    }
  }

  async function accion(nombre: string, fn: () => Promise<unknown>) {
    try {
      setBusy(nombre);
      setError('');
      await fn();
      await cargar();
      onChange();
    } catch (err) {
      setError(extractMessage(err, 'La acción no se pudo completar.'));
    } finally {
      setBusy('');
    }
  }

  function edit(l: CasoLinea): EdicionLinea {
    return edits[l.n] ?? { codigoOben: l.codigoOben ?? '', kilos: l.kilos?.toString() ?? '', anchoMm: l.anchoMm?.toString() ?? '', precio: l.precioUnitario?.toString() ?? '', guardarEquivalencia: !l.codigoOben };
  }

  async function guardarLineas() {
    const lineas = Object.entries(edits).map(([n, e]) => ({
      n: Number(n),
      ...(e.codigoOben.trim() ? { codigoOben: e.codigoOben.trim(), guardarEquivalencia: e.guardarEquivalencia } : {}),
      ...(e.kilos ? { kilos: Number(e.kilos) } : {}),
      ...(e.anchoMm ? { anchoMm: Number(e.anchoMm) } : {}),
      ...(e.precio ? { precioUnitario: Number(e.precio.replace(',', '.')) } : {}),
    }));
    await accion('lineas', () => api.editComercialCaso(id, { lineas }));
  }

  async function descargarFirmada() {
    await accion('pdf', async () => {
      const blob = await api.downloadProformaFirmada(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = caso?.proformaFirmadaNombre ?? 'Proforma_firmada.pdf';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (!caso) {
    return (
      <Panel onClose={onClose}>
        {error ? <p className="text-sm text-red-700">{error}</p> : <Loader2 className="w-6 h-6 animate-spin text-[#F47735] mx-auto" />}
      </Panel>
    );
  }

  const editable = caso.estado === 'oc_recibida';
  const puedeResponder = caso.estado === 'enviada_cliente' || caso.estado === 'cubicada';
  const abierto = ['oc_recibida', 'sin_cubicar', 'cubicada', 'enviada_cliente', 'retenida'].includes(caso.estado);

  return (
    <Panel onClose={onClose}>
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">{caso.cliente ?? caso.contactoEmail}</h2>
            <EstadoBadge estado={caso.estado} />
            {caso.simulated && <SimuladoBadge items={caso.simulatedItems} />}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            OC {caso.ocNumero ?? '(sin número)'}{' '}{t('· Proforma')}{' '}{caso.numberPF ?? '—'}{' '}{t('· OV')}{' '}{caso.numberOrderSales ?? (['retenida', 'activa', 'cerrada'].includes(caso.estado) ? 'creada (Oben no informa el número)' : '—')} · {caso.tipo ?? '—'} {caso.pais ? `(${caso.pais})` : ''}
          </p>
          <p className="text-xs text-gray-400">
            {t('De')}{' '}{caso.contactoEmail}{' '}{t('· comercial')}{' '}{caso.comercialEmail ?? '—'}{' '}{t('· leída por')}{' '}{caso.extraidoPor === 'ia' ? 'IA' : 'reglas'}{' '}{t('· recibida')}{' '}{fecha(caso.ocRecibidaEn)}
          </p>
        </div>

        <Progreso estado={caso.estado} />

        {oben && <TarjetaOben p={oben} onGuardarOV={(n) => accion('ov', () => api.setComercialCasoOV(id, n))} ocupado={!!busy} />}

        {error && (
          <p className="text-sm text-red-700 flex items-start gap-1.5">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </p>
        )}

        {caso.simulated && (
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900">
            <p className="font-semibold mb-1">{t('Este caso usa datos SIMULADOS (nunca se escriben en un OBEN MAS real ni salen a un cliente real):')}</p>
            <ul className="list-disc ml-5">
              {caso.simulatedItems.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {caso.accionPendiente && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
            <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />{' '}{t('Esperando tu confirmación:')}{' '}{ACCION_LABEL[caso.accionPendiente.tipo] ?? caso.accionPendiente.tipo}
            </p>
            <p className="text-xs text-amber-900">{caso.accionPendiente.detalle}</p>
            <div className="flex flex-wrap gap-2">
              <button className={btnPrimary} disabled={!!busy} onClick={() => accion('confirmar', () => api.confirmComercialCaso(id))}>
                {busy === 'confirmar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {caso.simulated ? `${BOTON_CONFIRMAR[caso.accionPendiente.tipo] ?? 'Confirmar'} (SIMULADO: no llega a Oben)` : (BOTON_CONFIRMAR[caso.accionPendiente.tipo] ?? 'Confirmar')}
              </button>
              <button
                className={btnSecondary}
                disabled={!!busy}
                title={t('Solo si un intento anterior quedó sin respuesta (timeout) y ya verificaste en OBEN MAS qué quedó hecho')}
                onClick={() => confirm('¿Ya verificaste en OBEN MAS qué quedó hecho del intento anterior?') && accion('confirmar', () => api.confirmComercialCaso(id, true))}
              >
                {t('Confirmar (ya verifiqué en OBEN MAS)')}
              </button>
            </div>
          </div>
        )}

        {(caso.missing.length > 0 || caso.atencion.length > 0) && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm space-y-1">
            {caso.missing.length > 0 && <p className="font-semibold text-red-800">{t('Falta (no se rellena con supuestos):')}</p>}
            <ul className="list-disc ml-5 text-red-800 text-xs space-y-0.5">
              {caso.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            {caso.atencion.length > 0 && (
              <>
                <p className="font-semibold text-red-800 flex items-center gap-1 mt-2">
                  <AlertTriangle className="w-4 h-4" />{' '}{t('Para revisar:')}
                </p>
                <ul className="list-disc ml-5 text-red-800 text-xs space-y-0.5">
                  {caso.atencion.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('Líneas')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-600">
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">{t('Como lo pidió el cliente')}</th>
                  <th className="px-2 py-1.5">{t('Ref. Oben')}</th>
                  <th className="px-2 py-1.5">{t('Kg')}</th>
                  <th className="px-2 py-1.5">{t('Ancho mm')}</th>
                  <th className="px-2 py-1.5">{t('Precio')}</th>
                  <th className="px-2 py-1.5">{t('Conversiones / faltantes')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {caso.lineas.map((l) => {
                  const e = edit(l);
                  return (
                    <tr key={l.n} className={l.faltantes.length ? 'bg-red-50/40' : ''}>
                      <td className="px-2 py-1.5 text-gray-500">{l.n}</td>
                      <td className="px-2 py-1.5 text-gray-800">{l.textoCliente}</td>
                      <td className="px-2 py-1.5">
                        {editable ? (
                          <div className="space-y-1">
                            <input value={e.codigoOben} onChange={(ev) => setEdits({ ...edits, [l.n]: { ...e, codigoOben: ev.target.value } })} className={`${inputCls} w-28 !py-1`} placeholder={t('Ref. Oben')} />
                            {!l.equivalenciaId && e.codigoOben && (
                              <label className="flex items-center gap-1 text-[11px] text-gray-500">
                                <input type="checkbox" checked={e.guardarEquivalencia} onChange={(ev) => setEdits({ ...edits, [l.n]: { ...e, guardarEquivalencia: ev.target.checked } })} />
                                {t('guardar en Equivalencias')}
                              </label>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono">{l.codigoOben ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {editable ? <input value={e.kilos} onChange={(ev) => setEdits({ ...edits, [l.n]: { ...e, kilos: ev.target.value } })} className={`${inputCls} w-28 !py-1 tabular-nums`} /> : (l.kilos ?? '—')}
                      </td>
                      <td className="px-2 py-1.5">
                        {editable ? <input value={e.anchoMm} onChange={(ev) => setEdits({ ...edits, [l.n]: { ...e, anchoMm: ev.target.value } })} className={`${inputCls} w-20 !py-1`} /> : (l.anchoMm ?? '—')}
                      </td>
                      <td className="px-2 py-1.5">
                        {editable ? (
                          <input value={e.precio} onChange={(ev) => setEdits({ ...edits, [l.n]: { ...e, precio: ev.target.value } })} className={`${inputCls} w-20 !py-1 tabular-nums`} placeholder={t('USD/kg')} />
                        ) : l.precioUnitario !== null ? (
                          `${l.precioUnitario} ${l.moneda ?? ''}`
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-gray-500">
                        {l.conversiones.map((c) => (
                          <div key={c}>{c}</div>
                        ))}
                        {l.faltantes.map((f) => (
                          <div key={f} className="text-red-700">
                            {f}
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {editable && Object.keys(edits).length > 0 && (
            <button className={`${btnPrimary} mt-2`} disabled={!!busy} onClick={guardarLineas}>
              {busy === 'lineas' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}{' '}{t('Guardar correcciones')}
            </button>
          )}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">{t('Destino')}</h3>
            <p className="text-gray-700">{caso.destino ? `${caso.destino.direccion}${caso.destino.ciudad ? `, ${caso.destino.ciudad}` : ''} (${caso.destino.pais})` : '—'}</p>
            <p className="text-xs text-gray-400">{caso.destino ? `Fuente: ${caso.destino.fuente}` : ''}</p>
            <p className="text-gray-700 mt-2">{t('Fecha requerida:')}{' '}{caso.fechaRequerida ?? '—'}</p>
            {caso.clienteFinal && <p className="text-gray-700">{t('Cliente final:')}{' '}{caso.clienteFinal}</p>}
            {caso.entregaComprometida && <p className="text-gray-700">{t('Entrega comprometida:')}{' '}{caso.entregaComprometida}</p>}
            {caso.entregaHistorial.length > 1 && (
              <ul className="text-xs text-gray-500 mt-1">
                {caso.entregaHistorial.map((h) => (
                  <li key={h.fecha}>
                    {fecha(h.fecha)}: {h.anterior ?? '—'} → {h.nueva ?? '—'}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">{t('Fechas de cada fase')}</h3>
            <ul className="text-xs text-gray-700 space-y-0.5">
              {FASES.filter(([k]) => caso.fechas[k]).map(([k, label]) => (
                <li key={k}>
                  <span className="text-gray-500">{label}:</span> {fecha(caso.fechas[k])}
                </li>
              ))}
            </ul>
            {caso.seguimiento.tipo && (
              <p className="text-xs text-gray-500 mt-2">
                {t('Seguimiento (')}{caso.seguimiento.tipo === 'firma' ? 'recordatorio al cliente' : 'cartera → comercial'}): {caso.seguimiento.enviados}{' '}{t('enviado(s), próximo')}{' '}{fecha(caso.seguimiento.proximoEn)}
              </p>
            )}
          </div>
        </section>

        <section className="flex flex-wrap gap-2">
          {(caso.estado === 'cubicada' || caso.estado === 'enviada_cliente') && (
            <button className={btnSecondary} disabled={!!busy} onClick={() => accion('enviar', () => api.sendComercialProforma(id))}>
              {busy === 'enviar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {caso.estado === 'cubicada' ? 'Enviar Proforma al cliente' : 'Reenviar Proforma'}
            </button>
          )}
          {caso.proformaFirmadaNombre && (
            <button className={btnSecondary} disabled={!!busy} onClick={descargarFirmada}>
              <Download className="w-4 h-4" />{' '}{t('Proforma firmada')}
            </button>
          )}
          {abierto && (
            <button
              className="inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-lg text-sm font-medium disabled:opacity-50"
              disabled={!!busy}
              onClick={() => {
                const motivo = prompt('¿Por qué se da de baja? (queda en la bitácora)');
                if (motivo?.trim()) void accion('anular', () => api.cancelComercialCaso(id, motivo.trim()));
              }}
            >
              {t('Dar de baja')}
            </button>
          )}
        </section>

        {puedeResponder && (!caso.accionPendiente || caso.accionPendiente.tipo === 'modificar') && (
          <section className="p-3 bg-gray-50 rounded-lg space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">{t('Registrar respuesta del cliente (llegó por teléfono / WhatsApp)')}</h3>
            <div className="flex flex-col md:flex-row gap-2">
              <select value={respuesta.tipo} onChange={(e) => setRespuesta({ ...respuesta, tipo: e.target.value as typeof respuesta.tipo })} className={inputCls}>
                <option value="aprueba">{t('Aprueba')}</option>
                <option value="rechaza">{t('Rechaza')}</option>
                <option value="modifica">{t('Pide modificar')}</option>
              </select>
              <input value={respuesta.nota} onChange={(e) => setRespuesta({ ...respuesta, nota: e.target.value })} placeholder={t('Qué dijo y por dónde (queda en la bitácora)')} className={`${inputCls} flex-1`} />
              <button
                className={btnPrimary}
                disabled={!!busy || !respuesta.nota.trim() || (respuesta.tipo === 'modifica' && lineasModificacion(respuesta.lineas) === null)}
                onClick={() =>
                  accion('respuesta', () =>
                    api.registerComercialRespuesta(id, {
                      tipo: respuesta.tipo,
                      nota: respuesta.nota.trim(),
                      ...(respuesta.tipo === 'modifica' && respuesta.lineas.trim() ? { lineas: lineasModificacion(respuesta.lineas)! } : {}),
                    }),
                  )
                }
              >
                {t('Registrar')}
              </button>
            </div>
            {respuesta.tipo === 'modifica' && (
              <div>
                <textarea
                  value={respuesta.lineas}
                  onChange={(e) => setRespuesta({ ...respuesta, lineas: e.target.value })}
                  rows={3}
                  placeholder={t('Nuevas líneas, una por renglón: código del cliente; kg; ancho mm; ref. Oben (opcional) BOPP 15; 2000; 425')}
                  className={`${inputCls} w-full font-mono text-xs`}
                />
                {respuesta.lineas.trim() && lineasModificacion(respuesta.lineas) === null && (
                  <p className="text-xs text-red-700">{t('Cada renglón: código; kg (>0); ancho mm (>0); ref. Oben opcional.')}</p>
                )}
              </div>
            )}
          </section>
        )}

        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('Bitácora')}</h3>
          <ol className="space-y-1.5 text-xs max-h-72 overflow-y-auto">
            {[...caso.eventos].reverse().map((e, i) => (
              <li key={`${e.fecha}-${i}`} className="border-l-2 border-gray-200 pl-2">
                <span className="text-gray-400">{fecha(e.fecha)}</span> <span className="text-gray-800">{e.detalle}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Panel>
  );
}

/** Línea de etapas del caso: hechas, la actual y las que faltan. */
function Progreso({ estado }: { estado: CasoEstado }) {
  const t = useT();
  if (estado === 'rechazada' || estado === 'anulada') {
    return <p className="text-sm font-medium text-red-700">{t('Caso')}{' '}{estado === 'rechazada' ? 'rechazado por el cliente' : 'dado de baja'}.</p>;
  }
  const actual = PASOS.findIndex((p) => p.estados.includes(estado));
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1">
      {PASOS.map((p, i) => {
        const hecho = i < actual || estado === 'cerrada';
        const ahora = i === actual && estado !== 'cerrada';
        return (
          <li key={p.titulo} className="flex items-center gap-1 shrink-0">
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                hecho ? 'bg-emerald-100 text-emerald-800' : ahora ? 'bg-[#F47735] text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {hecho ? <Check className="w-3.5 h-3.5" /> : <span className="tabular-nums">{i + 1}</span>}
              {p.titulo}
            </span>
            {i < PASOS.length - 1 && <span className={`w-4 h-px ${hecho ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** La Proforma REAL en OBEN MAS: números, estado y lo que respondió Oben en cada paso. */
function TarjetaOben({ p, onGuardarOV, ocupado }: { p: ProformaOben; onGuardarOV: (n: number) => void; ocupado: boolean }) {
  const t = useT();
  const [ov, setOv] = useState('');
  const ovCreada = p.estado === 'ov_creada' || p.estado === 'activa';
  const estado: Record<ProformaOben['estado'], string> = {
    pendiente: 'Sin crear',
    encabezado: 'Faltan líneas',
    creada: 'Creada (sin orden de venta)',
    ov_creada: 'Orden de venta creada (sin activar)',
    activa: 'Orden de venta activa',
    revisar: 'Verificar en OBEN MAS',
  };
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="w-4 h-4 text-sky-700" />
        <span className="text-sm font-semibold text-sky-900">{t('Proforma en OBEN MAS')}</span>
        {p.servidor === 'pruebas' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold">
            <FlaskConical className="w-3 h-3" />{' '}{t('Servidor de pruebas de Oben')}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div>
          <dt className="text-[11px] text-gray-500">{t('Proforma (oficial)')}</dt>
          <dd className="font-bold text-gray-900 tabular-nums">{p.numeroPF ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-gray-500">{t('Código interno')}</dt>
          <dd className="text-gray-700 tabular-nums">{p.codigoInterno ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-gray-500">{t('Orden de venta')}</dt>
          <dd className="font-bold text-gray-900 tabular-nums">{p.ordenVenta ?? (ovCreada ? 'creada · Oben no informa el número' : '—')}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-gray-500">{t('Estado en Oben')}</dt>
          <dd className="text-gray-900">{estado[p.estado]}</dd>
        </div>
      </dl>
      {ovCreada && !p.ordenVenta && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-600">{t('Oben no devuelve el número de la orden de venta. Míralo en OBEN MAS y regístralo aquí:')}</span>
          <input value={ov} onChange={(e) => setOv(e.target.value.replace(/\D/g, ''))} placeholder={t('Nº de la OV')} className={`${inputCls} w-28 py-1`} inputMode="numeric" />
          <button className={btnPrimary} disabled={ocupado || !ov} onClick={() => onGuardarOV(Number(ov))}>
            {t('Guardar número')}
          </button>
        </div>
      )}
      {p.error && <p className="text-xs text-red-700">{p.error}</p>}
      <ul className="text-[11px] text-gray-600 space-y-0.5">
        {p.pasos.map((x, i) => (
          <li key={i} className="flex gap-2">
            <span className={x.ok ? 'text-emerald-700' : 'text-red-700'}>{x.ok ? '✓' : '✗'}</span>
            <span className="text-gray-400 whitespace-nowrap">{fecha(x.en)}</span>
            <span>
              {PASO_OBEN[x.paso] ?? x.paso}
              {x.linea ? ` ${x.linea}` : ''}: {x.respuesta}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-gray-500">{t('El cubicaje de Planeación, el PDF de la Proforma y la cartera aún se simulan: Oben no tiene API para eso.')}</p>
    </div>
  );
}

function Panel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-3xl h-full bg-white shadow-xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" aria-label={t('Cerrar')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** "BOPP 15; 2000; 425; SC15TN" por renglón → líneas; null si algún renglón es inválido. */
function lineasModificacion(texto: string): Array<{ codigoCliente: string; kilos: number; anchoMm: number; codigoOben?: string }> | null {
  const out: Array<{ codigoCliente: string; kilos: number; anchoMm: number; codigoOben?: string }> = [];
  for (const raw of texto.split('\n')) {
    if (!raw.trim()) continue;
    const [codigo, kg, ancho, oben] = raw.split(/[;|]/).map((x) => x.trim());
    const kilos = Number((kg ?? '').replace(',', '.'));
    const anchoMm = Number((ancho ?? '').replace(',', '.'));
    if (!codigo || !(kilos > 0) || !(anchoMm > 0)) return null;
    out.push({ codigoCliente: codigo, kilos, anchoMm, ...(oben ? { codigoOben: oben } : {}) });
  }
  return out;
}
