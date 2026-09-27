'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { ComercialConfig } from '@/types';
import { AlertCircle, CheckCircle2, FlaskConical, Loader2, Mail, Paperclip, Save } from 'lucide-react';
import { btnPrimary, btnSecondary, inputCls } from './comun';

const POR_DEFECTO_LABEL: Record<string, string> = {
  modo: 'Modo (supervisado / automático)',
  seguimientoFirma: 'Recordatorios al cliente para firmar',
  seguimientoCartera: 'Seguimiento al comercial mientras cartera no libera',
  ejemplosOc: 'Ejemplos reales de órdenes de compra (para la IA)',
};

/** Configuración del flujo: interruptor del buzón, freno de mano y reglas de seguimiento. */
export function ConfigPanel() {
  const [cfg, setCfg] = useState<ComercialConfig | null>(null);
  const [firma, setFirma] = useState('');
  const [firmaLuego, setFirmaLuego] = useState('');
  const [cartera, setCartera] = useState('');
  const [carteraLuego, setCarteraLuego] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getComercialConfig()
      .then((c) => {
        setCfg(c);
        setFirma(c.config.seguimientoFirma.intervalosHoras.join(', '));
        setFirmaLuego(c.config.seguimientoFirma.luegoCadaHoras?.toString() ?? '');
        setCartera(c.config.seguimientoCartera.intervalosHoras.join(', '));
        setCarteraLuego(c.config.seguimientoCartera.luegoCadaHoras?.toString() ?? '');
      })
      .catch((err) => setError(extractMessage(err, 'No se pudo cargar la configuración.')));
  }, []);

  const horas = (s: string) => s.split(/[,\s]+/).filter(Boolean).map(Number);

  async function guardar(cambios: Record<string, unknown>) {
    try {
      setBusy(true);
      setError('');
      setMsg('');
      setCfg(await api.updateComercialConfig(cambios));
      setMsg('Guardado.');
    } catch (err) {
      setError(extractMessage(err, 'No se pudo guardar.'));
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return error ? <p className="text-sm text-red-700">{error}</p> : <Loader2 className="w-6 h-6 animate-spin text-[#F47735]" />;
  const c = cfg.config;

  return (
    <div className="space-y-5">
      {cfg.porDefecto.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          <p className="font-semibold">Usando valores por defecto (propuesta de la reunión, pendientes de confirmar por Customer Service):</p>
          <ul className="list-disc ml-5 text-xs mt-1">
            {cfg.porDefecto.map((k) => (
              <li key={k}>{POR_DEFECTO_LABEL[k] ?? k}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">Buzón de pedidos</h3>
        <p className="text-sm text-gray-600">
          Encendido: las órdenes de compra que lleguen al buzón abren un caso aquí, y las respuestas de los clientes a la Proforma se reconocen por el hilo.
          Apagado: el buzón sigue funcionando como hoy.
        </p>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={c.habilitado} disabled={busy} onChange={(e) => guardar({ habilitado: e.target.checked })} />
          {c.habilitado ? 'Encendido' : 'Apagado'}
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">Freno de mano</h3>
        <p className="text-sm text-gray-600">
          Supervisado: cada escritura en OBEN MAS (crear, aprobar, rechazar, modificar, activar) espera la confirmación de una persona. Automático: sin
          confirmación.
        </p>
        <div className="flex gap-2">
          {(['supervisado', 'automatico'] as const).map((m) => (
            <button key={m} disabled={busy} onClick={() => guardar({ modo: m })} className={c.modo === m ? btnPrimary : btnSecondary}>
              {m === 'supervisado' ? 'Supervisado' : 'Automático'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">Seguimientos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="font-medium text-gray-700">Recordatorios al cliente (firma de la Proforma)</p>
            <label className="block text-xs text-gray-500">Horas entre recordatorios, en orden</label>
            <input value={firma} onChange={(e) => setFirma(e.target.value)} className={`${inputCls} w-full`} placeholder="24, 24, 24" />
            <label className="block text-xs text-gray-500">Después, cada (horas; vacío = no más)</label>
            <input value={firmaLuego} onChange={(e) => setFirmaLuego(e.target.value)} className={`${inputCls} w-full`} placeholder="168" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-gray-700">Seguimiento al comercial (cartera)</p>
            <label className="block text-xs text-gray-500">Horas entre correos, en orden</label>
            <input value={cartera} onChange={(e) => setCartera(e.target.value)} className={`${inputCls} w-full`} placeholder="24, 24, 24" />
            <label className="block text-xs text-gray-500">Después, cada (horas; vacío = no más)</label>
            <input value={carteraLuego} onChange={(e) => setCarteraLuego(e.target.value)} className={`${inputCls} w-full`} placeholder="168" />
          </div>
        </div>
        <button
          className={btnPrimary}
          disabled={busy}
          onClick={() =>
            guardar({
              seguimientoFirma: { intervalosHoras: horas(firma), luegoCadaHoras: firmaLuego ? Number(firmaLuego) : null },
              seguimientoCartera: { intervalosHoras: horas(cartera), luegoCadaHoras: carteraLuego ? Number(carteraLuego) : null },
            })
          }
        >
          <Save className="w-4 h-4" /> Guardar seguimientos
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1 text-sm text-gray-600">
        <h3 className="font-semibold text-gray-900">Lectura de órdenes de compra</h3>
        <p>
          Hoy: <strong>{c.extractor.provider === 'ollama' ? `IA local (${c.extractor.model})` : 'reglas'}</strong> · {c.ejemplosOc.length} ejemplo(s) de OC cargados.
          La referencia Oben siempre sale de la tabla de Equivalencias.
        </p>
      </div>

      {msg && (
        <p className="text-sm text-green-700 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> {msg}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-700 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4" /> {error}
        </p>
      )}
    </div>
  );
}

/** Orden de compra ingresada a mano (mismo camino que un correo del buzón). */
export function NuevaOc({ onCreada }: { onCreada: (id: string) => void }) {
  const [form, setForm] = useState({ from: '', subject: '', body: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function enviar() {
    try {
      setBusy(true);
      setError('');
      const attachments = await Promise.all(
        files.map(
          (f) =>
            new Promise<{ filename: string; contentType: string; contentBase64: string }>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => {
                const url = String(r.result ?? '');
                resolve({ filename: f.name, contentType: f.type || 'application/octet-stream', contentBase64: url.slice(url.indexOf(',') + 1) });
              };
              r.onerror = () => reject(new Error(`No se pudo leer ${f.name}`));
              r.readAsDataURL(f);
            }),
        ),
      );
      const caso = await api.createComercialOc({ ...form, ...(attachments.length ? { attachments } : {}) });
      setForm({ from: '', subject: '', body: '' });
      setFiles([]);
      onCreada(caso.id);
    } catch (err) {
      setError(extractMessage(err, 'No se pudo registrar la orden de compra.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3 max-w-3xl">
      <p className="text-sm text-gray-600">
        Para una orden que llegó por otro medio o para probar: el remitente define de qué cliente es (su dominio debe estar autorizado en el maestro de clientes).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="relative">
          <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="compras@cliente.com" className={`${inputCls} w-full pl-9`} />
        </div>
        <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Asunto" className={inputCls} />
      </div>
      <textarea
        value={form.body}
        onChange={(e) => setForm({ ...form, body: e.target.value })}
        rows={8}
        placeholder={'Texto del correo, tal cual lo mandó el cliente.\nEj.: - BOPP 15, 1.000 kg, ancho 425 mm'}
        className={`${inputCls} w-full font-mono text-xs`}
      />
      <label className="inline-flex items-center gap-2 text-sm text-gray-600">
        <Paperclip className="w-4 h-4" />
        <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.txt,image/*" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="text-sm" />
      </label>
      <div>
        <button className={btnPrimary} disabled={busy || !form.from.trim() || !form.body.trim()} onClick={enviar}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Registrar orden de compra
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-700 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4" /> {error}
        </p>
      )}
    </div>
  );
}

/** Lo que en la vida real hacen Planeación, cartera y producción en OBEN MAS — solo existe mientras OBEN MAS está simulado. */
export function SimuladorPanel({ onChange }: { onChange: () => void }) {
  const [pf, setPf] = useState('');
  const [fecha, setFecha] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function run(nombre: string, fn: () => Promise<unknown>, ok: (r: unknown) => string) {
    try {
      setBusy(nombre);
      setError('');
      setMsg('');
      setMsg(ok(await fn()));
      onChange();
    } catch (err) {
      setError(extractMessage(err, 'El simulador rechazó la operación.'));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-purple-900">
        <FlaskConical className="w-5 h-5" />
        <h3 className="font-semibold">Simulador (OBEN MAS simulado)</h3>
      </div>
      <p className="text-xs text-purple-900">
        Mientras Oben no entrega sus APIs y Alejandra sus datos: cliente piloto y equivalencias SIMULADOS (dominio .example, referencias SIM-), órdenes de
        ejemplo y las acciones que en la vida real hacen personas en OBEN MAS. Con OBEN MAS real conectado, todo esto se rechaza.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className={btnSecondary} disabled={!!busy} onClick={() => run('demo', () => api.comercialSimDatosDemo(), (r) => `Datos demo listos (${(r as { equivalenciasCreadas: number }).equivalenciasCreadas} equivalencias nuevas).`)}>
          Cargar cliente y equivalencias demo
        </button>
        <button className={btnSecondary} disabled={!!busy} onClick={() => run('oc', () => api.comercialSimOcDemo(), () => 'Orden de compra de ejemplo recibida.')}>
          Recibir una OC de ejemplo
        </button>
        <button className={btnSecondary} disabled={!!busy} onClick={() => run('procesar', () => api.comercialSimProcesar(), (r) => `Procesados ${(r as { procesados: number }).procesados} caso(s).`)}>
          Procesar ahora
        </button>
      </div>
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <input value={pf} onChange={(e) => setPf(e.target.value)} placeholder="Proforma (ej. SIM-95001)" className={inputCls} />
        {(
          [
            ['cubicar', 'Planeación cubica'],
            ['liberar-cartera', 'Cartera libera'],
            ['producir-no-despachar', 'Producir No Despachar'],
          ] as const
        ).map(([c, label]) => (
          <button key={c} className={btnSecondary} disabled={!!busy || !pf.trim()} onClick={() => run(c, () => api.comercialSimControl(pf.trim(), c), () => `${label}: listo.`)}>
            {label}
          </button>
        ))}
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        <button
          className={btnSecondary}
          disabled={!!busy || !pf.trim() || !fecha}
          onClick={() => run('entrega', () => api.comercialSimControl(pf.trim(), 'cambiar-entrega', fecha), () => 'Fecha de entrega cambiada.')}
        >
          Cambiar entrega
        </button>
      </div>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
