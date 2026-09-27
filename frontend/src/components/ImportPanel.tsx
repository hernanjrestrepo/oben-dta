'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { extractMessage } from '@/lib/errors';
import type { TabularImportInput, TabularImportResult } from '@/types';

/**
 * Carga masiva desde Excel/CSV en dos pasos: primero se revisa (dryRun, no
 * guarda nada) y solo si no hay errores se carga. El backend es "todo o
 * nada": si una fila tiene un error, no se escribe ninguna.
 */
export function ImportPanel({
  title,
  columns,
  onImport,
  onDone,
}: {
  title: string;
  /** Columnas que se reconocen (no importan mayúsculas, tildes ni espacios). */
  columns: string[];
  onImport: (dto: TabularImportInput) => Promise<TabularImportResult>;
  onDone?: () => void;
}) {
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [preview, setPreview] = useState<TabularImportResult | null>(null);
  const [done, setDone] = useState<TabularImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function pick(f: File | undefined) {
    setPreview(null);
    setDone(null);
    setError('');
    if (!f) return setFile(null);
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      setFile({ name: f.name, base64: url.slice(url.indexOf(',') + 1) });
    };
    reader.onerror = () => setError('No se pudo leer el archivo.');
    reader.readAsDataURL(f);
  }

  async function run(dryRun: boolean) {
    if (!file) return;
    try {
      setBusy(true);
      setError('');
      const r = await onImport({ fileBase64: file.base64, filename: file.name, dryRun });
      if (dryRun) setPreview(r);
      else {
        setDone(r);
        setPreview(null);
        onDone?.();
      }
    } catch (err) {
      setError(extractMessage(err, 'No se pudo procesar el archivo.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5 text-[#F47735]" />
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      <p className="text-xs text-gray-500">
        Excel (.xlsx/.xls) o CSV, primera hoja. Columnas: <span className="font-mono">{columns.join(' · ')}</span>. Primero se revisa sin guardar; si
        una sola fila tiene un error no se carga ninguna.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => pick(e.target.files?.[0])}
          className="text-sm text-gray-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700"
        />
        <button
          onClick={() => run(true)}
          disabled={!file || busy}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          Revisar (sin guardar)
        </button>
        <button
          onClick={() => run(false)}
          disabled={!preview || preview.errores.length > 0 || busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <Upload className="w-4 h-4" /> Cargar
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-700 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4" /> {error}
        </p>
      )}
      {preview && (
        <div className="text-sm space-y-2">
          <p className="text-gray-700">
            {preview.total} fila(s): <strong>{preview.creados}</strong> nueva(s), <strong>{preview.actualizados}</strong> a actualizar.
          </p>
          {preview.errores.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="font-medium text-red-700 mb-1">No se carga nada hasta corregir {preview.errores.length} fila(s):</p>
              <ul className="list-disc ml-5 text-red-700 text-xs space-y-0.5">
                {preview.errores.slice(0, 30).map((e) => (
                  <li key={e.fila}>
                    Fila {e.fila}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {done && (
        <p className="text-sm text-green-700 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> Cargado: {done.creados} nueva(s), {done.actualizados} actualizada(s).
        </p>
      )}
    </div>
  );
}
