'use client';

import { useT } from '@/i18n/idioma';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, BookOpen, Clock, GraduationCap, HelpCircle, Lock, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { ModuloPlanAcademy, PlanAcademy, TerminoGlosario } from '@/types';
import { Anillo, EstadoPill, IconoModulo, OBEN, preguntarAMia } from './comun';

const ORDEN_GRUPOS = ['Fundamentos', 'Inicio', 'Comercial', 'Despacho y facturación', 'Reportes', 'Configuración'];

/**
 * Xmart Academy (Hernán, 23-oct): portada con qué es Oben Xmart y quién es Paradixe, el viaje de un pedido de punta a
 * punta, el plan de estudio del perfil (con lo que hay que aprobar para operar), el glosario y, para administradores,
 * el panel de fricciones.
 */
export default function AcademyPage() {
  const t = useT();
  const [plan, setPlan] = useState<PlanAcademy | null>(null);
  const [glosario, setGlosario] = useState<TerminoGlosario[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAcademyPlan().then(setPlan).catch((e) => setError(extractMessage(e, 'No se pudo cargar Xmart Academy.')));
    api.getAcademyGlosario().then(setGlosario).catch(() => setGlosario([]));
  }, []);

  if (error) return <p className="max-w-3xl mx-auto mt-10 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">{error}</p>;
  if (!plan) return <Cargando />;

  const siguiente = plan.modulos.find((m) => m.obligatorio && m.estado !== 'aprobado') ?? plan.modulos.find((m) => m.estado === 'pendiente') ?? plan.modulos[0];
  const pendientesParaOperar = plan.modulos.filter((m) => m.bloqueaTransaccional);
  const avance = plan.resumen.obligatorios ? Math.round((plan.resumen.aprobados / plan.resumen.obligatorios) * 100) : Math.round((plan.resumen.vistos / Math.max(plan.resumen.total, 1)) * 100);

  return (
    <div className="max-w-[1300px] mx-auto space-y-10 pb-10">
      <Portada plan={plan} siguiente={siguiente} avance={avance} />

      {pendientesParaOperar.length > 0 && (
        <div className="academy-subir rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-white p-5 flex flex-col md:flex-row md:items-center gap-4">
          <span className="w-11 h-11 rounded-xl bg-[#F47735] text-white flex items-center justify-center shrink-0 academy-pulso">
            <Lock className="w-5 h-5" />
          </span>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">{t('Para operar debes aprobar')}{' '}{pendientesParaOperar.length === 1 ? 'este módulo' : `estos ${pendientesParaOperar.length} módulos`}</p>
            <p className="text-sm text-gray-600">
              {t('Tu perfil es transaccional en')}{' '}{pendientesParaOperar.map((m) => m.titulo).join(', ')}{t('. Mientras no apruebes su quiz (mínimo')}{' '}{plan.ajustes.puntajeMinimo}{' '}{t('%), puedes consultar pero no crear, aprobar ni enviar.')}
            </p>
          </div>
          <Link href={`/academy/${pendientesParaOperar[0].key}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F47735] text-white text-sm font-semibold hover:bg-[#E5641F]">
            {t('Empezar')}{' '}<ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      <QueEs plan={plan} />
      <Recorrido plan={plan} />
      <MiPlan plan={plan} />
      <Glosario terminos={glosario} plan={plan} />
      <Paradixe plan={plan} />
    </div>
  );
}

function Cargando() {
  return (
    <div className="max-w-[1300px] mx-auto space-y-6">
      <div className="h-72 rounded-3xl bg-gradient-to-br from-[#2E2E31] to-[#56565A] academy-brillo" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 rounded-2xl bg-white border border-gray-100 academy-brillo" style={{ backgroundColor: '#F7F7F7' }} />
        ))}
      </div>
    </div>
  );
}

function Portada({ plan, siguiente, avance }: { plan: PlanAcademy; siguiente: ModuloPlanAcademy | undefined; avance: number }) {
  const t = useT();
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2E2E31] via-[#3D3D41] to-[#56565A] text-white academy-subir">
      <div className="absolute inset-0 academy-cuadricula" />
      <div className="absolute -top-24 -right-16 w-96 h-96 rounded-full bg-[#F47735] opacity-25 blur-3xl" />
      <div className="absolute -bottom-32 left-1/3 w-80 h-80 rounded-full bg-[#F47735] opacity-10 blur-3xl" />
      {/* El viaje de un pedido, dibujándose: OC → planta → puerto → factura. */}
      <svg className="absolute right-0 bottom-0 w-[60%] h-full opacity-40 hidden md:block" viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden>
        <path className="academy-trazo" d="M0 250 C 120 250, 140 120, 260 140 S 420 260, 520 110 S 600 60, 600 40" fill="none" stroke={OBEN.naranja} strokeWidth="2.5" />
        <path className="academy-flujo" d="M0 270 C 140 270, 170 170, 290 180 S 450 280, 600 120" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.5" />
        {[
          [0, 250],
          [260, 140],
          [520, 110],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill={OBEN.naranja} />
        ))}
      </svg>

      <div className="relative px-6 py-10 md:px-12 md:py-14 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 items-center">
        <div>
          <div className="flex items-center gap-4">
            <Image src="/brand/oben-logo-blanco.svg" alt={t('Oben Group')} width={132} height={60} priority />
            <span className="h-8 w-px bg-white/25" />
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.2em] uppercase text-white/70">
              <GraduationCap className="w-4 h-4 text-[#F47735]" />{' '}{t('Academy')}
            </span>
          </div>
          <h1 className="mt-6 text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05]">
            {t('Xmart')}{' '}<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F9A66F] to-[#F47735]">{t('Academy')}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-white/75 text-base md:text-lg leading-relaxed">
            {t('Aprende Oben Xmart de punta a punta: qué hace solo, qué decides tú y cómo se conecta cada módulo con el recorrido de un pedido. Tu plan está armado según tu perfil.')}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {siguiente && (
              <Link href={`/academy/${siguiente.key}`} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F47735] hover:bg-[#E5641F] text-white font-semibold shadow-lg shadow-[#F47735]/30 transition">
                {plan.resumen.vistos ? 'Continuar' : 'Empezar'}: {siguiente.titulo} <ArrowRight className="w-4 h-4" />
              </Link>
            )}
            <a href="#recorrido" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 font-semibold transition">
              {t('Ver el viaje de un pedido')}
            </a>
            {plan.esAdmin && (
              <Link href="/academy/fricciones" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 font-semibold transition">
                <BarChart3 className="w-4 h-4" />{' '}{t('Panel de fricciones')}
              </Link>
            )}
          </div>
        </div>

        <div className="lg:justify-self-end flex flex-col items-center gap-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur px-8 py-6 academy-flotar">
          <Anillo valor={avance} tam={124} grosor={10} claro>
            <div className="text-center">
              <p className="text-3xl font-extrabold">{avance}%</p>
              <p className="text-[10px] uppercase tracking-wider text-white/60">{t('tu avance')}</p>
            </div>
          </Anillo>
          <div className="text-center text-sm">
            <p className="font-semibold">{plan.resumen.total}{' '}{t('módulos en tu plan')}</p>
            <p className="text-white/60">
              {plan.resumen.obligatorios
                ? `${plan.resumen.aprobados} de ${plan.resumen.obligatorios} quizzes para operar aprobados`
                : `${plan.resumen.vistos} lecciones vistas`}
            </p>
          </div>
          {plan.ajustes.exigirCertificacion ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#F9A66F]">
              <ShieldCheck className="w-3.5 h-3.5" />{' '}{t('Certificación obligatoria para operar')}
            </span>
          ) : (
            <span className="text-[11px] text-white/50">{t('La certificación aún no es obligatoria')}</span>
          )}
        </div>
      </div>
    </section>
  );
}

function Titulo({ eyebrow, titulo, texto, id }: { eyebrow: string; titulo: string; texto?: string; id?: string }) {
  return (
    <div id={id} className="scroll-mt-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F47735]">{eyebrow}</p>
      <h2 className="mt-1 text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">{titulo}</h2>
      {texto && <p className="mt-2 text-gray-600 max-w-3xl">{texto}</p>}
    </div>
  );
}

function QueEs({ plan }: { plan: PlanAcademy }) {
  const t = useT();
  const q = plan.intro.queEs;
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8 items-start">
      <div className="academy-subir">
        <Titulo eyebrow="La plataforma" titulo={q.titulo} />
        <p className="mt-4 text-gray-700 leading-relaxed text-[15px]">{q.texto}</p>
        <button onClick={() => preguntarAMia('¿Qué hace Oben Xmart solo y qué tengo que hacer yo en mi cargo?')} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#C4521A] hover:underline">
          <HelpCircle className="w-4 h-4" />{' '}{t('Pregúntale a MIA qué te toca a ti')}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {q.pilares.map((p, i) => (
          <div key={p.titulo} className="academy-subir group rounded-2xl bg-white border border-gray-100 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition" style={{ animationDelay: `${120 + i * 90}ms` }}>
            <span className="inline-flex w-9 h-9 rounded-lg bg-orange-50 text-[#F47735] items-center justify-center font-extrabold">{i + 1}</span>
            <p className="mt-3 font-bold text-gray-900">{p.titulo}</p>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">{p.texto}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Recorrido({ plan }: { plan: PlanAcademy }) {
  const t = useT();
  const paradas = plan.intro.recorrido;
  const [activa, setActiva] = useState(0);
  const [tocado, setTocado] = useState(false);
  const enPlan = useMemo(() => new Set(plan.modulos.map((m) => m.key)), [plan.modulos]);

  // Avanza solo hasta que la persona toque una parada.
  useEffect(() => {
    if (tocado) return;
    const t = setInterval(() => setActiva((a) => (a + 1) % paradas.length), 4500);
    return () => clearInterval(t);
  }, [tocado, paradas.length]);

  const p = paradas[activa];
  const modulo = plan.modulos.find((m) => m.key === p?.modulo);

  return (
    <section className="space-y-6">
      <Titulo id="recorrido" eyebrow="Punta a punta" titulo="El viaje de un pedido" texto="Toca cada parada: qué pasa, qué hace el sistema solo y dónde intervienes. Así se conectan todos los módulos." />
      <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-5 md:p-8">
        <div className="relative overflow-x-auto pb-2">
          <div className="min-w-[860px] relative">
            <div className="absolute left-6 right-6 top-6 h-1 rounded-full bg-gray-100" />
            <div className="absolute left-6 top-6 h-1 rounded-full bg-gradient-to-r from-[#F9A66F] to-[#F47735] transition-all duration-700" style={{ width: `calc((100% - 3rem) * ${activa / Math.max(paradas.length - 1, 1)})` }} />
            <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${paradas.length}, minmax(0, 1fr))` }}>
              {paradas.map((x, i) => (
                <li key={x.key} className="flex flex-col items-center text-center px-1">
                  <button
                    onClick={() => {
                      setTocado(true);
                      setActiva(i);
                      api.registrarEventoAcademy('recorrido', null, { parada: x.key });
                    }}
                    className={`relative w-12 h-12 rounded-full flex items-center justify-center font-extrabold text-sm transition border-4 ${
                      i === activa ? 'bg-[#F47735] text-white border-orange-100 scale-110 academy-pulso' : i < activa ? 'bg-[#F9A66F] text-white border-white' : 'bg-white text-gray-500 border-gray-100 hover:border-orange-200'
                    }`}
                    aria-label={x.titulo}
                  >
                    {i + 1}
                  </button>
                  <span className={`mt-2 text-[11px] font-semibold leading-tight ${i === activa ? 'text-gray-900' : 'text-gray-500'}`}>{x.titulo}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {p && (
          <div key={p.key} className="academy-subir mt-6 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-5 items-center rounded-2xl bg-gradient-to-br from-gray-50 to-white border border-gray-100 p-5">
            <span className="w-14 h-14 rounded-2xl bg-[#2E2E31] text-white flex items-center justify-center">
              <IconoModulo moduloKey={p.modulo} href={modulo?.href ?? null} className="w-7 h-7 text-[#F47735]" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#F47735]">{t('Parada')}{' '}{activa + 1}{' '}{t('de')}{' '}{paradas.length}</p>
              <p className="text-lg font-bold text-gray-900">{p.titulo}</p>
              <p className="mt-1 text-sm text-gray-600 leading-relaxed">{p.texto}</p>
            </div>
            <div className="flex md:flex-col gap-2">
              {enPlan.has(p.modulo) && (
                <Link href={`/academy/${p.modulo}`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#F47735] text-white text-sm font-semibold hover:bg-[#E5641F]">
                  <BookOpen className="w-4 h-4" />{' '}{t('Ver la lección')}
                </Link>
              )}
              {modulo?.href && (
                <Link href={modulo.href} onClick={() => api.registrarEventoAcademy('ir_al_modulo', modulo.key, { desde: 'recorrido' })} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  {t('Ir al módulo')}{' '}<ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MiPlan({ plan }: { plan: PlanAcademy }) {
  const grupos = ORDEN_GRUPOS.map((g) => ({ g, modulos: plan.modulos.filter((m) => m.grupo === g) })).filter((x) => x.modulos.length);
  return (
    <section className="space-y-6">
      <Titulo
        eyebrow="Según tu perfil"
        titulo="Tu plan de estudio"
        texto="Los módulos que tu perfil puede ver. Donde tu perfil es transaccional, el quiz es obligatorio para poder operar; en los de consulta es recomendado."
      />
      {grupos.map(({ g, modulos }) => (
        <div key={g}>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">{g}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {modulos.map((m, i) => (
              <TarjetaModulo key={m.key} m={m} i={i} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function TarjetaModulo({ m, i }: { m: ModuloPlanAcademy; i: number }) {
  const t = useT();
  const aprobado = m.estado === 'aprobado';
  return (
    <Link
      href={`/academy/${m.key}`}
      className="academy-subir group relative overflow-hidden rounded-2xl bg-white border border-gray-100 p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-orange-200 transition-all"
      style={{ animationDelay: `${i * 60}ms` }}
    >
      <div className={`absolute top-0 left-0 h-1 transition-all duration-500 ${aprobado ? 'w-full bg-emerald-400' : m.estado === 'pendiente' ? 'w-0 group-hover:w-full bg-[#F47735]' : 'w-1/2 bg-[#F9A66F]'}`} />
      <div className="flex items-start gap-4">
        <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition ${aprobado ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-[#F47735] group-hover:bg-[#F47735] group-hover:text-white'}`}>
          <IconoModulo moduloKey={m.key} href={m.href} className="w-6 h-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-gray-900 leading-tight">{m.titulo}</p>
            <EstadoPill estado={m.estado} bloquea={m.bloqueaTransaccional} />
          </div>
          <p className="mt-1.5 text-sm text-gray-600 leading-snug line-clamp-2">{m.resumen}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" /> {m.minutos}{' '}{t('min')}
            </span>
            <span>{m.preguntas}{' '}{t('preguntas')}</span>
            {m.obligatorio ? <span className="font-semibold text-[#C4521A]">{t('Quiz obligatorio para operar')}</span> : <span>{t('Quiz recomendado')}</span>}
            {m.puntaje !== null && <span className="font-semibold text-gray-700">{t('Mejor puntaje:')}{' '}{m.puntaje} %</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

function Glosario({ terminos, plan }: { terminos: TerminoGlosario[]; plan: PlanAcademy }) {
  const t = useT();
  const [q, setQ] = useState('');
  const enPlan = new Set(plan.modulos.map((m) => m.key));
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filtrados = terminos.filter((g) => !q || norm(`${g.termino} ${g.definicion}`).includes(norm(q)));
  if (!terminos.length) return null;
  return (
    <section className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <Titulo eyebrow="Hablemos igual" titulo="Glosario" texto="Los términos que se usan en Oben Xmart, con el módulo donde aparecen." />
        <label className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => q && api.registrarEventoAcademy('glosario', null, { busqueda: q.slice(0, 80) })}
            placeholder={t('Buscar un término (PF, Incoterm, pata 3…)')}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F47735]/30"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtrados.map((g) => (
          <div key={g.termino} className="rounded-xl bg-white border border-gray-100 p-4 hover:border-orange-200 transition">
            <p className="font-bold text-gray-900">{g.termino}</p>
            <p className="mt-1 text-sm text-gray-600 leading-snug">{g.definicion}</p>
            {enPlan.has(g.modulo) && (
              <Link href={`/academy/${g.modulo}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#C4521A] hover:underline">
                {t('Ver en la lección')}{' '}<ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        ))}
        {filtrados.length === 0 && (
          <div className="sm:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-gray-200 p-5 text-sm text-gray-500 flex items-center justify-between gap-3">
            <span>{t('No hay un término con «')}{q}».</span>
            <button onClick={() => preguntarAMia(`¿Qué significa "${q}" en Oben Xmart?`)} className="inline-flex items-center gap-1.5 font-semibold text-[#C4521A] hover:underline">
              <Sparkles className="w-4 h-4" />{' '}{t('Preguntar a MIA')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Paradixe({ plan }: { plan: PlanAcademy }) {
  const t = useT();
  const p = plan.intro.paradixe;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-[#2E2E31] text-white">
      <div className="absolute inset-0 academy-cuadricula opacity-60" />
      <div className="relative grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-8 items-center p-8 md:p-10">
        <div className="w-28 h-28 rounded-2xl bg-white flex items-center justify-center p-4">
          <Image src="/paradixe-logo.png" alt={t('Paradixe')} width={96} height={96} className="object-contain" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F47735]">{t('Detrás de la plataforma')}</p>
          <h2 className="mt-1 text-2xl font-extrabold">{p.titulo}</h2>
          <p className="mt-3 text-white/75 leading-relaxed max-w-3xl">{p.texto}</p>
        </div>
        <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#2E2E31] font-semibold hover:bg-orange-50">
          {t('paradixe.xyz')}{' '}<ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </section>
  );
}
