'use client';

/**
 * Vista legible de la respuesta de un reporte de Oben: los campos sueltos como
 * ficha y cada lista como tabla (con sus sub-tablas, p. ej. Detalle1 → Detalle2).
 * Se muestra tal cual llega: no calcula ni completa nada.
 */

type Fila = Record<string, unknown>;

const esEscalar = (v: unknown) => v === null || v === undefined || ['string', 'number', 'boolean'].includes(typeof v);
const esFila = (v: unknown): v is Fila => !!v && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

function Filas({ filas }: { filas: unknown[] }) {
  if (filas.length === 0) return <p className="text-sm text-gray-500">Sin filas.</p>;
  if (!filas.every(esFila)) return <p className="text-sm text-gray-700">{filas.map(texto).join(', ')}</p>;
  const claves = [...new Set(filas.flatMap((f) => Object.keys(f)))];
  const anidadas = claves.filter((k) => filas.some((f) => Array.isArray(f[k])));
  const columnas = claves.filter((k) => !anidadas.includes(k) && filas.every((f) => esEscalar(f[k])));

  if (anidadas.length === 0) {
    return (
      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-600">
              {columnas.map((c) => (
                <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map((f, i) => (
              <tr key={i}>
                {columnas.map((c) => (
                  <td key={c} className="px-3 py-1.5 text-gray-800 whitespace-nowrap tabular-nums">{texto(f[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filas.map((f, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold text-gray-800">
            {columnas.map((c) => `${c}: ${texto(f[c])}`).join(' · ') || `Grupo ${i + 1}`}
          </p>
          {anidadas.map((k) => (Array.isArray(f[k]) ? <Filas key={k} filas={f[k] as unknown[]} /> : null))}
        </div>
      ))}
    </div>
  );
}

export default function VistaDatosOben({ data }: { data: unknown }) {
  if (Array.isArray(data)) return <Filas filas={data} />;
  if (!esFila(data)) return <p className="text-sm text-gray-700">{texto(data)}</p>;
  const campos = Object.entries(data).filter(([k, v]) => k !== 'simulated' && esEscalar(v));
  const listas = Object.entries(data).filter(([, v]) => Array.isArray(v));
  return (
    <div className="space-y-5">
      {campos.length > 0 && (
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          {campos.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-gray-500 uppercase">{k}</dt>
              <dd className="text-sm font-medium text-gray-900">{texto(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {listas.map(([k, v]) => (
        <div key={k}>
          <p className="text-xs font-medium text-gray-500 uppercase mb-2">{k}</p>
          <Filas filas={v as unknown[]} />
        </div>
      ))}
    </div>
  );
}
