import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { AcademyEvento, AcademyIntento, AcademyProgreso } from '../../entities/academy.entities';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { AuthorizationService } from '../security/authorization.service';
import { ACADEMY_INTRO, MODULOS_ACADEMY, MODULO_POR_KEY, type ModuloAcademy, planDe, quizObligatorio, sinRespuestas } from './academy-catalogo';
import { CAMBIOS_DE_CODIGO } from './academy-cambios';
import { type AjustesAcademy, ajustesDe } from './academy-ajustes';

export { type AjustesAcademy, ajustesDe, PUNTAJE_MINIMO_POR_DEFECTO } from './academy-ajustes';

export type EstadoModulo = 'pendiente' | 'visto' | 'aprobado' | 'actualizado';

/** Tipos de evento que la pantalla puede registrar (los de error y bloqueo los registra el servidor). */
const EVENTOS_DE_PANTALLA = new Set(['leccion_abierta', 'tiempo', 'ir_al_modulo', 'preguntar_mia', 'captura_vista', 'glosario', 'recorrido']);

@Injectable()
export class AcademyService {
  constructor(
    @InjectRepository(AcademyProgreso) private readonly progresos: Repository<AcademyProgreso>,
    @InjectRepository(AcademyIntento) private readonly intentos: Repository<AcademyIntento>,
    @InjectRepository(AcademyEvento) private readonly eventos: Repository<AcademyEvento>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly authz: AuthorizationService,
    private readonly ctx: TenantContext,
  ) {}

  private async permisosDe(userId: string): Promise<Set<string>> {
    return new Set(await this.authz.listPermissions({ userId, tenantId: this.ctx.tenantId, isSuperAdmin: false }));
  }

  async ajustes(): Promise<AjustesAcademy> {
    const t = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
    return ajustesDe(t?.settings as Record<string, unknown> | undefined);
  }

  private estado(m: ModuloAcademy, p: AcademyProgreso | undefined): EstadoModulo {
    if (p?.aprobadoAt && (p.versionAprobada ?? 0) >= m.version) return 'aprobado';
    if (p?.vistoAt && (p.versionVista ?? 0) < m.version) return 'actualizado';
    if (p?.vistoAt) return 'visto';
    return 'pendiente';
  }

  /** El plan de estudio de la persona: los módulos de su perfil, su avance y qué le falta para operar. */
  async plan() {
    const userId = this.usuario();
    const [permisos, ajustes, filas] = await Promise.all([
      this.permisosDe(userId),
      this.ajustes(),
      this.progresos.find({ where: { tenantId: this.ctx.tenantId, userId } }),
    ]);
    const porModulo = new Map(filas.map((f) => [f.modulo, f]));
    const exento = ajustes.exentos.includes(userId);
    const modulos = planDe(permisos).map((m) => {
      const p = porModulo.get(m.key);
      const estado = this.estado(m, p);
      const obligatorio = quizObligatorio(m, permisos);
      return {
        key: m.key,
        href: m.href,
        titulo: m.titulo,
        grupo: m.grupo,
        resumen: m.resumen,
        minutos: m.minutos,
        preguntas: m.quiz.length,
        obligatorio,
        estado,
        puntaje: p?.mejorPuntaje ?? null,
        intentos: p?.intentos ?? 0,
        bloqueaTransaccional: ajustes.exigirCertificacion && !exento && obligatorio && estado !== 'aprobado',
      };
    });
    const obligatorios = modulos.filter((m) => m.obligatorio);
    return {
      intro: { queEs: ACADEMY_INTRO.queEs, paradixe: ACADEMY_INTRO.paradixe, recorrido: ACADEMY_INTRO.recorrido },
      modulos,
      resumen: {
        total: modulos.length,
        vistos: modulos.filter((m) => m.estado !== 'pendiente').length,
        obligatorios: obligatorios.length,
        aprobados: obligatorios.filter((m) => m.estado === 'aprobado').length,
      },
      ajustes: { exigirCertificacion: ajustes.exigirCertificacion, puntajeMinimo: ajustes.puntajeMinimo, exento },
      esAdmin: permisos.has('security.read'),
    };
  }

  glosario() {
    return ACADEMY_INTRO.glosario;
  }

  /** Una lección. Solo las del plan de la persona (los administradores de perfiles ven todas). */
  async modulo(key: string) {
    const userId = this.usuario();
    const m = MODULO_POR_KEY.get(key);
    if (!m) throw new NotFoundException('Ese módulo no existe en Xmart Academy.');
    const permisos = await this.permisosDe(userId);
    const enPlan = m.ver.every((p) => permisos.has(p));
    if (!enPlan && !permisos.has('security.read')) throw new ForbiddenException('Ese módulo no está en tu plan de estudio.');
    const [p, ajustes] = await Promise.all([this.progresos.findOne({ where: { tenantId: this.ctx.tenantId, userId, modulo: key } }), this.ajustes()]);
    return {
      ...sinRespuestas(m),
      enPlan,
      obligatorio: quizObligatorio(m, permisos),
      estado: this.estado(m, p ?? undefined),
      puntaje: p?.mejorPuntaje ?? null,
      intentos: p?.intentos ?? 0,
      puntajeMinimo: ajustes.puntajeMinimo,
      puedeIr: !!m.href && enPlan,
    };
  }

  /** La persona abrió o leyó la lección (con el tiempo que lleva). */
  async visto(key: string, segundos = 0) {
    const userId = this.usuario();
    const m = MODULO_POR_KEY.get(key);
    if (!m) throw new NotFoundException('Ese módulo no existe en Xmart Academy.');
    const p = await this.fila(userId, key);
    p.vistoAt ??= new Date();
    p.versionVista = Math.max(p.versionVista ?? 0, m.version);
    p.segundos += Math.max(0, Math.min(Math.round(segundos), 3600));
    await this.progresos.save(p);
    return { estado: this.estado(m, p) };
  }

  /** Califica el quiz en el servidor. Aprobado = puntaje ≥ mínimo del tenant. */
  async responderQuiz(key: string, respuestas: Record<string, number>) {
    const userId = this.usuario();
    const m = MODULO_POR_KEY.get(key);
    if (!m) throw new NotFoundException('Ese módulo no existe en Xmart Academy.');
    if (!m.quiz.length) throw new BadRequestException('Este módulo no tiene quiz.');
    const permisos = await this.permisosDe(userId);
    if (!m.ver.every((p) => permisos.has(p))) throw new ForbiddenException('Ese módulo no está en tu plan de estudio.');
    const { puntajeMinimo } = await this.ajustes();
    const detalle = m.quiz.map((q) => {
      const elegida = Number.isInteger(respuestas?.[q.id]) ? respuestas[q.id] : null;
      return { id: q.id, elegida, correcta: elegida === q.correcta };
    });
    const buenas = detalle.filter((d) => d.correcta).length;
    const puntaje = Math.round((buenas / m.quiz.length) * 100);
    const aprobado = puntaje >= puntajeMinimo;
    await this.intentos.save(this.intentos.create({ tenantId: this.ctx.tenantId, userId, modulo: key, version: m.version, puntaje, aprobado, respuestas: detalle }));
    const p = await this.fila(userId, key);
    p.intentos += 1;
    p.mejorPuntaje = Math.max(p.mejorPuntaje ?? 0, puntaje);
    p.vistoAt ??= new Date();
    p.versionVista = Math.max(p.versionVista ?? 0, m.version);
    if (aprobado) {
      p.aprobadoAt = new Date();
      p.versionAprobada = m.version;
    }
    await this.progresos.save(p);
    const fallos = detalle.filter((d) => !d.correcta);
    if (fallos.length) await this.evento('quiz_fallo', key, { preguntas: fallos.map((f) => f.id), puntaje }, userId);
    // Las respuestas correctas solo se muestran al aprobar; antes, solo cuáles fallaron y por qué.
    return {
      puntaje,
      aprobado,
      puntajeMinimo,
      buenas,
      total: m.quiz.length,
      preguntas: m.quiz.map((q) => {
        const d = detalle.find((x) => x.id === q.id)!;
        return { id: q.id, correcta: d.correcta, explicacion: d.correcta || aprobado ? q.explicacion : null, respuesta: aprobado ? q.correcta : null };
      }),
    };
  }

  async registrarEventoDePantalla(tipo: string, modulo: string | null, detalle: Record<string, unknown> = {}) {
    if (!EVENTOS_DE_PANTALLA.has(tipo)) throw new BadRequestException('Tipo de evento no válido.');
    if (modulo && !MODULO_POR_KEY.has(modulo)) throw new BadRequestException('Módulo no válido.');
    // Solo valores simples y cortos: el detalle es para el panel de fricciones, no un almacén de datos.
    const limpio: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(detalle ?? {}).slice(0, 10)) {
      if (typeof v === 'string') limpio[k.slice(0, 40)] = v.slice(0, 300);
      else if (typeof v === 'number' && Number.isFinite(v)) limpio[k.slice(0, 40)] = v;
      else if (typeof v === 'boolean') limpio[k.slice(0, 40)] = v;
    }
    await this.evento(tipo, modulo, limpio, this.usuario());
    return { ok: true };
  }

  /**
   * Panel de fricciones (administradores): dónde se equivoca la gente, qué pregunta, qué falla en cada módulo, quién
   * va atrasado y qué contenido quedó viejo frente al código. Es lo que alimenta la mejora continua.
   */
  async fricciones(dias = 30) {
    const tenantId = this.ctx.tenantId;
    const desde = new Date(Date.now() - Math.min(Math.max(dias, 1), 180) * 86_400_000);
    const [eventos, intentos, ajustes, usuarios, progresos] = await Promise.all([
      this.eventos.find({ where: { tenantId, createdAt: MoreThanOrEqual(desde) }, order: { createdAt: 'DESC' }, take: 5000 }),
      this.intentos.find({ where: { tenantId, createdAt: MoreThanOrEqual(desde) }, take: 5000 }),
      this.ajustes(),
      this.users.find({ where: { tenantId, isActive: true } }),
      this.progresos.find({ where: { tenantId } }),
    ]);

    const porModulo = new Map<string, { errores: number; bloqueos: number; preguntasMia: number; fallosQuiz: number; aperturas: number; mensajes: Map<string, number>; ejemplosMia: string[] }>();
    const de = (k: string) => {
      let v = porModulo.get(k);
      if (!v) porModulo.set(k, (v = { errores: 0, bloqueos: 0, preguntasMia: 0, fallosQuiz: 0, aperturas: 0, mensajes: new Map(), ejemplosMia: [] }));
      return v;
    };
    for (const e of eventos) {
      const k = e.modulo ?? 'sin_modulo';
      const v = de(k);
      if (e.tipo === 'error_api') {
        v.errores += 1;
        const msg = String(e.detalle?.mensaje ?? '').slice(0, 140);
        if (msg) v.mensajes.set(msg, (v.mensajes.get(msg) ?? 0) + 1);
      } else if (e.tipo === 'bloqueo_academy') v.bloqueos += 1;
      else if (e.tipo === 'pregunta_mia') {
        v.preguntasMia += 1;
        if (v.ejemplosMia.length < 5 && typeof e.detalle?.pregunta === 'string') v.ejemplosMia.push(e.detalle.pregunta.slice(0, 200));
      } else if (e.tipo === 'quiz_fallo') v.fallosQuiz += 1;
      else if (e.tipo === 'leccion_abierta') v.aperturas += 1;
    }

    // Preguntas del quiz que más se fallan: señal de que la pantalla o la explicación no es clara.
    const preguntas = new Map<string, { modulo: string; intentos: number; fallos: number }>();
    for (const i of intentos) {
      for (const r of i.respuestas ?? []) {
        const k = `${i.modulo}:${r.id}`;
        const v = preguntas.get(k) ?? { modulo: i.modulo, intentos: 0, fallos: 0 };
        v.intentos += 1;
        if (!r.correcta) v.fallos += 1;
        preguntas.set(k, v);
      }
    }
    const preguntasDificiles = [...preguntas.entries()]
      .map(([k, v]) => {
        const id = k.split(':')[1];
        const q = MODULO_POR_KEY.get(v.modulo)?.quiz.find((x) => x.id === id);
        return { modulo: v.modulo, id, pregunta: q?.pregunta ?? id, intentos: v.intentos, fallos: v.fallos, tasaFallo: Math.round((v.fallos / v.intentos) * 100) };
      })
      .filter((x) => x.intentos >= 2 && x.tasaFallo >= 30)
      .sort((a, b) => b.tasaFallo - a.tasaFallo || b.intentos - a.intentos)
      .slice(0, 15);

    // Avance de cada persona frente a su plan.
    const personas: Array<{ id: string; nombre: string; email: string; modulos: number; vistos: number; obligatorios: number; aprobados: number; pendientes: string[]; exento: boolean }> = [];
    for (const u of usuarios) {
      const permisos = await this.permisosDe(u.id);
      const plan = planDe(permisos);
      const obligatorios = plan.filter((m) => quizObligatorio(m, permisos));
      const suyos = new Map(progresos.filter((p) => p.userId === u.id).map((p) => [p.modulo, p]));
      const aprobados = obligatorios.filter((m) => this.estado(m, suyos.get(m.key)) === 'aprobado');
      personas.push({
        id: u.id,
        nombre: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email,
        email: u.email,
        modulos: plan.length,
        vistos: plan.filter((m) => this.estado(m, suyos.get(m.key)) !== 'pendiente').length,
        obligatorios: obligatorios.length,
        aprobados: aprobados.length,
        pendientes: obligatorios.filter((m) => !aprobados.includes(m)).map((m) => m.titulo),
        exento: ajustes.exentos.includes(u.id),
      });
    }
    personas.sort((a, b) => a.aprobados / Math.max(a.obligatorios, 1) - b.aprobados / Math.max(b.obligatorios, 1));

    // Contenido viejo: el código de la pantalla cambió después de la última revisión del contenido.
    const porRevisar = MODULOS_ACADEMY.flatMap((m) => {
      const cambio = CAMBIOS_DE_CODIGO[m.key];
      return cambio && cambio.fecha > m.revisado ? [{ modulo: m.key, titulo: m.titulo, revisado: m.revisado, codigoCambio: cambio.fecha, commit: cambio.commit, resumen: cambio.resumen }] : [];
    });

    const modulos = MODULOS_ACADEMY.map((m) => {
      const v = porModulo.get(m.key);
      return {
        key: m.key,
        titulo: m.titulo,
        errores: v?.errores ?? 0,
        bloqueos: v?.bloqueos ?? 0,
        preguntasMia: v?.preguntasMia ?? 0,
        fallosQuiz: v?.fallosQuiz ?? 0,
        aperturas: v?.aperturas ?? 0,
        friccion: (v?.errores ?? 0) * 2 + (v?.bloqueos ?? 0) * 3 + (v?.preguntasMia ?? 0) + (v?.fallosQuiz ?? 0) * 2,
        erroresFrecuentes: [...(v?.mensajes ?? new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([mensaje, veces]) => ({ mensaje, veces })),
        ejemplosMia: v?.ejemplosMia ?? [],
      };
    }).sort((a, b) => b.friccion - a.friccion);

    return { desde: desde.toISOString(), ajustes, modulos, preguntasDificiles, personas, porRevisar };
  }

  async guardarAjustes(cambios: Partial<AjustesAcademy>) {
    const t = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
    if (!t) throw new NotFoundException('Tenant no encontrado.');
    const actual = ajustesDe(t.settings as Record<string, unknown> | undefined);
    const nuevo: AjustesAcademy = {
      exigirCertificacion: typeof cambios.exigirCertificacion === 'boolean' ? cambios.exigirCertificacion : actual.exigirCertificacion,
      puntajeMinimo: cambios.puntajeMinimo !== undefined ? ajustesDe({ academy: { puntajeMinimo: cambios.puntajeMinimo } }).puntajeMinimo : actual.puntajeMinimo,
      exentos: Array.isArray(cambios.exentos) ? [...new Set(cambios.exentos.filter((x) => typeof x === 'string'))] : actual.exentos,
    };
    if (nuevo.exentos.length) {
      const existen = await this.users.find({ where: { tenantId: this.ctx.tenantId, id: In(nuevo.exentos) } });
      nuevo.exentos = existen.map((u) => u.id);
    }
    t.settings = { ...(t.settings ?? {}), academy: nuevo } as typeof t.settings;
    await this.tenants.save(t);
    await this.evento('ajustes', null, { ...nuevo }, this.usuario());
    return nuevo;
  }

  private usuario(): string {
    const id = this.ctx.userId;
    if (!id) throw new ForbiddenException('No autenticado');
    return id;
  }

  private async fila(userId: string, modulo: string): Promise<AcademyProgreso> {
    return (
      (await this.progresos.findOne({ where: { tenantId: this.ctx.tenantId, userId, modulo } })) ??
      this.progresos.create({ tenantId: this.ctx.tenantId, userId, modulo, intentos: 0, segundos: 0, vistoAt: null, versionVista: null, aprobadoAt: null, versionAprobada: null, mejorPuntaje: null })
    );
  }

  private async evento(tipo: string, modulo: string | null, detalle: Record<string, unknown>, userId: string | null) {
    await this.eventos.save(this.eventos.create({ tenantId: this.ctx.tenantId, userId, modulo, tipo, detalle }));
  }
}
