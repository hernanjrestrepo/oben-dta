'use client';

import { useT } from '@/i18n/idioma';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Clock, ExternalLink, Loader2, RotateCcw, ShieldCheck, Sparkles, Target, Users, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { LeccionAcademy, PlanAcademy, ResultadoQuizAcademy } from '@/types';
import { Anillo, EstadoPill, IconoModulo, OBEN, preguntarAMia } from '../comun';

/** Una lección de Xmart Academy: para qué sirve, cómo se ve, paso a paso, reglas y el quiz. */
export default function LeccionPage() {
  const t = useT();
  const { key } = useParams<{ key: string }>();
  const [l, setL] = useState<LeccionAcademy | null>(null);
  const [plan, setPlan] = useState<PlanAcademy | null>(null);
  const [error, setError] = useState('');
  const inicio = useRef(0);

  useEffect(() => {
    if (!key) return;
    inicio.current = Date.now();
    api
      .getAcademyLeccion(key)
      .then((x) => {
        setL(x);
        api.registrarEventoAcademy('leccion_abierta', key);
      })
      .catch((e) => setError(extractMessage(e, 'No se pudo abrir la lección.')));
    api.getAcademyPlan().then(setPlan).catch(() => setPlan(null));
    // Al salir de la lección se guarda el tiempo (y queda "vista").
    return () => {
      const segundos = (Date.now() - inicio.current) / 1000;
      if (segundos > 3) void api.marcarLeccionVista(key, segundos).catch(() => undefined);
    };
  }, [key]);

  if (error)
    return (
      <div className="max-w-3xl mx-auto mt-10 space-y-4">
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">{error}</p>
        <Link href="/academy" className="inline-flex items-center gap-1 text-sm font-semibold text-[#C4521A]">
          <ArrowLeft className="w-4 h-4" />{' '}{t('Volver a Xmart Academy')}
        </Link>
      </div>
    );
  if (!l) return <div className="max-w-5xl mx-auto h-64 mt-6 rounded-3xl bg-gray-100 academy-brillo" />;

  const idx = plan?.modulos.findIndex((m) => m.key === l.key) ?? -1;
  const anterior = plan && idx > 0 ? plan.modulos[idx - 1] : null;
  const siguiente = plan && idx >= 0 && idx < plan.modulos.length - 1 ? plan.modulos[idx + 1] : null;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Encabezado */}
      <header className="academy-subir relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2E2E31] to-[#56565A] text-white">
        <div className="absolute inset-0 academy-cuadricula" />
        <div className="absolute -top-20 -right-10 w-72 h-72 rounded-full bg-[#F47735] opacity-25 blur-3xl" />
        <div className="relative p-6 md:p-10">
          <nav className="flex items-center gap-1 text-xs text-white/60">
            <Link href="/academy" className="hover:text-white">{t('Xmart Academy')}</Link>
            <ChevronRight className="w-3 h-3" />
            <span>{l.grupo}</span>
          </nav>
          <div className="mt-5 flex flex-col md:flex-row md:items-center gap-6">
            <span className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 academy-flotar">
              <IconoModulo moduloKey={l.key} href={l.href} className="w-8 h-8 text-[#F47735]" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{l.titulo}</h1>
                <EstadoPill estado={l.estado} />
              </div>
              <p className="mt-2 text-white/75 text-base md:text-lg">{l.resumen}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {l.minutos}{' '}{t('min')}
                </span>
                <span>{l.quiz.length}{' '}{t('preguntas · mínimo')}{' '}{l.puntajeMinimo} %</span>
                {l.obligatorio ? <span className="font-semibold text-[#F9A66F]">{t('Quiz obligatorio para operar')}</span> : <span>{t('Quiz recomendado')}</span>}
                <span>{t('Revisado el')}{' '}{l.revisado}</span>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {l.puedeIr && l.href && (
              <Link
                href={l.href}
                onClick={() => api.registrarEventoAcademy('ir_al_modulo', l.key, { desde: 'leccion' })}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F47735] hover:bg-[#E5641F] font-semibold shadow-lg shadow-[#F47735]/30"
              >
                {t('Ir al módulo en vivo')}{' '}<ExternalLink className="w-4 h-4" />
              </Link>
            )}
            <a href="#quiz" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 font-semibold">
              <Target className="w-4 h-4" />{' '}{t('Ir al quiz')}
            </a>
            <button
              onClick={() => {
                api.registrarEventoAcademy('preguntar_mia', l.key);
                preguntarAMia(`Explícame el módulo ${l.titulo} de Oben Xmart: ¿cómo lo uso en mi trabajo?`);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 font-semibold"
            >
              <Sparkles className="w-4 h-4" />{' '}{t('Preguntar a MIA')}
            </button>
          </div>
        </div>
      </header>

      {/* Para qué sirve */}
      <section className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-5">
        <div className="academy-subir rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
          <Etiqueta>{t('Para qué sirve')}</Etiqueta>
          <p className="mt-2 text-gray-800 leading-relaxed text-[15px]">{l.paraQue}</p>
        </div>
        <div className="academy-subir rounded-2xl bg-white border border-gray-100 shadow-sm p-6" style={{ animationDelay: '100ms' }}>
          <Etiqueta>
            <Users className="w-3.5 h-3.5" />{' '}{t('Quiénes lo usan')}
          </Etiqueta>
          <ul className="mt-3 flex flex-wrap gap-2">
            {l.quienes.map((q) => (
              <li key={q} className="px-3 py-1 rounded-full bg-orange-50 text-[#C4521A] text-sm font-medium">
                {q}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Así se ve */}
      {l.capturas.length > 0 && (
        <section className="space-y-4">
          <Seccion titulo="Así se ve" texto="Pasa el cursor o toca los números para ver qué es cada parte." />
          {l.capturas.map((c) => (
            <Captura key={c.archivo} c={c} modulo={l.key} />
          ))}
        </section>
      )}

      {/* Paso a paso */}
      <section className="space-y-4">
        <Seccion titulo="Paso a paso" texto="Lo que haces en este módulo, en orden." />
        <ol className="relative space-y-3">
          <span className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-[#F47735] to-orange-100" />
          {l.pasos.map((p, i) => (
            <li key={p.titulo} className="academy-subir relative flex gap-4" style={{ animationDelay: `${i * 80}ms` }}>
              <span className="relative z-10 w-10 h-10 rounded-full bg-white border-2 border-[#F47735] text-[#F47735] font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="flex-1 rounded-2xl bg-white border border-gray-100 shadow-sm px-5 py-4 hover:border-orange-200 transition">
                <p className="font-bold text-gray-900">{p.titulo}</p>
                <p className="mt-1 text-sm text-gray-600 leading-relaxed">{p.detalle}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Reglas */}
      <section className="space-y-4">
        <Seccion titulo="Reglas que debes saber" texto="Lo que el sistema hace siempre así (y por qué)." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {l.reglas.map((r, i) => (
            <div key={r} className="academy-subir flex gap-3 rounded-2xl bg-white border border-gray-100 p-4" style={{ animationDelay: `${i * 70}ms` }}>
              <ShieldCheck className="w-5 h-5 text-[#F47735] shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 leading-relaxed">{r}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quiz */}
      <Quiz l={l} onAprobado={(x) => setL((prev) => (prev ? { ...prev, estado: 'aprobado', puntaje: Math.max(prev.puntaje ?? 0, x) } : prev))} />

      {/* Navegación */}
      <nav className="flex flex-col sm:flex-row gap-3 justify-between">
        {anterior ? (
          <Link href={`/academy/${anterior.key}`} className="group flex items-center gap-3 rounded-2xl bg-white border border-gray-100 px-5 py-4 hover:border-orange-200">
            <ArrowLeft className="w-4 h-4 text-gray-400 group-hover:text-[#F47735]" />
            <span>
              <span className="block text-[11px] uppercase tracking-wider text-gray-400">{t('Anterior')}</span>
              <span className="font-semibold text-gray-900">{anterior.titulo}</span>
            </span>
          </Link>
        ) : (
          <Link href="/academy" className="flex items-center gap-2 text-sm font-semibold text-[#C4521A]">
            <ArrowLeft className="w-4 h-4" />{' '}{t('Volver a Xmart Academy')}
          </Link>
        )}
        {siguiente && (
          <Link href={`/academy/${siguiente.key}`} className="group flex items-center justify-end gap-3 rounded-2xl bg-white border border-gray-100 px-5 py-4 hover:border-orange-200 text-right">
            <span>
              <span className="block text-[11px] uppercase tracking-wider text-gray-400">{t('Siguiente')}</span>
              <span className="font-semibold text-gray-900">{siguiente.titulo}</span>
            </span>
            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#F47735]" />
          </Link>
        )}
      </nav>
    </div>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F47735]">{children}</p>;
}

function Seccion({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <div>
      <h2 className="text-xl md:text-2xl font-extrabold text-gray-900 tracking-tight">{titulo}</h2>
      {texto && <p className="text-sm text-gray-500 mt-0.5">{texto}</p>}
    </div>
  );
}

/** Captura de la pantalla real con marcadores numerados. */
function Captura({ c, modulo }: { c: LeccionAcademy['capturas'][number]; modulo: string }) {
  const [activa, setActiva] = useState<number | null>(null);
  const [falla, setFalla] = useState(false);
  if (falla) return null;
  return (
    <figure className="academy-subir rounded-3xl bg-white border border-gray-100 shadow-sm p-3 md:p-5">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/academy/${c.archivo}`} alt={c.titulo} className="w-full h-auto block" onError={() => setFalla(true)} onLoad={() => api.registrarEventoAcademy('captura_vista', modulo, { archivo: c.archivo })} />
          {c.marcas.map((m, i) => (
            <button
              key={i}
              onMouseEnter={() => setActiva(i)}
              onFocus={() => setActiva(i)}
              onClick={() => setActiva(i)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-white text-sm font-extrabold flex items-center justify-center shadow-lg transition ${activa === i ? 'bg-[#2E2E31] scale-110' : 'bg-[#F47735] academy-pulso'}`}
              style={{ left: `${m.x}%`, top: `${m.y}%` }}
              aria-label={m.titulo}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <ol className="space-y-2">
          {c.marcas.map((m, i) => (
            <li
              key={i}
              onMouseEnter={() => setActiva(i)}
              className={`rounded-xl border px-3 py-2.5 cursor-default transition ${activa === i ? 'border-[#F47735] bg-orange-50' : 'border-gray-100 bg-white'}`}
            >
              <p className="text-sm font-bold text-gray-900">
                <span className="text-[#F47735] mr-1">{i + 1}.</span> {m.titulo}
              </p>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{m.texto}</p>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-3 text-xs text-gray-500 text-center">{c.titulo}</figcaption>
    </figure>
  );
}

function Quiz({ l, onAprobado }: { l: LeccionAcademy; onAprobado: (puntaje: number) => void }) {
  const t = useT();
  const [paso, setPaso] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const [resultado, setResultado] = useState<ResultadoQuizAcademy | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const total = l.quiz.length;
  const q = l.quiz[paso];

  async function enviar() {
    try {
      setEnviando(true);
      setError('');
      const r = await api.responderQuizAcademy(l.key, respuestas);
      setResultado(r);
      if (r.aprobado) onAprobado(r.puntaje);
    } catch (e) {
      setError(extractMessage(e, 'No se pudo calificar el quiz.'));
    } finally {
      setEnviando(false);
    }
  }

  function reiniciar() {
    setResultado(null);
    setRespuestas({});
    setPaso(0);
  }

  return (
    <section id="quiz" className="scroll-mt-6 rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 md:px-8 pt-6 flex items-center justify-between gap-4">
        <div>
          <Etiqueta>
            <Target className="w-3.5 h-3.5" />{' '}{t('Quiz')}
          </Etiqueta>
          <h2 className="text-xl md:text-2xl font-extrabold text-gray-900">{t('¿Quedó claro?')}</h2>
          <p className="text-sm text-gray-500">
            {l.obligatorio ? `Obligatorio para operar en este módulo: necesitas ${l.puntajeMinimo} % o más.` : `Recomendado: ${l.puntajeMinimo} % o más lo da por aprobado.`}
            {l.intentos > 0 && ` Llevas ${l.intentos} intento${l.intentos === 1 ? '' : 's'}${l.puntaje !== null ? `; tu mejor puntaje es ${l.puntaje} %` : ''}.`}
          </p>
        </div>
        {!resultado && (
          <span className="text-sm font-bold text-gray-400 shrink-0">
            {paso + 1}/{total}
          </span>
        )}
      </div>

      {!resultado ? (
        <div className="p-6 md:p-8 pt-4">
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#F9A66F] to-[#F47735] transition-all duration-500" style={{ width: `${(Object.keys(respuestas).length / total) * 100}%` }} />
          </div>
          {q && (
            <div key={q.id} className="academy-subir mt-6">
              <p className="text-lg font-bold text-gray-900">{q.pregunta}</p>
              <div className="mt-4 grid gap-2.5">
                {q.opciones.map((o, i) => {
                  const elegida = respuestas[q.id] === i;
                  return (
                    <button
                      key={o}
                      onClick={() => setRespuestas((r) => ({ ...r, [q.id]: i }))}
                      className={`text-left flex items-center gap-3 rounded-xl border-2 px-4 py-3 transition ${elegida ? 'border-[#F47735] bg-orange-50' : 'border-gray-100 hover:border-orange-200 bg-white'}`}
                    >
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${elegida ? 'bg-[#F47735] text-white' : 'bg-gray-100 text-gray-500'}`}>{String.fromCharCode(65 + i)}</span>
                      <span className="text-sm text-gray-800">{o}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {error && (
            <p className="mt-4 text-sm text-red-700 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
          <div className="mt-6 flex items-center justify-between gap-3">
            <button onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-30">
              {t('Anterior')}
            </button>
            {paso < total - 1 ? (
              <button onClick={() => setPaso((p) => p + 1)} disabled={respuestas[q?.id ?? ''] === undefined} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2E2E31] text-white text-sm font-semibold hover:bg-black disabled:opacity-30">
                {t('Siguiente')}{' '}<ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => void enviar()}
                disabled={enviando || Object.keys(respuestas).length < total}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F47735] text-white text-sm font-semibold hover:bg-[#E5641F] disabled:opacity-40"
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}{' '}{t('Calificar')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <Resultado l={l} r={resultado} onReintentar={reiniciar} />
      )}
    </section>
  );
}

function Resultado({ l, r, onReintentar }: { l: LeccionAcademy; r: ResultadoQuizAcademy; onReintentar: () => void }) {
  const t = useT();
  return (
    <div className="relative p-6 md:p-8 pt-4 overflow-hidden">
      {r.aprobado && <Confeti />}
      <div className={`academy-subir rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 ${r.aprobado ? 'bg-gradient-to-r from-emerald-50 to-white border border-emerald-100' : 'bg-gradient-to-r from-orange-50 to-white border border-orange-100'}`}>
        <Anillo valor={r.puntaje} tam={110} grosor={9}>
          <span className="text-2xl font-extrabold text-gray-900">{r.puntaje}%</span>
        </Anillo>
        <div className="flex-1 text-center md:text-left">
          <p className={`text-xl font-extrabold ${r.aprobado ? 'text-emerald-700' : 'text-[#C4521A]'}`}>{r.aprobado ? '¡Aprobado!' : 'Aún no: repasa y vuelve a intentarlo'}</p>
          <p className="mt-1 text-sm text-gray-600">
            {r.buenas}{' '}{t('de')}{' '}{r.total}{' '}{t('correctas · mínimo')}{' '}{r.puntajeMinimo} %.{' '}
            {r.aprobado && l.obligatorio ? 'Ya puedes operar en este módulo.' : r.aprobado ? 'Módulo completado.' : 'Las preguntas que fallaste te dicen qué repasar.'}
          </p>
        </div>
        <div className="flex gap-2">
          {r.aprobado && l.puedeIr && l.href && (
            <Link href={l.href} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F47735] text-white text-sm font-semibold hover:bg-[#E5641F]">
              {t('Ir al módulo')}{' '}<ArrowRight className="w-4 h-4" />
            </Link>
          )}
          {!r.aprobado && (
            <button onClick={onReintentar} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2E2E31] text-white text-sm font-semibold">
              <RotateCcw className="w-4 h-4" />{' '}{t('Intentar de nuevo')}
            </button>
          )}
        </div>
      </div>
      <ol className="mt-5 space-y-2">
        {r.preguntas.map((p, i) => {
          const q = l.quiz.find((x) => x.id === p.id);
          return (
            <li key={p.id} className="flex gap-3 rounded-xl border border-gray-100 px-4 py-3">
              {p.correcta ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 text-[#F47735] shrink-0 mt-0.5" />}
              <div className="text-sm">
                <p className="font-semibold text-gray-900">
                  {i + 1}. {q?.pregunta}
                </p>
                {p.respuesta !== null && q && <p className="text-gray-600 mt-0.5">{t('Respuesta:')}{' '}{q.opciones[p.respuesta]}</p>}
                {p.explicacion ? <p className="text-gray-500 mt-0.5">{p.explicacion}</p> : !p.correcta && <p className="text-gray-500 mt-0.5">{t('Repasa el paso a paso y las reglas de arriba.')}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Celebración breve al aprobar (respeta "reducir movimiento"). */
function Confeti() {
  const piezas = Array.from({ length: 28 }, (_, i) => i);
  const colores = [OBEN.naranja, '#F9A66F', OBEN.grafito, '#34D399', '#FBD0B4'];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-40" aria-hidden>
      {piezas.map((i) => (
        <span
          key={i}
          className="academy-confeti absolute top-0 w-2 h-3 rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, backgroundColor: colores[i % colores.length], animationDelay: `${(i % 7) * 70}ms` }}
        />
      ))}
    </div>
  );
}
