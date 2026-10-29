'use client';

import { useT } from '@/i18n/idioma';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { CargaTarifario, LiquidacionInputPantalla, ProformaDocumento, ResultadoCargaTarifario, TarifaManualInput, TarifasManuales, VistaFactura } from '@/types';
import { AlertCircle, Download, FileSpreadsheet, FileText, History, Loader2, Plus, Receipt, Trash2, Upload, X } from 'lucide-react';
import { Card, CardHeader, btnPrimary, btnSecondary, fecha, inputCls, usd } from './ui';

/**
 * La proforma con el formato del documento de OBEN MAS (María Escobar, 28-oct: "que salga tal cual como la muestra
 * Oben MAS o que permita descargar para validar información"). Lo que Oben no entrega por ninguna fuente sale como
 * "no disponible" y se lista al pie: nada se inventa.
 */
export function ProformaModal({ pf, onClose }: { pf: string; onClose: () => void }) {
  const t = useT();
  const [data, setData] = useState<ProformaDocumento | null>(null);
  const [error, setError] = useState('');
  const [bajando, setBajando] = useState('');
  useEffect(() => {
    api
      .getProformaDocumento(pf)
      .then(setData)
      .catch((err) => setError(extractMessage(err, `No se pudo consultar la proforma ${pf} en Oben.`)));
  }, [pf]);

  const descargar = (tipo: 'pdf' | 'xlsx') => {
    setBajando(tipo);
    (tipo === 'pdf' ? api.downloadProformaPdf(pf) : api.downloadProformaExcel(pf))
      .then((b) => {
        const url = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Proforma-${pf}.${tipo}`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => setError(extractMessage(err, 'No se pudo descargar la proforma.')))
      .finally(() => setBajando(''));
  };

  const nd = <span className="italic text-amber-700">{t('no disponible')}</span>;
  const dato = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? nd : v);
  const bloque = (titulo: string, contenido: React.ReactNode, ancho = '') => (
    <div className={`border border-gray-800 p-2 ${ancho}`}>
      <p className="text-[11px] font-bold text-gray-900">{titulo}</p>
      <div className="text-sm text-gray-900 whitespace-pre-line break-words">{contenido}</div>
    </div>
  );
  const direccion = (b: { nombre: string | null; direccion: string | null }) =>
    b.nombre || b.direccion ? (
      <>
        {b.nombre}
        {b.direccion ? `\n${b.direccion}` : ''}
      </>
    ) : (
      nd
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#F47735]" />{' '}{t('Proforma')}{' '}{pf}{' '}{t('en OBEN MAS')}
          </h3>
          <div className="flex items-center gap-2">
            <button className={btnPrimary} disabled={!data || !!bajando} onClick={() => descargar('pdf')}>
              {bajando === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {t('Descargar PDF')}
            </button>
            <button className={btnSecondary} disabled={!data || !!bajando} onClick={() => descargar('xlsx')}>
              {bajando === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} {t('Excel')}
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label={t('Cerrar')}>
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-3">
          {error && (
            <p className="text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
          {!data && !error && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />{' '}{t('Consultando la proforma en Oben…')}
            </p>
          )}
          {data && (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">{data.embarcador}</p>
                  <p className="text-[11px] text-gray-500">{t('Fecha')}: {dato(data.fechas.proforma)}</p>
                </div>
                <p className="text-gray-700">
                  {t('Proforma')}: <span className="text-3xl font-extrabold text-gray-900 align-middle">{data.numberPF}</span>
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-0">
                {bloque('Pedido Cliente Nro: (Customer Order)', <span className="text-lg">{dato(data.ordenCompra)}</span>, 'md:col-span-3')}
                <div className="md:col-span-2 border border-gray-800 divide-y divide-gray-800 text-[11px]">
                  {([['Fecha Estimada Embarque (Estimated Date of Shipment)', data.fechas.estimadaEmbarque], ['Fecha Estimada Entrega (Estimated Date of Delivery)', data.fechas.estimadaEntrega], ['Fecha Requerida Cliente (Customer Required Date)', data.fechas.requeridaCliente]] as const).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className="font-bold text-gray-900">{k}</span>
                      <span className="text-gray-900 font-semibold">{dato(v)}</span>
                    </div>
                  ))}
                </div>
                {bloque('Vendido a: (Sold To)', direccion(data.vendidoA), 'md:col-span-3')}
                {bloque('Puerto Destino (Destination Port)', dato(data.puertoDestino), 'md:col-span-2')}
                {bloque('Entregado en: (Shipped To)', direccion(data.entregadoEn), 'md:col-span-3')}
                {bloque('Mercado / País', dato([data.mercado, data.pais].filter(Boolean).join(' — ')), 'md:col-span-2')}
                {bloque('Consignado a: (consigned to)', dato(data.consignadoA), 'md:col-span-5')}
                {bloque('Embarcador Por: (Shipped by)', data.embarcador, 'md:col-span-3')}
                {bloque('Origen: (Origin)', data.origen, 'md:col-span-2')}
                {bloque('Desde: (From)', dato(data.desde), 'md:col-span-3')}
                {bloque('Hasta: (To)', dato(data.hasta), 'md:col-span-2')}
                {bloque('Contenedores: (Nº Containers)', dato(data.contenedores), 'md:col-span-3')}
                {bloque('Forma de Pago: (Payment Terms)', dato(data.formaPago), 'md:col-span-2')}
                {bloque('Embalaje: (Package)', dato(data.embalaje), 'md:col-span-3')}
                {bloque('Incoterm 2020', dato(data.incoterm), 'md:col-span-2')}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-900 border border-gray-800 border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[10px]">
                      {['Item', 'Cant. (Quantity) Kg', 'Rollos (Rolls)', 'Descripción del Producto (Product Description)', 'Diámetro (mm)', 'Core (plg)', 'P.A.', 'Precio Unit. (Unit Price)', 'Total US$'].map((c) => (
                        <th key={c} className="border border-gray-800 px-2 py-1.5 font-bold text-center">
                          {t(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.lineas.map((l) => (
                      <tr key={l.sku}>
                        <td className="border border-gray-800 px-2 py-1.5 text-center">{l.item}</td>
                        <td className="border border-gray-800 px-2 py-1.5 text-right tabular-nums">{l.kilos.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="border border-gray-800 px-2 py-1.5 text-center">{l.rollos ?? '—'}</td>
                        <td className="border border-gray-800 px-2 py-1.5">{l.descripcion}</td>
                        <td className="border border-gray-800 px-2 py-1.5 text-center">{l.diametroMm ?? '—'}</td>
                        <td className="border border-gray-800 px-2 py-1.5 text-center">{l.core ?? '—'}</td>
                        <td className="border border-gray-800 px-2 py-1.5 text-center">{l.partida ?? '—'}</td>
                        <td className="border border-gray-800 px-2 py-1.5 text-right tabular-nums">{l.precio === null ? '—' : l.precio.toFixed(4)}</td>
                        <td className="border border-gray-800 px-2 py-1.5 text-right tabular-nums">{l.total === null ? '—' : l.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between text-sm font-bold text-gray-900">
                <span>{t('Total kilos')}: {data.totalKilos.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                <span>{t('Total US$')}: {data.totalUsd === null ? nd : data.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="text-[11px] text-gray-500 space-y-1">
                <p>
                  {data.fuenteLiquidacion === 'vivo'
                    ? t('Precios y partida: liquidación de Oben en vivo.')
                    : data.fuenteLiquidacion === 'copia'
                      ? `${t('Precios y partida: copia de la liquidación de Oben guardada el')} ${fecha(data.copiaDe)}.`
                      : t('Sin liquidación de Oben disponible para esta proforma.')}{' '}
                  {t('Cantidades: reporte de proformas COMEX. Rollos y contenedor: Lista de Empaque. Solo lectura.')}
                </p>
                {data.faltantes.length > 0 && (
                  <p className="text-amber-700">
                    <b>{t('No disponible en las fuentes de Oben')}:</b> {data.faltantes.join('; ')}.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Cómo saldrá la factura con lo que COMEX tiene en pantalla (María, 20-oct: "que podamos ver aquí las
 * observaciones" y el total "TOTAL VALOR CFR … INCOTERM 2020" antes de aprobar).
 */
export function VistaFacturaCard({ ov, input, version }: { ov: number; input: LiquidacionInputPantalla; version: string }) {
  const t = useT();
  const [vista, setVista] = useState<VistaFactura | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const req = useRef(0);
  useEffect(() => {
    const id = ++req.current;
    const t = setTimeout(() => {
      setCargando(true);
      api
        .getVistaFactura(ov, input)
        .then((v) => {
          if (id !== req.current) return;
          setVista(v);
          setError('');
        })
        .catch((err) => id === req.current && setError(extractMessage(err, 'No se pudo armar la vista de la factura.')))
        .finally(() => id === req.current && setCargando(false));
    }, 700);
    return () => clearTimeout(t);
    // `version` cambia cada vez que la liquidación se recalcula.
  }, [ov, input, version]);
  return (
    <Card>
      <CardHeader
        icon={<Receipt className="w-4 h-4 text-[#F47735]" />}
        title={t('Así sale en la factura')}
        subtitle={t('Observaciones y totales de la factura con lo que tienes en pantalla (no se emite nada).')}
        right={cargando ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : null}
      />
      <div className="p-4 space-y-3">
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!vista && !error && <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />}
        {vista && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Dato label={t('Término de pago')} valor={vista.terminosPago ?? 'Oben no lo trae'} warn={!vista.terminosPago} />
              <Dato label={t('Orden de compra')} valor={vista.ordenCompra ?? '—'} />
              <Dato label={t('Subtotal FOB')} valor={usd(vista.subtotal)} />
              <Dato label={`Total ${vista.incoterm ?? ''}`.trim()} valor={usd(vista.neto)} fuerte />
            </div>
            <pre className="text-[11px] leading-5 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap break-words font-mono text-gray-800">
              {vista.observaciones.join('\n')}
            </pre>
            {vista.avisos.length > 0 && (
              <ul className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 space-y-0.5">
                {vista.avisos.map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Dato({ label, valor, fuerte, warn }: { label: string; valor: string; fuerte?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`tabular-nums ${fuerte ? 'font-bold text-[#C4521A]' : warn ? 'text-amber-700' : 'font-medium text-gray-900'}`}>{valor}</p>
    </div>
  );
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Tarifario de fletes de exportación (María, 20-oct: "descargo mi tarifario y lo subo aquí para que lo
 * actualice", también cuando hay tarifas spot). Vista previa → confirmar. Cada cuadro subido queda en el
 * histórico con el archivo original (Hernán: "hay que guardar histórico de los cuadros de tarifas subidos").
 */
export function TarifarioCard({ puedeCargar, onCargado }: { puedeCargar: boolean; onCargado?: () => void }) {
  const t = useT();
  const [historial, setHistorial] = useState<CargaTarifario[] | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<ResultadoCargaTarifario | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  // Vigencia del cuadro (Hernán, 23-oct): el sistema la pide al cargar; reemplaza las fechas del Excel.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const cargarHistorial = () =>
    api
      .getHistorialTarifario()
      .then(setHistorial)
      .catch(() => setHistorial([]));
  useEffect(() => {
    void cargarHistorial();
  }, []);

  async function revisar(f: File) {
    setArchivo(f);
    setVista(null);
    setOk('');
    setError('');
    try {
      setTrabajando(true);
      setVista(await api.cargarTarifarioExportacion(f, false));
    } catch (err) {
      setError(extractMessage(err, 'No se pudo leer el tarifario.'));
    } finally {
      setTrabajando(false);
    }
  }

  async function aplicar() {
    if (!archivo) return;
    try {
      setTrabajando(true);
      setError('');
      const r = await api.cargarTarifarioExportacion(archivo, true, { desde, hasta });
      setOk(`Tarifario cargado: ${r.maritimas.total} tarifas marítimas y ${r.inland.total} Inland, vigentes del ${desde} al ${hasta}. Quedó en el histórico.`);
      setDesde('');
      setHasta('');
      setVista(null);
      setArchivo(null);
      await cargarHistorial();
      onCargado?.();
    } catch (err) {
      setError(extractMessage(err, 'No se pudo cargar el tarifario.'));
    } finally {
      setTrabajando(false);
    }
  }

  const res = (r: ResultadoCargaTarifario['maritimas']) =>
    `${r.total} en total · ${r.nuevas} nuevas · ${r.cambiadas} cambian de valor · ${r.quitadas} salen${r.vencidas ? ` · ${r.vencidas} vencidas` : ''}`;

  return (
    <Card>
      <CardHeader
        icon={<FileSpreadsheet className="w-4 h-4 text-[#F47735]" />}
        title={t('Tarifario de fletes')}
        subtitle={t('El Excel de COMEX (pata 2 marítimo y pata 3 Inland). Se revisa antes de cargarlo y cada carga queda en el histórico.')}
      />
      <div className="p-4 space-y-3">
        {puedeCargar ? (
          <>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void revisar(f);
                e.target.value = '';
              }}
            />
            <button className={btnSecondary} onClick={() => input.current?.click()} disabled={trabajando}>
              {trabajando && !vista ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{' '}{t('Subir tarifario (Excel)')}
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-500">{t('Solo COMEX puede subir un tarifario nuevo.')}</p>
        )}
        {error && (
          <p className="text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </p>
        )}
        {ok && <p className="text-sm text-emerald-700">{ok}</p>}
        {vista && (
          <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-2 text-xs">
            <p className="font-semibold text-gray-900">{t('Vista previa ·')}{' '}{vista.archivo}</p>
            <p>
              <b>{t('Marítimas:')}</b> {res(vista.maritimas)}
            </p>
            <p>
              <b>{t('Inland:')}</b> {res(vista.inland)}
            </p>
            {vista.cambios.length > 0 && (
              <div className="max-h-48 overflow-y-auto bg-white rounded border border-gray-200">
                <table className="w-full">
                  <tbody className="divide-y divide-gray-100">
                    {vista.cambios.map((c, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1">{c.ruta}</td>
                        <td className="px-2 py-1 text-gray-500">{c.proveedor}</td>
                        <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                          {c.antes === null ? <span className="text-emerald-700">{t('nueva')}{' '}{usd(c.despues)}</span> : c.despues === null ? <span className="text-red-700">{t('sale (')}{usd(c.antes)})</span> : `${usd(c.antes)} → ${usd(c.despues)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {vista.avisos.map((a) => (
              <p key={a} className="text-amber-800">
                • {a}
              </p>
            ))}
            {vista.descartadas.length > 0 && (
              <details>
                <summary className="cursor-pointer text-gray-600">{t('Filas que no se cargan (')}{vista.descartadas.length})</summary>
                <ul className="mt-1 space-y-0.5 text-gray-600">
                  {vista.descartadas.map((d) => (
                    <li key={`${d.hoja}-${d.fila}`}>
                      {d.hoja}{t(', fila')}{' '}{d.fila}: {d.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="text-[11px] font-medium text-gray-700">
                {t('Fecha de vigencia (desde) *')}
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${inputCls} w-full mt-0.5`} />
              </label>
              <label className="text-[11px] font-medium text-gray-700">
                {t('Fecha de expiración (hasta) *')}
                <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className={`${inputCls} w-full mt-0.5`} />
              </label>
            </div>
            {desde && hasta && desde > hasta && <p className="text-red-700">{t('La fecha de vigencia no puede ser posterior a la de expiración.')}</p>}
            <div className="flex gap-2 pt-1">
              <button
                className={btnPrimary}
                onClick={() => void aplicar()}
                disabled={trabajando || !desde || !hasta || desde > hasta}
                title={!desde || !hasta ? 'Indica la vigencia del tarifario' : undefined}
              >
                {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{' '}{t('Cargar este tarifario')}
              </button>
              <button className={btnSecondary} onClick={() => (setVista(null), setArchivo(null))} disabled={trabajando}>
                {t('Cancelar')}
              </button>
            </div>
          </div>
        )}
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1">
            <History className="w-3 h-3" />{' '}{t('Histórico de tarifarios subidos')}
          </p>
          {historial === null ? (
            <p className="text-xs text-gray-400">{t('Cargando…')}</p>
          ) : historial.length === 0 ? (
            <p className="text-xs text-gray-500">{t('Aún no se ha subido ninguno desde aquí (el vigente se cargó el 1-oct desde el archivo de octubre).')}</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-xs">
              {historial.map((h) => (
                <li key={h.id} className="py-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-gray-900 truncate block" title={h.archivo}>
                      {h.archivo} {h.vigente && <span className="ml-1 px-1.5 rounded bg-emerald-50 text-emerald-700 text-[10px]">{t('vigente')}</span>}
                    </span>
                    <span className="text-gray-500">
                      {fecha(h.fecha)}
                      {h.usuario ? ` · ${h.usuario}` : ''}
                      {h.resumen?.maritimas ? ` · ${h.resumen.maritimas.total} marítimas, ${h.resumen.inland?.total ?? 0} Inland` : ''}
                      {h.resumen?.vigenteDesde ? ` · vigente ${h.resumen.vigenteDesde} → ${h.resumen.vigenteHasta}` : ''}
                    </span>
                  </span>
                  <button
                    className="p-1 rounded hover:bg-gray-100"
                    title={t('Descargar el Excel original')}
                    onClick={() => void api.descargarCargaTarifario(h.id).then((b) => descargar(b, h.archivo))}
                  >
                    <Download className="w-4 h-4 text-gray-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

const VACIA = { tipo: 'maritima' as 'maritima' | 'inland', origen: 'Cartagena, Colombia', destino: '', direccion: '', agente: '', naviera: '', dias: '', valor: '', comisionAduanera: '', vigenteDesde: '', vigenteHasta: '' };
type Campo = Exclude<keyof typeof VACIA, 'tipo'>;

/**
 * Botón + del tarifario (Hernán, 23-oct): tarifas que no están en el cuadro, sin depender de una proforma. Quedan
 * como opción en toda liquidación con ese destino, con su vigencia, y las cargas del archivo de fletes no las tocan.
 */
export function TarifasManualesSeccion({ puedeCargar, onCambio }: { puedeCargar: boolean; onCambio?: () => void }) {
  const t = useT();
  const [datos, setDatos] = useState<TarifasManuales | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState(VACIA);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api.getTarifasManuales().then(setDatos).catch(() => setDatos(null));
  }, []);
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));
  const maritima = f.tipo === 'maritima';
  const listo =
    !!f.destino.trim() &&
    !!f.agente.trim() &&
    Number(num(f.valor)) > 0 &&
    !!f.vigenteDesde &&
    !!f.vigenteHasta &&
    f.vigenteDesde <= f.vigenteHasta &&
    (maritima ? !!f.origen.trim() : /\b\d{5}\b/.test(f.direccion));

  async function guardar() {
    const dias = num(f.dias);
    const comision = num(f.comisionAduanera);
    const t: TarifaManualInput = {
      tipo: f.tipo,
      destino: f.destino.trim(),
      agente: f.agente.trim(),
      valor: Number(num(f.valor)),
      vigenteDesde: f.vigenteDesde,
      vigenteHasta: f.vigenteHasta,
      ...(dias !== undefined ? { dias: Math.round(dias) } : {}),
      ...(maritima
        ? { origen: f.origen.trim(), ...(f.naviera.trim() ? { naviera: f.naviera.trim() } : {}) }
        : { direccion: f.direccion.trim(), ...(comision !== undefined ? { comisionAduanera: comision } : {}) }),
    };
    try {
      setGuardando(true);
      setError('');
      setDatos(await api.agregarTarifaManual(t));
      setF({ ...VACIA, tipo: f.tipo, vigenteDesde: f.vigenteDesde, vigenteHasta: f.vigenteHasta });
      setAbierto(false);
      onCambio?.();
    } catch (err) {
      setError(extractMessage(err, 'No se pudo agregar la tarifa.'));
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(tipo: 'maritima' | 'inland', id: string) {
    if (!window.confirm('¿Quitar esta tarifa agregada a mano? Las liquidaciones que ya la escogieron conservan su valor.')) return;
    try {
      setError('');
      setDatos(await api.quitarTarifaManual(tipo, id));
      onCambio?.();
    } catch (err) {
      setError(extractMessage(err, 'No se pudo quitar la tarifa.'));
    }
  }

  const total = (datos?.maritimas.length ?? 0) + (datos?.inland.length ?? 0);
  const campo = (label: string, k: Campo, extra: Record<string, unknown> = {}) => (
    <label className="text-[11px] font-medium text-gray-700">
      {label}
      <input value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} className={`${inputCls} w-full mt-0.5 text-xs py-1.5`} {...extra} />
    </label>
  );

  return (
    <Card>
      <div className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-gray-900 flex-1">
          {t('Tarifas fuera del tarifario')}{' '}<span className="text-xs font-normal text-gray-500">{t('· agregadas a mano (')}{total})</span>
        </p>
        {puedeCargar && !abierto && (
          <button className={btnSecondary} onClick={() => setAbierto(true)} title={t('Agregar una tarifa que no está en el cuadro')}>
            <Plus className="w-4 h-4" />{' '}{t('Agregar tarifa')}
          </button>
        )}
      </div>
      {abierto && (
        <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {(['maritima', 'inland'] as const).map((tipo) => (
              <button
                key={tipo}
                onClick={() => setF((x) => ({ ...x, tipo, destino: '' }))}
                className={`px-2.5 py-1 rounded-full text-xs border ${f.tipo === tipo ? 'bg-[#F47735] text-white border-[#F47735]' : 'bg-white text-gray-700 border-gray-200'}`}
              >
                {tipo === 'maritima' ? 'Flete marítimo (pata 2)' : 'Inland / aduana (pata 3)'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {maritima ? (
              <>
                {campo('Puerto de origen *', 'origen', { placeholder: 'Cartagena, Colombia' })}
                {campo('Puerto de destino *', 'destino', { list: 'destinos-maritimos', placeholder: 'Escoge o escribe' })}
                {campo('Agente *', 'agente')}
                {campo('Naviera', 'naviera')}
              </>
            ) : (
              <>
                {campo('Puerto o rampa de salida *', 'destino', { list: 'puertos-inland', placeholder: 'Escoge o escribe' })}
                {campo('Dirección de entrega (con ZIP) *', 'direccion', { placeholder: 'Cincinnati, OH 45240' })}
                {campo('Transportador / agente *', 'agente')}
                {campo('Comisión aduanera (USD)', 'comisionAduanera', { inputMode: 'decimal' })}
              </>
            )}
            {campo('Valor USD por contenedor de 40 pies *', 'valor', { inputMode: 'decimal' })}
            {campo('Días de tránsito', 'dias', { inputMode: 'numeric' })}
            {campo('Vigente desde *', 'vigenteDesde', { type: 'date' })}
            {campo('Vence *', 'vigenteHasta', { type: 'date', min: f.vigenteDesde || undefined })}
          </div>
          <datalist id="destinos-maritimos">
            {datos?.destinosMaritimos.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <datalist id="puertos-inland">
            {datos?.puertosInland.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <p className="text-[11px] text-gray-500">
            {maritima
              ? 'Aparece como opción en las liquidaciones que llegan a ese puerto. Escoge el destino de la lista para que coincida con el tarifario.'
              : 'Aparece en las liquidaciones cuya dirección de entrega tiene ese ZIP.'}
          </p>
          <div className="flex gap-2">
            <button className={btnPrimary} onClick={() => void guardar()} disabled={guardando || !listo}>
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{' '}{t('Agregar')}
            </button>
            <button
              className={btnSecondary}
              onClick={() => {
                setAbierto(false);
                setError('');
              }}
              disabled={guardando}
            >
              {t('Cancelar')}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="text-xs text-red-700 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
      {datos && total > 0 && (
        <ul className="divide-y divide-gray-100 text-xs">
          {datos.maritimas.map((x) => (
            <li key={x.id} className="py-1.5 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-gray-900">
                  {x.origen.split(',')[0]} → {x.destino}
                </span>
                <span className="block text-gray-500">
                  {t('Marítimo ·')}{' '}{[x.agente, x.naviera].filter(Boolean).join(' / ')} · {usd(x.valor)}
                  {x.dias !== null ? ` · ${x.dias} días` : ''}{' '}{t('· vence')}{' '}{x.validUntil ?? '—'} · {x.por}
                </span>
              </span>
              {puedeCargar && (
                <button className="p-1 rounded hover:bg-gray-100" title={t('Quitar')} onClick={() => void quitar('maritima', x.id)}>
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </li>
          ))}
          {datos.inland.map((x) => (
            <li key={x.id} className="py-1.5 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-gray-900">
                  {x.puerto} → {x.direccion}
                </span>
                <span className="block text-gray-500">
                  {t('Inland ·')}{' '}{x.agente} · {usd(x.valor)}
                  {x.comisionAduanera !== null ? ` · aduana ${usd(x.comisionAduanera)}` : ''}{' '}{t('· vence')}{' '}{x.validUntil ?? '—'} · {x.por}
                </span>
              </span>
              {puedeCargar && (
                <button className="p-1 rounded hover:bg-gray-100" title={t('Quitar')} onClick={() => void quitar('inland', x.id)}>
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
    </Card>
  );
}
