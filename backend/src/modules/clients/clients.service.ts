import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../../entities/client.entity';
import { CreateClientDto, UpdateClientDto } from './dto/create-client.dto';
import { UserRole } from '../auth/dto/auth.dto';

export interface RequestingUser {
  sub: string;
  role: UserRole;
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
  ) {}

  async create(dto: CreateClientDto, userId?: string): Promise<Client> {
    const existing = await this.clientRepository.findOne({
      where: { clientId: dto.clientId },
    });
    if (existing) {
      throw new ConflictException(`El cliente con ID ${dto.clientId} ya existe`);
    }

    const client = this.clientRepository.create({
      ...dto,
      usedCredit: 0,
      isActive: dto.isActive ?? true,
      createdBy: userId,
    });
    return this.clientRepository.save(client);
  }

  async findAll(userId?: string, page: number = 1, limit: number = 50): Promise<Client[]> {
    const where: any = {};
    if (userId) {
      where.createdBy = userId;
    }
    return this.clientRepository.find({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, requestingUser?: RequestingUser): Promise<Client> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }
    this.assertOwnership(client, requestingUser);
    return client;
  }

  async findByClientId(clientId: string): Promise<Client> {
    const client = await this.clientRepository.findOne({ where: { clientId } });
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
    // findOne enforces ownership before any mutation is allowed
    await this.findOne(id, requestingUser);
    await this.clientRepository.update(id, dto);
    return this.findOne(id, requestingUser);
  }

  async remove(id: string, requestingUser?: RequestingUser): Promise<void> {
    await this.findOne(id, requestingUser);
    const result = await this.clientRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }
  }

  async updateCreditUsed(clientId: string, amount: number): Promise<void> {
    await this.clientRepository.increment({ clientId }, 'usedCredit', amount);
  }

  // Records created before ownership tracking existed (createdBy === null)
  // are treated as house accounts and remain visible to any authenticated
  // user. Admins bypass ownership entirely.
  private assertOwnership(client: Client, requestingUser?: RequestingUser): void {
    if (!requestingUser || requestingUser.role === UserRole.ADMIN) {
      return;
    }
    if (client.createdBy && client.createdBy !== requestingUser.sub) {
      throw new ForbiddenException('No tiene permisos para acceder a este cliente');
    }
  }
}
