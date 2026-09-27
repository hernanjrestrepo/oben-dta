import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ArrayContains, ILike, Repository, IsNull } from 'typeorm';
import {
  parseBool,
  parseDomains,
  pick,
  readTabular,
  type TabularImportDto,
  type TabularImportResult,
} from '../../common/import/tabular-import';
import { Client } from '../../entities/client.entity';
import { CreateClientDto, UpdateClientDto } from './dto/create-client.dto';
import { UserRole } from '../auth/dto/auth.dto';
import { TenantContext } from '../../common/tenant/tenant-context.service';

export interface ClientImportRow {
  clientId: string;
  name: string;
  email: string;
  obenCode: string | null;
  authorizedDomains: string[];
  comercialEmail: string | null;
  phone: string | null;
  address: string | null;
  finalCustomerInSubject: boolean;
  accion: 'crear' | 'actualizar';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RequestingUser {
  sub: string;
  role: UserRole;
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    private readonly ctx: TenantContext,
  ) {}

  private tenantWhere<T extends object>(where: T): T & { tenantId: string } {
    return { ...where, tenantId: this.ctx.tenantId };
  }

  async create(dto: CreateClientDto, userId?: string): Promise<Client> {
    const existing = await this.clientRepository.findOne({
      where: this.tenantWhere({ clientId: dto.clientId }),
    });
    if (existing) {
      throw new ConflictException(
        `El cliente con ID ${dto.clientId} ya existe`,
      );
    }

    const client = this.clientRepository.create({
      ...dto,
      authorizedDomains: this.domains(dto.authorizedDomains),
      usedCredit: 0,
      isActive: dto.isActive ?? true,
      createdBy: userId,
      tenantId: this.ctx.tenantId,
    });
    return this.clientRepository.save(client);
  }

  async findAll(
    requestingUser?: RequestingUser,
    page: number = 1,
    limit: number = 50,
  ): Promise<Client[]> {
    const tenantId = this.ctx.tenantId;
    const isAdmin = !requestingUser || requestingUser.role === UserRole.ADMIN;
    const where = isAdmin
      ? { tenantId }
      : [
          { tenantId, createdBy: requestingUser.sub },
          { tenantId, createdBy: IsNull() },
        ];
    return this.clientRepository.find({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, requestingUser?: RequestingUser): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: this.tenantWhere({ id }),
    });
    if (!client) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }
    this.assertOwnership(client, requestingUser);
    return client;
  }

  async findByClientId(clientId: string): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: this.tenantWhere({ clientId }),
    });
    if (!client) {
      throw new NotFoundException(`Cliente ${clientId} no encontrado`);
    }
    return client;
  }

  async update(
    id: string,
    dto: UpdateClientDto,
    requestingUser?: RequestingUser,
  ): Promise<Client> {
    await this.findOne(id, requestingUser);
    await this.clientRepository.update(this.tenantWhere({ id }), {
      ...dto,
      ...(dto.authorizedDomains !== undefined ? { authorizedDomains: this.domains(dto.authorizedDomains) } : {}),
    });
    return this.findOne(id, requestingUser);
  }

  async remove(id: string, requestingUser?: RequestingUser): Promise<void> {
    await this.findOne(id, requestingUser);
    const result = await this.clientRepository.delete(this.tenantWhere({ id }));
    if (result.affected === 0) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }
  }

  async updateCreditUsed(clientId: string, amount: number): Promise<void> {
    await this.clientRepository.increment(
      this.tenantWhere({ clientId }),
      'usedCredit',
      amount,
    );
  }

  /**
   * Cliente dueño de un dominio de correo: primero los dominios autorizados
   * (coincidencia EXACTA), luego el dominio de su `email`. Si más de un
   * cliente comparte el dominio (ej. gmail.com) es ambiguo: no se adivina.
   */
  async findByEmailDomain(domain: string): Promise<{ client: Client | null; ambiguous: boolean }> {
    const d = (domain ?? '').trim().toLowerCase();
    if (!d) return { client: null, ambiguous: false };
    const tenantId = this.ctx.tenantId;
    const escaped = d.replace(/[\\%_]/g, (c) => `\\${c}`);
    const matches = await this.clientRepository.find({
      where: [
        { tenantId, isActive: true, authorizedDomains: ArrayContains([d]) },
        { tenantId, isActive: true, email: ILike(`%@${escaped}`) },
      ],
    });
    const unique = [...new Map(matches.map((c) => [c.id, c])).values()];
    return unique.length === 1 ? { client: unique[0], ambiguous: false } : { client: null, ambiguous: unique.length > 1 };
  }

  /**
   * Carga masiva del maestro de clientes (Excel/CSV/JSON). Todo o nada: si
   * una fila tiene un error, no se escribe ninguna. Actualiza por código.
   */
  async importClients(dto: TabularImportDto, userId?: string): Promise<TabularImportResult<ClientImportRow>> {
    const rows = readTabular(dto);
    const errores: Array<{ fila: number; error: string }> = [];
    const filas: ClientImportRow[] = [];
    const seen = new Set<string>();

    for (const [i, row] of rows.entries()) {
      const fila = i + 2; // fila 1 = encabezados
      try {
        const obenCode = pick(row, 'codigo oben', 'codigo cliente oben', 'codigo oben mas', 'obenCode') || null;
        const clientId = pick(row, 'codigo', 'codigo interno', 'id cliente', 'clientId') || obenCode || '';
        const name = pick(row, 'nombre', 'cliente', 'razon social', 'name');
        const email = pick(row, 'email', 'correo', 'correo compras', 'email compras').toLowerCase();
        const comercial = pick(row, 'email comercial', 'correo comercial', 'comercial').toLowerCase();
        if (!clientId) throw new Error('falta el código del cliente (columna "codigo" o "codigo oben")');
        if (!name) throw new Error('falta el nombre del cliente');
        if (!EMAIL_RE.test(email)) throw new Error(`correo de compras inválido: "${email}"`);
        if (comercial && !EMAIL_RE.test(comercial)) throw new Error(`correo del comercial inválido: "${comercial}"`);
        if (seen.has(clientId)) throw new Error(`el código "${clientId}" está repetido en el archivo`);
        seen.add(clientId);
        const intermediario = pick(row, 'cliente final en asunto', 'intermediario');
        const flag = parseBool(intermediario);
        if (intermediario && flag === null) throw new Error(`"${intermediario}" no es sí/no (cliente final en asunto)`);
        const existing = await this.clientRepository.findOne({ where: this.tenantWhere({ clientId }) });
        filas.push({
          clientId,
          name,
          email,
          obenCode,
          authorizedDomains: parseDomains(pick(row, 'dominios', 'dominios autorizados', 'dominio')),
          comercialEmail: comercial || null,
          phone: pick(row, 'telefono', 'phone') || null,
          address: pick(row, 'direccion', 'address') || null,
          finalCustomerInSubject: flag ?? false,
          accion: existing ? 'actualizar' : 'crear',
        });
      } catch (err) {
        errores.push({ fila, error: (err as Error).message });
      }
    }

    const result: TabularImportResult<ClientImportRow> = {
      dryRun: !!dto.dryRun,
      total: rows.length,
      creados: filas.filter((f) => f.accion === 'crear').length,
      actualizados: filas.filter((f) => f.accion === 'actualizar').length,
      errores,
      filas,
    };
    if (dto.dryRun || errores.length > 0) return errores.length > 0 ? { ...result, creados: 0, actualizados: 0 } : result;

    for (const f of filas) {
      const { accion, phone, address, ...rest } = f;
      const data = { ...rest, ...(phone ? { phone } : {}), ...(address ? { address } : {}) };
      if (accion === 'actualizar') {
        await this.clientRepository.update(this.tenantWhere({ clientId: f.clientId }), data);
      } else {
        await this.clientRepository.save(
          this.clientRepository.create({ ...data, usedCredit: 0, isActive: true, createdBy: userId, tenantId: this.ctx.tenantId }),
        );
      }
    }
    return result;
  }

  private domains(value: string[] | undefined): string[] {
    try {
      return parseDomains(value ?? []);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  private assertOwnership(
    client: Client,
    requestingUser?: RequestingUser,
  ): void {
    if (!requestingUser || requestingUser.role === UserRole.ADMIN) return;
    if (client.createdBy && client.createdBy !== requestingUser.sub) {
      throw new ForbiddenException(
        'No tiene permisos para acceder a este cliente',
      );
    }
  }
}
