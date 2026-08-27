import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { FreightInlandRate } from '../../entities/freight-inland-rate.entity';
import { FreightTransloadRate } from '../../entities/freight-transload-rate.entity';
import { FreightDestinationSurcharge } from '../../entities/freight-destination-surcharge.entity';

/**
 * Lectura del maestro de tarifas de flete (cargado por
 * FreightRateImportService desde el archivo real que envía el forwarder de
 * Oben). Solo lectura — el reemplazo completo sigue siendo vía el conector de
 * correo (clasificación `freight_rates`), no por API.
 */
@UseGuards(JwtAuthGuard)
@Controller('freight-rates')
export class FreightRatesController {
  constructor(
    @InjectRepository(FreightInlandRate)
    private readonly inland: Repository<FreightInlandRate>,
    @InjectRepository(FreightTransloadRate)
    private readonly transload: Repository<FreightTransloadRate>,
    @InjectRepository(FreightDestinationSurcharge)
    private readonly surcharges: Repository<FreightDestinationSurcharge>,
    private readonly ctx: TenantContext,
  ) {}

  @Get('inland')
  async getInland(@Query('country') country?: string) {
    return this.inland.find({
      where: { tenantId: this.ctx.tenantId, ...(country ? { country: country as 'USA' | 'CA' } : {}) },
      order: { state: 'ASC', destinationPort: 'ASC' },
    });
  }

  @Get('transload')
  async getTransload() {
    return this.transload.find({
      where: { tenantId: this.ctx.tenantId },
      order: { destinationPort: 'ASC' },
    });
  }

  @Get('destination-surcharges')
  async getSurcharges(@Query('country') country?: string) {
    return this.surcharges.find({
      where: { tenantId: this.ctx.tenantId, ...(country ? { country: country as never } : {}) },
      order: { country: 'ASC' },
    });
  }
}
