import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './dto/create-product.dto';
import { TenantContext } from '../../common/tenant/tenant-context.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    private readonly ctx: TenantContext,
  ) {}

  private tenantWhere<T extends object>(where: T): T & { tenantId: string } {
    return { ...where, tenantId: this.ctx.tenantId } as T & { tenantId: string };
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.productRepository.create({
      ...dto,
      stock: dto.stock ?? 0,
      committed: dto.committed ?? 0,
      isActive: dto.isActive ?? true,
      tenantId: this.ctx.tenantId,
    });
    return this.productRepository.save(product);
  }

  async findAll(page: number = 1, limit: number = 50): Promise<Product[]> {
    return this.productRepository.find({
      where: { tenantId: this.ctx.tenantId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: this.tenantWhere({ id }),
    });
    if (!product) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    return product;
  }

  async findBySku(sku: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: this.tenantWhere({ sku }),
    });
    if (!product) throw new NotFoundException(`Producto ${sku} no encontrado`);
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    await this.productRepository.update(this.tenantWhere({ id }), dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.productRepository.delete(this.tenantWhere({ id }));
    if (result.affected === 0) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }
  }

  async updateStock(
    id: string,
    quantity: number,
    isCommit: boolean = false,
  ): Promise<Product> {
    const product = await this.findOne(id);
    if (isCommit) {
      product.committed += quantity;
    } else {
      product.stock = Math.max(0, product.stock - quantity);
    }
    return this.productRepository.save(product);
  }
}
