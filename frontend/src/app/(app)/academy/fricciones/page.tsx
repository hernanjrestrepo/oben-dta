'use client';

import { useT } from '@/i18n/idioma';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowLeft, Bot, CheckCircle2, Code2, Loader2, Lock, MessageCircleQuestion, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import { useAuthStore } from '@/store/auth';
import type { FriccionesAcademy } from '@/types';
import { Anillo } from '../comun';

/**
 * Panel de fricciones (Hernán, 23-oct: "que vaya detectando dónde se generan más errores, dónde las personas tienen
 * más dificultad, encontrando las fricciones para mejorar la experiencia"). Solo administradores.
 */
export default function FriccionesPage() {
  const t = useT();
  const permisos = useAuthStore((s) => s.user?.permissions ?? []);
  const puedeEditar = permisos.includes('security.update');
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState<FriccionesAcademy | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getFriccionesAcademy(dias)
      .then((d) => {
        setDatos(d);
        setError('');
      })
      .catch((e) => setError(extractMessage(e, 'No se pudo cargar el panel de fricciones.')));
  }, [dias]);

  if (error) return <p className="max-w-3xl mx-auto mt-10 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">{error}</p>;
  if (!datos) return <div className="max-w-[1300px] mx-auto h-64 rounded-3xl bg-gray-100 academy-brillo" />;

  const maxFriccion = Math.max(1, ...datos.modulos.map((m) => m.friccion));
  const conFriccion = datos.modulos.filter((m) => m.friccion > 0);
  const totalObligatorios = datos.personas.reduce((n, p) => n + p.obligatorios, 0);
  const totalAprobados = datos.personas.reduce((n, p) => n + p.aprobados, 0);

  return (
    <div className="max-w-[1300px] mx-auto space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <Link href="/academy" className="inline-flex items-center gap-1 text-xs font-semibold text-[#C4521A]">
            <ArrowLeft className="w-3.5 h-3.5" />{' '}{t('Xmart Academy')}
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold text-gray-900 tracking-tight">{t('Panel de fricciones')}</h1>
          <p className="text-gray-600 mt-1 max-w-3xl">{t('Dónde se equivoca la gente, qué pregunta, qué falla en cada módulo, quién va atrasado y qué contenido quedó viejo frente al código. Con esto se prioriza qué mejorar.')}</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-white border border-gray-200 p-1">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDias(d)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${dias === d ? 'bg-[#2E2E31] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {d}{' '}{t('días')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi etiqueta="Errores en módulos" valor={datos.modulos.reduce((n, m) => n + m.errores, 0)} icono={AlertTriangle} />
        <Kpi etiqueta="Acciones bloqueadas" valor={datos.modulos.reduce((n, m) => n + m.bloqueos, 0)} icono={Lock} />
        <Kpi etiqueta="Preguntas a MIA" valor={datos.modulos.reduce((n, m) => n + m.preguntasMia, 0)} icono={Bot} />
        <div className="rounded-2xl bg-white border border-gray-100 p-5 flex items-center gap-4">
          <Anillo valor={totalObligatorios ? (totalAprobados / totalObligatorios) * 100 : 0} tam={64} grosor={6}>
            <span className="text-xs font-extrabold">{totalObligatorios ? Math.round((totalAprobados / totalObligatorios) * 100) : 0}%</span>
          </Anillo>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">{t('Certificación')}</p>
            <p className="text-sm font-semibold text-gray-900">
              {totalAprobados}{' '}{t('de')}{' '}{totalObligatorios}{' '}{t('quizzes obligatorios')}
            </p>
          </div>
        </div>
      </div>

      <Ajustes datos={datos} puedeEditar={puedeEditar} onGuardado={(a) => setDatos((d) => (d ? { ...d, ajustes: a } : d))} />

      <section className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-extrabold text-gray-900">{t('Módulos con más fricción')}</h2>
        <p className="text-sm text-gray-500">{t('Peso: errores ×2, bloqueos ×3, preguntas falladas ×2, preguntas a MIA ×1.')}</p>
        {conFriccion.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">{t('Sin fricción registrada en el periodo.')}</p>
        ) : (
          <div className="mt-5 space-y-4">
            {conFriccion.map((m) => (
              <div key={m.key}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/academy/${m.key}`} className="font-semibold text-gray-900 hover:text-[#C4521A]">
                    {m.titulo}
                  </Link>
                  <span className="text-xs text-gray-500">
                    {m.errores}{' '}{t('errores ·')}{' '}{m.bloqueos}{' '}{t('bloqueos ·')}{' '}{m.fallosQuiz}{' '}{t('quizzes con fallas ·')}{' '}{m.preguntasMia}{' '}{t('preguntas a MIA ·')}{' '}{m.aperturas}{' '}{t('lecturas')}
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#F9A66F] to-[#F47735]" style={{ width: `${(m.friccion / maxFriccion) * 100}%` }} />
                </div>
                {(m.erroresFrecuentes.length > 0 || m.ejemplosMia.length > 0) && (
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {m.erroresFrecuentes.map((e) => (
                      <p key={e.mensaje} className="flex gap-1.5 text-gray-600">
                        <AlertCircle className="w-3.5 h-3.5 text-[#F47735] shrink-0 mt-0.5" /> {e.mensaje} <span className="text-gray-400">×{e.veces}</span>
                      </p>
                    ))}
                    {m.ejemplosMia.map((q) => (
                      <p key={q} className="flex gap-1.5 text-gray-600">
                        <MessageCircleQuestion className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" /> «{q}»
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-extrabold text-gray-900">{t('Preguntas que más se fallan')}</h2>
          <p className="text-sm text-gray-500">{t('Si muchos fallan la misma, la pantalla o la explicación no es clara.')}</p>
          {datos.preguntasDificiles.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">{t('Aún no hay suficientes intentos.')}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {datos.preguntasDificiles.map((p) => (
                <li key={`${p.modulo}:${p.id}`} className="rounded-xl border border-gray-100 p-3">
                  <p className="text-sm font-semibold text-gray-900">{p.pregunta}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.modulo}{' '}{t('· falla el')}{' '}{p.tasaFallo} % ({p.fallos}{' '}{t('de')}{' '}{p.intentos})
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-[#F47735]" />{' '}{t('Contenido por revisar')}
          </h2>
          <p className="text-sm text-gray-500">{t('El código de estas pantallas cambió después de la última revisión de su lección.')}</p>
          {datos.porRevisar.length === 0 ? (
            <p className="mt-4 text-sm text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />{' '}{t('Todas las lecciones están al día con el código.')}
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {datos.porRevisar.map((r) => (
                <li key={r.modulo} className="rounded-xl border border-gray-100 p-3">
                  <p className="text-sm font-semibold text-gray-900">{r.titulo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('Lección revisada el')}{' '}{r.revisado}{t('; código cambiado el')}{' '}{r.codigoCambio} ({r.commit}): {r.resumen}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-[#F47735]" />{' '}{t('Avance por persona')}
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
              <tr>
                <th className="py-2 pr-3">{t('Persona')}</th>
                <th className="py-2 pr-3">{t('Lecciones vistas')}</th>
                <th className="py-2 pr-3">{t('Quizzes para operar')}</th>
                <th className="py-2">{t('Le falta')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {datos.personas.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5 pr-3">
                    <p className="font-semibold text-gray-900">{p.nombre}</p>
                    <p className="text-xs text-gray-500">{p.email}</p>
                  </td>
                  <td className="py-2.5 pr-3 text-gray-700">
                    {p.vistos}{' '}{t('de')}{' '}{p.modulos}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-28 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${p.aprobados === p.obligatorios ? 'bg-emerald-400' : 'bg-[#F47735]'}`} style={{ width: `${p.obligatorios ? (p.aprobados / p.obligatorios) * 100 : 100}%` }} />
                      </div>
                      <span className="text-xs text-gray-600">
                        {p.aprobados}/{p.obligatorios}
                      </span>
                      {p.exento && <span className="text-[10px] px-1.5 rounded bg-gray-100 text-gray-500">{t('exento')}</span>}
                    </div>
                  </td>
                  <td className="py-2.5 text-xs text-gray-600">{p.pendientes.length ? p.pendientes.join(', ') : <span className="text-emerald-700 font-semibold">{t('Al día')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ etiqueta, valor, icono: Icono }: { etiqueta: string; valor: number; icono: typeof Bot }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 p-5">
      <Icono className="w-5 h-5 text-[#F47735]" />
      <p className="mt-2 text-3xl font-extrabold text-gray-900">{valor}</p>
      <p className="text-[11px] uppercase tracking-wider text-gray-500">{etiqueta}</p>
    </div>
  );
}

function Ajustes({ datos, puedeEditar, onGuardado }: { datos: FriccionesAcademy; puedeEditar: boolean; onGuardado: (a: FriccionesAcademy['ajustes']) => void }) {
  const t = useT();
  const [exigir, setExigir] = useState(datos.ajustes.exigirCertificacion);
  const [minimo, setMinimo] = useState(datos.ajustes.puntajeMinimo);
  const [exentos, setExentos] = useState<string[]>(datos.ajustes.exentos);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const sinCertificar = datos.personas.filter((p) => !p.exento && p.aprobados < p.obligatorios);

  async function guardar() {
    if (exigir && !datos.ajustes.exigirCertificacion && sinCertificar.length) {
      const ok = window.confirm(
        `Al activar la certificación obligatoria, ${sinCertificar.length} persona(s) quedan sin poder operar hasta aprobar sus quizzes: ${sinCertificar.map((p) => p.nombre).join(', ')}. ¿Activar?`,
      );
      if (!ok) return;
    }
    try {
      setGuardando(true);
      setMsg('');
      const a = await api.guardarAjustesAcademy({ exigirCertificacion: exigir, puntajeMinimo: minimo, exentos });
      onGuardado(a);
      setMsg('Guardado. Aplica en máximo 30 segundos.');
    } catch (e) {
      setMsg(extractMessage(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-3xl bg-gradient-to-br from-[#2E2E31] to-[#56565A] text-white p-6 md:p-8">
      <div className="flex flex-col lg:flex-row gap-6 lg:items-start">
        <div className="flex-1">
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#F47735]" />{' '}{t('Certificación para operar')}
          </h2>
          <p className="text-sm text-white/70 mt-1 max-w-2xl">
            {t('Activa, lo transaccional de cada módulo (crear, aprobar, liquidar, enviar) se habilita solo cuando la persona aprueba su quiz con el puntaje mínimo. Consultar nunca se bloquea.')}
          </p>
          <label className={`mt-4 inline-flex items-center gap-3 ${puedeEditar ? 'cursor-pointer' : 'opacity-60'}`}>
            <span className={`relative w-12 h-7 rounded-full transition ${exigir ? 'bg-[#F47735]' : 'bg-white/20'}`}>
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${exigir ? 'left-6' : 'left-1'}`} />
            </span>
            <input type="checkbox" className="hidden" checked={exigir} disabled={!puedeEditar} onChange={(e) => setExigir(e.target.checked)} />
            <span className="font-semibold">{exigir ? 'Certificación obligatoria activa' : 'Certificación obligatoria apagada'}</span>
          </label>
          {sinCertificar.length > 0 && <p className="mt-2 text-xs text-[#F9A66F]">{sinCertificar.length}{' '}{t('persona(s) aún no aprueban todos sus quizzes obligatorios.')}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:w-[460px]">
          <label className="text-sm">
            <span className="text-white/70">{t('Puntaje mínimo')}</span>
            <select value={minimo} disabled={!puedeEditar} onChange={(e) => setMinimo(Number(e.target.value))} className="mt-1 w-full rounded-lg bg-white text-gray-900 px-3 py-2">
              {[60, 70, 75, 80, 85, 90, 100].map((v) => (
                <option key={v} value={v}>
                  {v} %
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-white/70">{t('Exentos (no se les exige)')}</span>
            <select
              multiple
              value={exentos}
              disabled={!puedeEditar}
              onChange={(e) => setExentos(Array.from(e.target.selectedOptions).map((o) => o.value))}
              className="mt-1 w-full h-24 rounded-lg bg-white text-gray-900 px-2 py-1 text-xs"
            >
              {datos.personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          {puedeEditar && (
            <div className="sm:col-span-2 flex items-center gap-3">
              <button onClick={() => void guardar()} disabled={guardando} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F47735] hover:bg-[#E5641F] font-semibold">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}{' '}{t('Guardar')}
              </button>
              {msg && <span className="text-xs text-white/80">{msg}</span>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
