'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { ProformaOben, ProformaObenEntrada, ProformaObenVistaPrevia } from '@/types';
import { AlertCircle, CheckCircle2, FlaskConical, Loader2, Plus, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react';
import { SimuladoBadge, btnPrimary, btnSecondary, fecha, inputCls } from './comun';

type Fila = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const usd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO: Record<ProformaOben['estado'], { label: string; cls: string }> = {
  pendiente: { label: 'Sin crear', cls: 'bg-gray-100 text-gray-700' },
  encabezado: { label: 'Faltan líneas', cls: 'bg-amber-100 text-amber-800' },
  creada: { label: 'Creada · sin OV', cls: 'bg-sky-100 text-sky-800' },
  ov_creada: { label: 'OV creada · sin activar', cls: 'bg-indigo-100 text-indigo-800' },
  activa: { label: 'OV activa', cls: 'bg-emerald-100 text-emerald-800' },
  revisar: { label: 'Verificar en OBEN MAS', cls: 'bg-red-100 text-red-800' },
};

type LineaForm = { referencia: string; kilos: string; precio: string };
const hoyMas = (dias: number) => new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10);

/**
 * Proformas en OBEN MAS con las APIs comerciales de Oben (hoy en su servidor de PRUEBAS): se escoge cliente y
 * destino del maestro de Oben, se ponen la orden de compra, las fechas y las líneas (referencia, kilos, precio), y
 * el resto sale de la parametrización de Comercial. Vista previa (valida el Maestro de Empaque) → crear →
 * orden de venta → activar. El número que se muestra es el OFICIAL de la proforma (Number PF).
 */
export function ProformasObenPanel() {
  const [lista, setLista] = useState<ProformaOben[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // Formulario
  const [buscar, setBuscar] = useState('');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [destino, setDestino] = useState<Fila | null>(null);
  const [oc, setOc] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState(hoyMas(45));
  const [fechaDespacho, setFechaDespacho] = useState(hoyMas(30));
  const [contenedor, setContenedor] = useState('');
  const [pesoBruto, setPesoBruto] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([{ referencia: '', kilos: '', precio: '' }]);
  const [vista, setVista] = useState<ProformaObenVistaPrevia | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLista(await api.getProformasOben());
    } catch (err) {
      setError(extractMessage(err, 'No se pudieron cargar las proformas.'));
      setLista([]);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const entrada = (): ProformaObenEntrada | null => {
    if (!destino) return null;
    return {
      cliente: Number(destino.CodSec_Entity),
      direccion: Number(destino.CodSed_CustomerAddress),
      ordenCompra: oc.trim(),
      fechaEntrega,
      fechaDespacho,
      ...(contenedor.trim() ? { contenedor: contenedor.trim() } : {}),
      ...(Number(pesoBruto) > 0 ? { pesoBruto: Number(pesoBruto) } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      lineas: lineas
        .filter((l) => l.referencia.trim())
        .map((l) => ({ referencia: l.referencia.trim().toUpperCase(), kilos: Number(l.kilos.replace(',', '.')), precio: Number(l.precio.replace(',', '.')) })),
    };
  };

  async function buscarClientes() {
    if (buscar.trim().length < 3) return setError('Escribe al menos 3 letras del cliente o del destino.');
    setBusy('buscar');
    setError('');
    setDestino(null);
    setVista(null);
    try {
      const r = await api.getMaestroComercial('clientes', buscar.trim(), 300);
      setFilas(r.items);
      if (r.items.length === 0) setError('Oben no tiene clientes ni destinos con ese nombre.');
    } catch (err) {
      setError(extractMessage(err, 'No se pudo consultar el maestro de clientes de Oben.'));
    } finally {
      setBusy('');
    }
  }

  async function previsualizar() {
    const e = entrada();
    if (!e) return setError('Escoge el cliente y su destino.');
    setBusy('vista');
    setError('');
    try {
      setVista(await api.vistaPreviaProformaOben(e));
    } catch (err) {
      setVista(null);
      setError(extractMessage(err, 'No se pudo armar la proforma.'));
    } finally {
      setBusy('');
    }
  }

  async function crear() {
    const e = entrada();
    if (!e || !vista || vista.bloqueos.length) return;
    if (!window.confirm(`Se va a crear la proforma de ${vista.destino} en el servidor de ${vista.servidor === 'pruebas' ? 'PRUEBAS' : 'PRODUCCIÓN'} de Oben. ¿Continuar?`)) return;
    setBusy('crear');
    setError('');
    try {
      const p = await api.crearProformaOben(e);
      setVista(null);
      setOc('');
      setLineas([{ referencia: '', kilos: '', precio: '' }]);
      await cargar();
      if (p.error) setError(p.error);
    } catch (err) {
      setError(extractMessage(err, 'No se pudo crear la proforma.'));
    } finally {
      setBusy('');
    }
  }

  async function accion(p: ProformaOben, a: 'reintentar' | 'orden-venta' | 'activar') {
    let verificado = false;
    if (a === 'reintentar' && p.estado === 'revisar') {
      verificado = window.confirm('El último paso quedó sin respuesta de Oben. ¿Ya verificaste en OBEN MAS que NO quedó creado? Si quedó creado, no reintentes.');
      if (!verificado) return;
    }
    setBusy(`${p.id}:${a}`);
    setError('');
    try {
      const r = await api.accionProformaOben(p.id, a, verificado);
      await cargar();
      if (r.error) setError(r.error);
    } catch (err) {
      setError(extractMessage(err, 'Oben no completó la acción.'));
    } finally {
      setBusy('');
    }
  }

  const destinos = filas;
  const total = lineas.reduce((a, l) => a + (Number(l.kilos.replace(',', '.')) || 0) * (Number(l.precio.replace(',', '.')) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
        <FlaskConical className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Las APIs comerciales de Oben hoy están en su <b>servidor de PRUEBAS</b>: lo que se crea aquí no es una proforma real. El día que Oben las pase a
          producción, esta misma pantalla crea las reales.
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span className="whitespace-pre-line">{error}</span>
        </div>
      )}

      {/* ── Nueva proforma ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Nueva proforma en OBEN MAS</h2>
          <p className="text-sm text-gray-500">
            Condición de pago, Incoterm, moneda, puerto, etiquetas y notas salen de la parametrización de Comercial en Oben; la partida, de la línea de
            película de cada referencia.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">1. Cliente y destino</label>
          <div className="flex gap-2">
            <input
              id="pf-buscar"
              className={`${inputCls} flex-1`}
              placeholder="Buscar en el maestro de clientes de Oben (ej. ALADDIN, OBEN US…)"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void buscarClientes()}
            />
            <button className={btnSecondary} onClick={() => void buscarClientes()} disabled={busy === 'buscar'}>
              {busy === 'buscar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
            </button>
          </div>
          {destinos.length > 0 && (
            <ul className="max-h-56 overflow-auto divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {destinos.map((d, i) => {
                const activo = destino && s(destino.CodSec_Entity) === s(d.CodSec_Entity) && s(destino.CodSed_CustomerAddress) === s(d.CodSed_CustomerAddress);
                return (
                  <li key={i}>
                    <button
                      onClick={() => {
                        setDestino(d);
                        setVista(null);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${activo ? 'bg-orange-50' : ''}`}
                    >
                      <span className="font-medium text-gray-900">{s(d.Target_Customer) || '(sin destino)'}</span>
                      <span className="text-gray-500"> · {s(d.Nombre_Cliente)} · {s(d.Pais_Cliente)}</span>
                      <span className="block text-xs text-gray-400 tabular-nums">
                        Cliente {s(d.CodSec_Entity)} · dirección {s(d.CodSed_CustomerAddress)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {destino && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-sm space-y-1">
                <span className="font-medium text-gray-700">2. Orden de compra del cliente</span>
                <input id="pf-oc" className={`${inputCls} w-full`} value={oc} onChange={(e) => setOc(e.target.value)} placeholder="Ej. 7700003576" />
              </label>
              <label className="text-sm space-y-1">
                <span className="font-medium text-gray-700">Fecha de despacho</span>
                <input id="pf-despacho" type="date" className={`${inputCls} w-full`} value={fechaDespacho} onChange={(e) => setFechaDespacho(e.target.value)} />
              </label>
              <label className="text-sm space-y-1">
                <span className="font-medium text-gray-700">Fecha de entrega</span>
                <input id="pf-entrega" type="date" className={`${inputCls} w-full`} value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
              </label>
              <label className="text-sm space-y-1">
                <span className="font-medium text-gray-700">Peso bruto (kg, opcional)</span>
                <input id="pf-peso" inputMode="decimal" className={`${inputCls} w-full`} value={pesoBruto} onChange={(e) => setPesoBruto(e.target.value)} placeholder="Neto + 7 % si se deja vacío" />
              </label>
              <label className="text-sm space-y-1 sm:col-span-2">
                <span className="font-medium text-gray-700">Contenedor (opcional)</span>
                <input id="pf-contenedor" className={`${inputCls} w-full`} value={contenedor} onChange={(e) => setContenedor(e.target.value)} placeholder="CONTENEDOR ESTANDAR DE 40 PIES" />
              </label>
              <label className="text-sm space-y-1 sm:col-span-2">
                <span className="font-medium text-gray-700">Notas (opcional)</span>
                <input id="pf-notas" className={`${inputCls} w-full`} value={notas} onChange={(e) => setNotas(e.target.value)} />
              </label>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium text-gray-700">3. Líneas</span>
              {lineas.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_7rem_7rem_auto] gap-2">
                  <input
                    id={`pf-ref-${i}`}
                    className={inputCls}
                    placeholder="Referencia de Oben (ej. ET---0012RT0600S0760)"
                    value={l.referencia}
                    onChange={(e) => setLineas((xs) => xs.map((x, k) => (k === i ? { ...x, referencia: e.target.value } : x)))}
                  />
                  <input
                    id={`pf-kg-${i}`}
                    inputMode="decimal"
                    className={inputCls}
                    placeholder="Kilos"
                    value={l.kilos}
                    onChange={(e) => setLineas((xs) => xs.map((x, k) => (k === i ? { ...x, kilos: e.target.value } : x)))}
                  />
                  <input
                    id={`pf-precio-${i}`}
                    inputMode="decimal"
                    className={inputCls}
                    placeholder="Precio/kg"
                    value={l.precio}
                    onChange={(e) => setLineas((xs) => xs.map((x, k) => (k === i ? { ...x, precio: e.target.value } : x)))}
                  />
                  <button
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
                    onClick={() => setLineas((xs) => xs.filter((_, k) => k !== i))}
                    disabled={lineas.length === 1}
                    aria-label="Quitar línea"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <button className={btnSecondary} onClick={() => setLineas((xs) => [...xs, { referencia: '', kilos: '', precio: '' }])}>
                  <Plus className="w-4 h-4" /> Agregar línea
                </button>
                <span className="text-sm text-gray-500 tabular-nums">Subtotal: US$ {usd(total)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className={btnSecondary} onClick={() => void previsualizar()} disabled={!!busy}>
                {busy === 'vista' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Revisar con Oben
              </button>
              <button className={btnPrimary} onClick={() => void crear()} disabled={!!busy || !vista || vista.bloqueos.length > 0}>
                {busy === 'crear' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Crear proforma en OBEN MAS
              </button>
            </div>
          </>
        )}

        {vista && (
          <div className="rounded-lg border border-gray-200 p-4 space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-gray-900">
                {vista.cliente} → {vista.destino}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${vista.servidor === 'pruebas' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                Servidor de {vista.servidor === 'pruebas' ? 'pruebas' : 'producción'}
              </span>
              {vista.simulado && <SimuladoBadge items={['Datos del simulador, no de Oben.']} />}
            </div>
            {vista.bloqueos.length > 0 ? (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 space-y-1">
                <p className="font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> No se puede crear todavía
                </p>
                <ul className="list-disc pl-5">
                  {vista.bloqueos.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Lista para crear: todas las referencias tienen Maestro de Empaque para este destino.
              </p>
            )}
            {vista.avisos.map((a) => (
              <p key={a} className="text-amber-800 flex items-start gap-1.5">
                <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" /> {a}
              </p>
            ))}
            <dl className="grid sm:grid-cols-3 gap-x-6 gap-y-1">
              {(
                [
                  ['Desde', 'From'],
                  ['Hasta', 'To'],
                  ['Puerto de destino (código)', 'DestinationPort'],
                  ['Exportación', 'Export'],
                  ['Despacho', 'ShipmentDate'],
                  ['Entrega', 'DeliveryDate'],
                  ['Subtotal', 'SubTotal'],
                  ['Total', 'Total'],
                  ['Peso bruto', 'GrossWeight'],
                ] as Array<[string, string]>
              ).map(([label, k]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-gray-500">{label}:</dt>
                  <dd className="text-gray-900 tabular-nums">{s(vista.encabezado[k])}</dd>
                </div>
              ))}
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 text-left">
                    <th className="py-1 pr-3">Referencia</th>
                    <th className="py-1 pr-3">Línea</th>
                    <th className="py-1 pr-3">Partida</th>
                    <th className="py-1 pr-3 text-right">Kilos</th>
                    <th className="py-1 pr-3 text-right">Precio</th>
                    <th className="py-1">Maestro de Empaque</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vista.lineas.map((l) => {
                    const emp = vista.empaque.find((e) => e.referencia === l.referencia);
                    return (
                      <tr key={l.referencia}>
                        <td className="py-1 pr-3 font-medium">{l.referencia}</td>
                        <td className="py-1 pr-3">{l.linea}</td>
                        <td className="py-1 pr-3 tabular-nums">{l.partida}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{l.kilos.toLocaleString('es-CO')}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{l.precio}</td>
                        <td className={`py-1 ${emp?.valido ? 'text-emerald-700' : 'text-red-700'}`}>{emp ? (emp.valido ? 'Sí' : emp.mensaje) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Proformas creadas ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Proformas creadas</h2>
          <button className={btnSecondary} onClick={() => void cargar()}>
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
        </div>
        {lista === null ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no se ha creado ninguna proforma desde aquí.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3">Proforma</th>
                  <th className="py-2 pr-3">Cliente / destino</th>
                  <th className="py-2 pr-3">Orden de compra</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Creada</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lista.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="py-2 pr-3">
                      <span className="font-semibold text-gray-900 tabular-nums">{p.numeroPF ? `PF ${p.numeroPF}` : '—'}</span>
                      {p.codigoInterno && <span className="block text-xs text-gray-400 tabular-nums">interno {p.codigoInterno}</span>}
                      {p.servidor === 'pruebas' && <span className="inline-block mt-0.5 px-1.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">PRUEBAS</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-gray-900">{p.destino}</span>
                      <span className="block text-xs text-gray-500">{p.cliente}</span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{p.ordenCompra}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO[p.estado].cls}`}>{ESTADO[p.estado].label}</span>
                      {p.error && <span className="block mt-1 text-xs text-red-700 max-w-sm whitespace-normal">{p.error}</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-500">
                      {fecha(p.createdAt)}
                      {p.creadoPorNombre ? <span className="block">{p.creadoPorNombre}</span> : null}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {(p.estado === 'pendiente' || p.estado === 'encabezado' || p.estado === 'revisar') && (
                        <button className={btnSecondary} disabled={!!busy} onClick={() => void accion(p, 'reintentar')}>
                          {busy === `${p.id}:reintentar` ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Reintentar
                        </button>
                      )}
                      {p.estado === 'creada' && (
                        <button className={btnPrimary} disabled={!!busy} onClick={() => void accion(p, 'orden-venta')}>
                          {busy === `${p.id}:orden-venta` ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Crear orden de venta
                        </button>
                      )}
                      {p.estado === 'ov_creada' && (
                        <button className={btnPrimary} disabled={!!busy} onClick={() => void accion(p, 'activar')}>
                          {busy === `${p.id}:activar` ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Activar orden de venta
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
