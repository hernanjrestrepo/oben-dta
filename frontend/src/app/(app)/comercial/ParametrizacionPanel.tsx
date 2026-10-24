'use client';

import { useT } from '@/i18n/idioma';
import { useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import { SimuladoBadge, btnPrimary, btnSecondary, inputCls } from './comun';

type Fila = Record<string, unknown>;

/** Cómo se muestra cada dato de la parametrización que Comercial dejó definida en Oben para un cliente y su destino. */
const CAMPOS: Array<[string, string]> = [
  ['Condicion_Comercial', 'Condición comercial'],
  ['Moneda', 'Moneda'],
  ['Incoterms', 'Incoterm'],
  ['Desde', 'Desde'],
  ['Hasta', 'Hasta'],
  ['CiudadPuertoDestino', 'Puerto de destino'],
  ['PaisPuertoDestino', 'País del puerto'],
  ['Ciudad', 'Ciudad'],
  ['Pais', 'País'],
  ['Peso_Bruto_Maximo', 'Peso bruto máximo (kg)'],
  ['EtiquetaPallet', 'Etiqueta de pallet'],
  ['EtiquetaBobina', 'Etiqueta de bobina'],
  ['Nota_Etiqueta', 'Nota de etiqueta'],
  ['Nota_Operativa', 'Nota operativa'],
  ['Nota_Especial', 'Nota especial'],
  ['Consignado', 'Consignado'],
  ['Notificado', 'Notificado'],
  ['Correo_Cliente', 'Correo del cliente'],
  ['Correo_Comercial', 'Correo del comercial'],
];

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Parametrización cliente-destino de Oben (APICustomerParameterizationParadixe): lo que Comercial ya dejó definido
 * para cada cliente y destino (condición de pago, moneda, Incoterm, puerto, etiquetas, notas, correos). Se busca el
 * cliente en el maestro de Oben y se elige uno de sus destinos (Target_Customer). Solo lectura.
 */
export function ParametrizacionPanel() {
  const t = useT();
  const [buscar, setBuscar] = useState('');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [simuladoMaestro, setSimuladoMaestro] = useState(false);
  const [cliente, setCliente] = useState<{ codigo: number; nombre: string } | null>(null);
  const [resultado, setResultado] = useState<{ destino: string; datos: Record<string, unknown> | null; simulado: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function buscarClientes() {
    if (buscar.trim().length < 3) return setError('Escribe al menos 3 letras del cliente.');
    setBusy('buscar');
    setError('');
    setCliente(null);
    setResultado(null);
    try {
      const r = await api.getMaestroComercial('clientes', buscar.trim(), 300);
      setFilas(r.items);
      setSimuladoMaestro(r.simulado);
      if (r.items.length === 0) setError('Oben no tiene clientes con ese nombre.');
    } catch (err) {
      setError(extractMessage(err, 'No se pudo consultar el maestro de clientes de Oben.'));
    } finally {
      setBusy('');
    }
  }

  async function consultar(destino: string) {
    if (!cliente) return;
    setBusy(destino);
    setError('');
    try {
      const r = await api.getParametrizacionComercial(cliente.codigo, destino);
      setResultado({ destino, ...r });
    } catch (err) {
      setResultado(null);
      setError(extractMessage(err, 'No se pudo consultar la parametrización.'));
    } finally {
      setBusy('');
    }
  }

  // Clientes distintos encontrados (el maestro trae una fila por destino).
  const clientes = [...new Map(filas.map((f) => [Number(f.CodSec_Entity), s(f.Nombre_Cliente)])).entries()].map(([codigo, nombre]) => ({ codigo, nombre }));
  const destinos = cliente ? filas.filter((f) => Number(f.CodSec_Entity) === cliente.codigo) : [];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900">{t('Parametrización de Oben por cliente y destino')}</h2>
          <p className="text-sm text-gray-500">
            {t('Lo que Comercial ya definió en Oben para cada cliente y su destino: se usa para llenar la Proforma sin digitarlo de nuevo. Solo lectura.')}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            className={`${inputCls} flex-1`}
            placeholder={t('Buscar cliente en el maestro de Oben (ej. OBEN US, ALADDIN…)')}
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void buscarClientes()}
          />
          <button className={btnPrimary} onClick={() => void buscarClientes()} disabled={busy === 'buscar'}>
            {busy === 'buscar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}{' '}{t('Buscar')}
          </button>
        </div>
        {simuladoMaestro && (
          <p className="text-xs">
            <SimuladoBadge items={['El maestro de clientes viene del simulador, no de Oben.']} />{' '}{t('datos ficticios')}
          </p>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
      </div>

      {clientes.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('1. Cliente (')}{clientes.length})</h3>
            <ul className="max-h-72 overflow-auto divide-y divide-gray-100">
              {clientes.map((c) => (
                <li key={c.codigo}>
                  <button
                    onClick={() => {
                      setCliente(c);
                      setResultado(null);
                    }}
                    className={`w-full text-left px-2 py-2 text-sm hover:bg-gray-50 ${cliente?.codigo === c.codigo ? 'bg-orange-50 font-medium' : ''}`}
                  >
                    {c.nombre} <span className="text-gray-400 tabular-nums">· {c.codigo}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('2. Destino')}{' '}{cliente ? `(${destinos.length})` : ''}</h3>
            {!cliente ? (
              <p className="text-sm text-gray-400">{t('Elige un cliente.')}</p>
            ) : (
              <ul className="max-h-72 overflow-auto divide-y divide-gray-100">
                {destinos.map((d, i) => (
                  <li key={i} className="py-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 break-words">{s(d.Target_Customer) || '(sin destino)'}</p>
                      <p className="text-xs text-gray-500 whitespace-pre-line break-words">{s(d.Direccion_Destino)}</p>
                    </div>
                    <button className={btnSecondary} disabled={!!busy || !s(d.Target_Customer)} onClick={() => void consultar(s(d.Target_Customer))}>
                      {busy === s(d.Target_Customer) ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ver'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {resultado && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-semibold text-gray-900">
              {cliente?.nombre} → {resultado.destino}
            </h3>
            {resultado.simulado && <SimuladoBadge items={['La parametrización viene del simulador, no de Oben.']} />}
          </div>
          {!resultado.datos ? (
            <p className="text-sm text-gray-500">{t('Comercial no tiene una parametrización definida para este cliente y destino en Oben.')}</p>
          ) : (
            <dl className="grid md:grid-cols-2 gap-x-6">
              {CAMPOS.filter(([k]) => s(resultado.datos?.[k]) !== '').map(([k, label]) => (
                <div key={k} className="py-1.5 border-b border-gray-100 grid grid-cols-[10rem_1fr] gap-2 text-sm">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="text-gray-900 whitespace-pre-line break-words">{s(resultado.datos?.[k])}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
