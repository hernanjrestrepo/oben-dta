'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ConexionMicrosoft, DiagnosticoSharepoint } from '@/types';
import { AlertCircle, CheckCircle2, FileSpreadsheet, KeyRound, Loader2, Mail, PlayCircle, PlugZap, ShieldAlert, XCircle } from 'lucide-react';

function errMsg(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' · ') : m || fallback;
}

const RESULTADO: Record<DiagnosticoSharepoint['resultado'], { titulo: string; cls: string }> = {
  ok: { titulo: 'Conectado: Oben Xmart puede leer el Excel', cls: 'bg-green-50 border-green-200 text-green-800' },
  sin_permiso: { titulo: 'Sin permiso: Microsoft no deja entrar a la app', cls: 'bg-red-50 border-red-200 text-red-800' },
  sin_token: { titulo: 'Microsoft rechazó las credenciales de la app', cls: 'bg-red-50 border-red-200 text-red-800' },
  sin_credenciales: { titulo: 'La app de Microsoft no está configurada en el servidor', cls: 'bg-red-50 border-red-200 text-red-800' },
  no_encontrado: { titulo: 'Entró, pero no encontró el archivo', cls: 'bg-amber-50 border-amber-200 text-amber-800' },
  error: { titulo: 'La prueba no se pudo completar', cls: 'bg-amber-50 border-amber-200 text-amber-800' },
};

function Dato({ k, v, mono = false }: { k: string; v: string | null; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-3 py-1.5 border-b border-gray-100 last:border-0 text-sm">
      <span className="text-gray-500">{k}</span>
      <span className={`text-gray-900 break-all ${mono ? 'font-mono text-[13px]' : ''}`}>{v ?? '—'}</span>
    </div>
  );
}

/**
 * Conexión de Oben Xmart con Microsoft 365. Muestra con qué app entra el sistema y prueba EN VIVO, desde el
 * servidor, si puede abrir el cuadro de facturación en SharePoint: el token que da Microsoft, sus permisos y
 * la respuesta de cada intento. Solo lectura; nunca muestra el secreto ni el token.
 */
export default function ConexionesPage() {
  const [conf, setConf] = useState<ConexionMicrosoft | null>(null);
  const [diag, setDiag] = useState<DiagnosticoSharepoint | null>(null);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getConexionMicrosoft().then(setConf).catch((err) => setError(errMsg(err, 'No se pudo leer la configuración.')));
  }, []);

  const probar = async () => {
    setProbando(true);
    setError('');
    try {
      setDiag(await api.probarSharepoint());
    } catch (err) {
      setError(errMsg(err, 'No se pudo ejecutar la prueba.'));
    } finally {
      setProbando(false);
    }
  };

  const c = diag ?? conf;
  const r = diag ? RESULTADO[diag.resultado] : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PlugZap className="w-6 h-6 text-[#F47735]" />
          Conexión con Microsoft 365
        </h1>
        <p className="text-gray-500 mt-1">
          Cómo entra Oben Xmart a Microsoft 365 (correo y SharePoint) y si puede leer el cuadro diario de facturación. La prueba se
          ejecuta desde el servidor de Oben Xmart, en solo lectura.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <KeyRound className="w-4 h-4 text-[#F47735]" /> Aplicación con la que entra el sistema
          </h2>
          <Dato k="Nombre en Microsoft" v={c?.app.nombre ?? (diag ? null : 'se ve al probar')} />
          <Dato k="Application (client) ID" v={c?.app.clientId ?? null} mono />
          <Dato k="Tenant de Microsoft" v={c?.app.azureTenantId ?? null} mono />
          <Dato k="Secreto" v={c?.app.secreto ?? null} />
          <p className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg p-3">{c?.app.autenticacion}</p>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <FileSpreadsheet className="w-4 h-4 text-[#F47735]" /> Archivo que se quiere leer
          </h2>
          <Dato k="Archivo" v={c?.archivo.nombre ?? null} />
          <Dato k="Sitio de SharePoint" v={c?.archivo.sitio ?? null} mono />
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <Mail className="w-4 h-4 text-gray-400" />
            Buzón de correo del sistema: <span className="font-medium text-gray-900">{c?.buzonCorreo ?? '—'}</span>
          </div>
          <button
            onClick={probar}
            disabled={probando}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#F47735] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e0652a] disabled:opacity-60"
          >
            {probando ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            {probando ? 'Probando con Microsoft…' : 'Probar conexión con el Excel'}
          </button>
        </section>
      </div>

      {diag && r && (
        <>
          <section className={`rounded-xl border p-5 ${r.cls}`}>
            <div className="flex items-center gap-2 font-semibold">
              {diag.resultado === 'ok' ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              {r.titulo}
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="font-semibold inline">Qué pasó: </dt><dd className="inline">{diag.explicacion.quePaso}</dd></div>
              <div><dt className="font-semibold inline">Qué significa: </dt><dd className="inline">{diag.explicacion.queSignifica}</dd></div>
              <div><dt className="font-semibold inline">Qué hacer: </dt><dd className="inline">{diag.explicacion.queHacer}</dd></div>
            </dl>
            <p className="mt-3 text-xs opacity-75">Probado el {new Date(diag.probadoEn).toLocaleString('es-CO')}</p>
          </section>

          {diag.token && (
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Permisos que Microsoft le da HOY a la app</h2>
              <p className="text-xs text-gray-500 mb-3">
                Leídos del token que Microsoft acaba de emitir{diag.token.emitido ? ` (${new Date(diag.token.emitido).toLocaleString('es-CO')})` : ''}. Para leer el
                Excel debe aparecer uno de SharePoint (Sites.Selected o Sites.Read.All).
              </p>
              <div className="flex flex-wrap gap-2">
                {diag.token.permisos.length === 0 && <span className="text-sm text-gray-500">(ninguno)</span>}
                {diag.token.permisos.map((p) => (
                  <span
                    key={p}
                    className={`px-2.5 py-1 rounded-full text-xs font-mono border ${diag.token!.permisosSharepoint.includes(p) ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-700'}`}
                  >
                    {p}
                  </span>
                ))}
                {diag.token.permisosSharepoint.length === 0 && (
                  <span className="px-2.5 py-1 rounded-full text-xs border bg-red-50 border-red-200 text-red-700">Falta: Sites.Selected</span>
                )}
              </div>
            </section>
          )}

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Intentos, uno por uno</h2>
            <ol className="space-y-3">
              {diag.pasos.map((p, i) => (
                <li key={i} className="flex gap-3">
                  {p.ok ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {i + 1}. {p.paso}{' '}
                      <span className={`ml-1 px-1.5 py-0.5 rounded text-[11px] font-mono ${p.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {p.status ?? '—'}
                      </span>
                    </p>
                    <p className="text-[12px] font-mono text-gray-500 break-all">{p.solicitud}</p>
                    <p className="text-sm text-gray-700">{p.detalle}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {diag.hojas.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Hojas del Excel</h2>
              <ul className="text-sm space-y-1">
                {diag.hojas.map((h) => (
                  <li key={h.nombre}>
                    <span className="font-medium">{h.nombre}</span> — {h.filas ?? '?'} filas × {h.columnas ?? '?'} columnas{' '}
                    <span className="text-gray-400 font-mono text-xs">{h.rango}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
