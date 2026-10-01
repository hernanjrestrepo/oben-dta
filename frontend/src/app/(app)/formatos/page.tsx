'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { FormatoEnvio } from '@/types';
import { AlertCircle, ChevronDown, Eye, FileText, Loader2, RotateCcw, Save } from 'lucide-react';

function errMsg(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' · ') : m || fallback;
}

/**
 * Formatos de correo (WO-027): asunto y cuerpo de cada documento o reporte
 * que envía Oben Xmart, con variables y vista previa. Sin cambios, cada
 * correo sale con el texto de siempre.
 */
export default function FormatosPage() {
  const { user } = useAuthStore();
  const puedeEditar = !!user?.permissions?.includes('configuracion.update');
  const [formatos, setFormatos] = useState<FormatoEnvio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    api
      .getFormatos()
      .then(setFormatos)
      .catch((err) => setError(errMsg(err, 'No se pudieron cargar los formatos.')))
      .finally(() => setLoading(false));
  }, []);

  const grupos = [...new Set(formatos.map((f) => f.grupo))];
  const actualizar = (f: FormatoEnvio) => setFormatos((xs) => xs.map((x) => (x.clave === f.clave ? f : x)));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="w-6 h-6 text-[#F47735]" />
          Formatos de correo
        </h1>
        <p className="text-gray-500 mt-1">
          El asunto y el texto de cada correo que envía Oben Xmart. Usa las variables entre llaves (por ejemplo{' '}
          <code className="px-1 rounded bg-gray-100 text-gray-700">{'{ov}'}</code>) y el sistema pone el dato real. Los adjuntos y
          el contenido de los reportes no cambian.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        grupos.map((g) => (
          <div key={g} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{g}</h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {formatos
                .filter((f) => f.grupo === g)
                .map((f) => (
                  <div key={f.clave}>
                    <button
                      onClick={() => setAbierto(abierto === f.clave ? null : f.clave)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 flex items-center gap-2">
                          {f.label}
                          {f.personalizado && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-[#C4521A]">personalizado</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 truncate">Asunto: {f.asunto}</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition ${abierto === f.clave ? 'rotate-180' : ''}`} />
                    </button>
                    {abierto === f.clave && <Editor formato={f} puedeEditar={puedeEditar} onGuardado={actualizar} />}
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Editor({ formato, puedeEditar, onGuardado }: { formato: FormatoEnvio; puedeEditar: boolean; onGuardado: (f: FormatoEnvio) => void }) {
  const [asunto, setAsunto] = useState(formato.asunto);
  const [cuerpo, setCuerpo] = useState(formato.cuerpo);
  const [vista, setVista] = useState<{ asunto: string; cuerpoHtml: string } | null>(null);
  const [ocupado, setOcupado] = useState<'guardar' | 'restablecer' | 'vista' | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const cuerpoRef = useRef<HTMLTextAreaElement>(null);
  const cambios = asunto !== formato.asunto || cuerpo !== formato.cuerpo;

  function insertar(variable: string) {
    const t = cuerpoRef.current;
    const token = `{${variable}}`;
    if (!t) return setCuerpo((c) => c + token);
    const [a, b] = [t.selectionStart, t.selectionEnd];
    setCuerpo((c) => c.slice(0, a) + token + c.slice(b));
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(a + token.length, a + token.length);
    });
  }

  async function correr(tipo: 'guardar' | 'restablecer' | 'vista') {
    try {
      setOcupado(tipo);
      setError('');
      setOk('');
      if (tipo === 'vista') {
        setVista(await api.previewFormato(formato.clave, asunto, cuerpo));
      } else if (tipo === 'guardar') {
        const f = await api.saveFormato(formato.clave, asunto, cuerpo);
        onGuardado(f);
        setOk('Guardado. Los próximos correos salen con este formato.');
      } else {
        if (!confirm('¿Volver al texto por defecto del sistema?')) return;
        const f = await api.resetFormato(formato.clave);
        setAsunto(f.asunto);
        setCuerpo(f.cuerpo);
        onGuardado(f);
        setOk('Se restableció el texto por defecto.');
      }
    } catch (err) {
      setError(errMsg(err, 'No se pudo completar la acción.'));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="px-4 pb-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Asunto</label>
        <input
          value={asunto}
          onChange={(e) => setAsunto(e.target.value)}
          disabled={!puedeEditar}
          maxLength={300}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Texto del correo</label>
        <textarea
          ref={cuerpoRef}
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
          disabled={!puedeEditar}
          rows={5}
          maxLength={5000}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50"
        />
        <p className="text-[11px] text-gray-500 mt-1">Una línea en blanco separa párrafos. La lista de adjuntos se agrega sola cuando aplica.</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-gray-500">Variables:</span>
        {formato.variables.map((v) => (
          <button
            key={v.nombre}
            onClick={() => insertar(v.nombre)}
            disabled={!puedeEditar}
            title={v.descripcion}
            className="text-xs px-2 py-0.5 rounded-full border border-gray-300 bg-white text-gray-700 hover:border-[#F47735] hover:text-[#C4521A] disabled:opacity-60"
          >
            {`{${v.nombre}}`}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => correr('vista')} disabled={!!ocupado} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
          {ocupado === 'vista' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Vista previa
        </button>
        {puedeEditar && (
          <>
            <button
              onClick={() => correr('guardar')}
              disabled={!!ocupado || !cambios}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {ocupado === 'guardar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </button>
            {formato.personalizado && (
              <button onClick={() => correr('restablecer')} disabled={!!ocupado} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
                <RotateCcw className="w-4 h-4" /> Texto por defecto
              </button>
            )}
          </>
        )}
      </div>

      {vista && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          <p className="text-xs text-gray-500">Así se vería (con datos de ejemplo de la OV 11187):</p>
          <p className="mt-1 font-semibold text-gray-900">{vista.asunto}</p>
          {/* HTML generado por el servidor con todo el texto escapado. */}
          <div className="mt-1 text-gray-700 space-y-2" dangerouslySetInnerHTML={{ __html: vista.cuerpoHtml }} />
        </div>
      )}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
