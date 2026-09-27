import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProductEquivalence } from '../../entities/client-product-equivalence.entity';
import { Client } from '../../entities/client.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { CreateEquivalenceDto, UpdateEquivalenceDto } from './dto/client-product-equivalence.dto';
import { pick, readTabular, type TabularImportDto, type TabularImportResult } from '../../common/import/tabular-import';

export interface EquivalenceImportRow {
  clientId: string;
  cliente: string;
  clientCode: string;
  obenCode: string;
  description: string | null;
  accion: 'crear' | 'actualizar';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DUPLICATE_KEY_CODE = '23505';

/**
 * Homologación cliente↔producto (ver ClientProductEquivalence): CRUD
 * administrable, carga masiva desde el Excel de Alejandra y fuente de la
 * traducción automática de las órdenes de compra (ComercialIntakeService).
 */
@Injectable()
export class EquivalencesService {
  constructor(
    @InjectRepository(ClientProductEquivalence)
    private readonly repo: Repository<ClientProductEquivalence>,
    @InjectRepository(Client)
    private readonly clients: Repository<Client>,
    private readonly ctx: TenantContext,
  ) {}

  async create(dto: CreateEquivalenceDto): Promise<ClientProductEquivalence> {
    // La tabla no tiene FK a clients y la relación `client` es eager: sin
    // esta verificación se podía apuntar a un cliente de OTRO tenant (y
    // luego leer sus datos al listar las equivalencias).
    const client = await this.clients.findOne({ where: { id: dto.clientId, tenantId: this.ctx.tenantId } });
    if (!client) throw new NotFoundException(`Cliente ${dto.clientId} no encontrado`);
    const entity = this.repo.create({
      ...dto,
      clientCode: dto.clientCode.trim(),
      obenCode: dto.obenCode.trim(),
      tenantId: this.ctx.tenantId,
    });
    try {
      return await this.repo.save(entity);
    } catch (err) {
      throw this.mapWriteError(err, dto.clientCode);
    }
  }

  async findAll(clientId?: string): Promise<ClientProductEquivalence[]> {
    return this.repo.find({
      where: { tenantId: this.ctx.tenantId, ...(clientId ? { clientId } : {}) },
      order: { clientCode: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ClientProductEquivalence> {
    const found = await this.repo.findOne({ where: { tenantId: this.ctx.tenantId, id } });
    if (!found) throw new NotFoundException(`Equivalencia ${id} no encontrada`);
    return found;
  }

  async update(id: string, dto: UpdateEquivalenceDto): Promise<ClientProductEquivalence> {
    const equivalence = await this.findOne(id);
    Object.assign(equivalence, {
      ...dto,
      ...(dto.clientCode !== undefined ? { clientCode: dto.clientCode.trim() } : {}),
      ...(dto.obenCode !== undefined ? { obenCode: dto.obenCode.trim() } : {}),
    });
    try {
      return await this.repo.save(equivalence);
    } catch (err) {
      throw this.mapWriteError(err, dto.clientCode ?? equivalence.clientCode);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete({ tenantId: this.ctx.tenantId, id });
  }

  /**
   * Resuelve la referencia interna de Oben a partir de cómo la nombró el
   * cliente en su orden de compra. `null` si no hay homologación registrada
   * — nunca se adivina un código que no está en la tabla.
   */
  async resolve(clientId: string, clientCode: string): Promise<string | null> {
    // TypeORM IGNORA las condiciones `undefined` del where: sin esto, un
    // clientId ausente devolvía la equivalencia de CUALQUIER cliente con ese
    // código — un código adivinado.
    if (!clientId?.trim() || !clientCode?.trim()) {
      throw new BadRequestException('clientId y clientCode son obligatorios para resolver una equivalencia.');
    }
    const found = await this.repo.findOne({
      where: { tenantId: this.ctx.tenantId, clientId, clientCode: clientCode.trim() },
    });
    return found?.obenCode ?? null;
  }

  /**
   * Carga masiva de la tabla de equivalencias (Excel/CSV/JSON) que entregue
   * Alejandra. Columnas: cliente (código interno, código en OBEN MAS, nombre
   * exacto o id), código del cliente, código Oben, descripción. Todo o nada:
   * si una fila tiene un error, no se escribe ninguna. Actualiza por
   * (cliente, código del cliente).
   */
  async importEquivalences(dto: TabularImportDto): Promise<TabularImportResult<EquivalenceImportRow>> {
    const rows = readTabular(dto);
    const tenantId = this.ctx.tenantId;
    const clients = await this.clients.find({ where: { tenantId } });
    const findClient = (ref: string): Client | null => {
      const r = ref.trim().toLowerCase();
      const hits = clients.filter(
        (c) =>
          (UUID_RE.test(ref) && c.id === ref) ||
          c.clientId.toLowerCase() === r ||
          (c.obenCode ?? '').toLowerCase() === r ||
          c.name.trim().toLowerCase() === r,
      );
      return hits.length === 1 ? hits[0] : null;
    };

    const errores: Array<{ fila: number; error: string }> = [];
    const filas: EquivalenceImportRow[] = [];
    const seen = new Set<string>();
    for (const [i, row] of rows.entries()) {
      const fila = i + 2;
      try {
        const ref = pick(row, 'cliente', 'codigo cliente oben', 'codigo oben cliente', 'clientId', 'id cliente');
        const clientCode = pick(row, 'codigo del cliente', 'codigo cliente', 'referencia cliente', 'como lo pide el cliente', 'clientCode');
        const obenCode = pick(row, 'codigo oben', 'referencia oben', 'obenCode', 'codigo interno');
        if (!ref) throw new Error('falta el cliente');
        if (!clientCode) throw new Error('falta el código/nombre con que el cliente pide el material');
        if (!obenCode) throw new Error('falta la referencia de Oben');
        const client = findClient(ref);
        if (!client) throw new Error(`cliente "${ref}" no encontrado (o ambiguo) — cárgalo primero en el maestro de clientes`);
        const key = `${client.id}|${clientCode.toLowerCase()}`;
        if (seen.has(key)) throw new Error(`"${clientCode}" está repetido para ${client.name}`);
        seen.add(key);
        const existing = await this.repo.findOne({ where: { tenantId, clientId: client.id, clientCode } });
        filas.push({
          clientId: client.id,
          cliente: client.name,
          clientCode,
          obenCode,
          description: pick(row, 'descripcion', 'description', 'observacion') || null,
          accion: existing ? 'actualizar' : 'crear',
        });
      } catch (err) {
        errores.push({ fila, error: (err as Error).message });
      }
    }

    const result: TabularImportResult<EquivalenceImportRow> = {
      dryRun: !!dto.dryRun,
      total: rows.length,
      creados: errores.length ? 0 : filas.filter((f) => f.accion === 'crear').length,
      actualizados: errores.length ? 0 : filas.filter((f) => f.accion === 'actualizar').length,
      errores,
      filas,
    };
    if (dto.dryRun || errores.length > 0) return result;

    for (const f of filas) {
      const existing = await this.repo.findOne({ where: { tenantId, clientId: f.clientId, clientCode: f.clientCode } });
      await this.repo.save(
        this.repo.create({
          ...(existing ? { id: existing.id } : {}),
          tenantId,
          clientId: f.clientId,
          clientCode: f.clientCode,
          obenCode: f.obenCode,
          description: f.description,
        }),
      );
    }
    return result;
  }

  private mapWriteError(err: unknown, clientCode: string): Error {
    if ((err as { code?: string }).code === DUPLICATE_KEY_CODE) {
      return new ConflictException(`Ya existe una equivalencia para "${clientCode}" con este cliente.`);
    }
    return err as Error;
  }
}
