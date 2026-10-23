'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { CargaTarifario, LiquidacionInputPantalla, ProformaCompleta, ResultadoCargaTarifario, TarifaManualInput, TarifasManuales, VistaFactura } from '@/types';
import { AlertCircle, Download, FileSpreadsheet, FileText, History, Loader2, Plus, Receipt, Trash2, Upload, X } from 'lucide-react';
import { Card, CardHeader, btnPrimary, btnSecondary, fecha, inputCls, usd } from './ui';

/** Nombres legibles de los campos que entrega Oben para la proforma (los demás se muestran tal cual). */
const ETIQUETAS: Record<string, string> = {
  Proforma: 'Proforma',
  NroProforma: 'Proforma',
  OrdenVenta: 'Orden de venta',
  OrdenCompra: 'Orden de compra del cliente',
  Cliente: 'Cliente',
  Direccion: 'Dirección',
  PuertoEmbarque: 'Puerto de embarque',
  PuertoArribo: 'Puerto de arribo',
  Incoterms: 'Incoterm',
  Incoterm: 'Incoterm',
  TerminoPago: 'Término de pago',
  Pais: 'País',
  Mercado: 'Mercado',
  TipoPelicula: 'Película',
  Precio: 'Precio/kg',
  KilosTotales: 'Kilos',
  Partida: 'Partida',
  DescripcionSKU: 'Descripción',
  TipoMaterial: 'Tipo de material',
  Linea: 'Línea',
  CodSed_LineFilm: 'Línea',
};
const etiqueta = (k: string) => ETIQUETAS[k] ?? k;
const valor = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? Object.values(x as Record<string, unknown>).join(' ') : String(x))).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/**
 * La proforma tal como la tiene Oben (María, 20-oct: "cuando vamos a liquidar consultamos la proforma, aquí no la
 * vamos a poder consultar"). Encabezado y detalle de la liquidación de Oben + la fila del reporte de proformas.
 */
export function ProformaModal({ pf, onClose }: { pf: string; onClose: () => void }) {
  const [data, setData] = useState<ProformaCompleta | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .getProformaCompleta(pf)
      .then(setData)
      .catch((err) => setError(extractMessage(err, `No se pudo consultar la proforma ${pf} en Oben.`)));
  }, [pf]);
  const columnas = data ? [...new Set(data.detalle.flatMap((d) => Object.keys(d)))] : [];
  const extra = data?.reporte ? Object.entries(data.reporte).filter(([k]) => !(k in (data?.campos ?? {})) && k !== 'OrdenesVenta') : [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#F47735]" /> Proforma {pf} en OBEN MAS
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {error && (
            <p className="text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
          {!data && !error && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Consultando la proforma en Oben…
            </p>
          )}
          {data && (
            <>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {[...Object.entries(data.campos), ...extra].map(([k, v]) => (
                  <div key={k} className={k === 'Direccion' ? 'sm:col-span-2' : ''}>
                    <dt className="text-[11px] uppercase tracking-wide text-gray-400">{etiqueta(k)}</dt>
                    <dd className="font-medium text-gray-900 whitespace-pre-line break-words">{valor(v)}</dd>
                  </div>
                ))}
              </dl>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-800">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      {columnas.map((c) => (
                        <th key={c} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                          {etiqueta(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.detalle.map((d, i) => (
                      <tr key={i}>
                        {columnas.map((c) => (
                          <td key={c} className="px-3 py-2 align-top">
                            {valor(d[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-400">Datos en vivo del ERP de Oben (spCheckSettlement y reporte de proformas COMEX). Solo lectura.</p>
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
        title="Así sale en la factura"
        subtitle="Observaciones y totales de la factura con lo que tienes en pantalla (no se emite nada)."
        right={cargando ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : null}
      />
      <div className="p-4 space-y-3">
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!vista && !error && <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />}
        {vista && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Dato label="Término de pago" valor={vista.terminosPago ?? 'Oben no lo trae'} warn={!vista.terminosPago} />
              <Dato label="Orden de compra" valor={vista.ordenCompra ?? '—'} />
              <Dato label="Subtotal FOB" valor={usd(vista.subtotal)} />
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
        title="Tarifario de fletes"
        subtitle="El Excel de COMEX (pata 2 marítimo y pata 3 Inland). Se revisa antes de cargarlo y cada carga queda en el histórico."
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
              {trabajando && !vista ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Subir tarifario (Excel)
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-500">Solo COMEX puede subir un tarifario nuevo.</p>
        )}
        {error && (
          <p className="text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </p>
        )}
        {ok && <p className="text-sm text-emerald-700">{ok}</p>}
        {vista && (
          <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-2 text-xs">
            <p className="font-semibold text-gray-900">Vista previa · {vista.archivo}</p>
            <p>
              <b>Marítimas:</b> {res(vista.maritimas)}
            </p>
            <p>
              <b>Inland:</b> {res(vista.inland)}
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
                          {c.antes === null ? <span className="text-emerald-700">nueva {usd(c.despues)}</span> : c.despues === null ? <span className="text-red-700">sale ({usd(c.antes)})</span> : `${usd(c.antes)} → ${usd(c.despues)}`}
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
                <summary className="cursor-pointer text-gray-600">Filas que no se cargan ({vista.descartadas.length})</summary>
                <ul className="mt-1 space-y-0.5 text-gray-600">
                  {vista.descartadas.map((d) => (
                    <li key={`${d.hoja}-${d.fila}`}>
                      {d.hoja}, fila {d.fila}: {d.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="text-[11px] font-medium text-gray-700">
                Fecha de vigencia (desde) *
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${inputCls} w-full mt-0.5`} />
              </label>
              <label className="text-[11px] font-medium text-gray-700">
                Fecha de expiración (hasta) *
                <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className={`${inputCls} w-full mt-0.5`} />
              </label>
            </div>
            {desde && hasta && desde > hasta && <p className="text-red-700">La fecha de vigencia no puede ser posterior a la de expiración.</p>}
            <div className="flex gap-2 pt-1">
              <button
                className={btnPrimary}
                onClick={() => void aplicar()}
                disabled={trabajando || !desde || !hasta || desde > hasta}
                title={!desde || !hasta ? 'Indica la vigencia del tarifario' : undefined}
              >
                {trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Cargar este tarifario
              </button>
              <button className={btnSecondary} onClick={() => (setVista(null), setArchivo(null))} disabled={trabajando}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        <TarifasManualesSeccion puedeCargar={puedeCargar} onCambio={onCargado} />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1">
            <History className="w-3 h-3" /> Histórico de tarifarios subidos
          </p>
          {historial === null ? (
            <p className="text-xs text-gray-400">Cargando…</p>
          ) : historial.length === 0 ? (
            <p className="text-xs text-gray-500">Aún no se ha subido ninguno desde aquí (el vigente se cargó el 1-oct desde el archivo de octubre).</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-xs">
              {historial.map((h) => (
                <li key={h.id} className="py-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-gray-900 truncate block" title={h.archivo}>
                      {h.archivo} {h.vigente && <span className="ml-1 px-1.5 rounded bg-emerald-50 text-emerald-700 text-[10px]">vigente</span>}
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
                    title="Descargar el Excel original"
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
function TarifasManualesSeccion({ puedeCargar, onCambio }: { puedeCargar: boolean; onCambio?: () => void }) {
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
    <div className="rounded-lg border border-gray-200 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-[11px] uppercase tracking-wide text-gray-400 flex-1">Tarifas agregadas a mano ({total})</p>
        {puedeCargar && !abierto && (
          <button className={btnSecondary} onClick={() => setAbierto(true)} title="Agregar una tarifa que no está en el cuadro">
            <Plus className="w-4 h-4" /> Agregar tarifa
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
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Agregar
            </button>
            <button
              className={btnSecondary}
              onClick={() => {
                setAbierto(false);
                setError('');
              }}
              disabled={guardando}
            >
              Cancelar
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
          {datos.maritimas.map((t) => (
            <li key={t.id} className="py-1.5 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-gray-900">
                  {t.origen.split(',')[0]} → {t.destino}
                </span>
                <span className="block text-gray-500">
                  Marítimo · {[t.agente, t.naviera].filter(Boolean).join(' / ')} · {usd(t.valor)}
                  {t.dias !== null ? ` · ${t.dias} días` : ''} · vence {t.validUntil ?? '—'} · {t.por}
                </span>
              </span>
              {puedeCargar && (
                <button className="p-1 rounded hover:bg-gray-100" title="Quitar" onClick={() => void quitar('maritima', t.id)}>
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </li>
          ))}
          {datos.inland.map((t) => (
            <li key={t.id} className="py-1.5 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-gray-900">
                  {t.puerto} → {t.direccion}
                </span>
                <span className="block text-gray-500">
                  Inland · {t.agente} · {usd(t.valor)}
                  {t.comisionAduanera !== null ? ` · aduana ${usd(t.comisionAduanera)}` : ''} · vence {t.validUntil ?? '—'} · {t.por}
                </span>
              </span>
              {puedeCargar && (
                <button className="p-1 rounded hover:bg-gray-100" title="Quitar" onClick={() => void quitar('inland', t.id)}>
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
