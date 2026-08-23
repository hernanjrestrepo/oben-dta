import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  ValidationPipe,
  UsePipes,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { QuotesService } from './quotes.service';
import type { ProcessEmailDto } from './quotes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { Idempotent } from '../idempotency/idempotent.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post('email')
  @RequirePermission('quotes.create')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent('quote_email')
  async receiveEmail(@Body() dto: ProcessEmailDto) {
    return this.quotesService.processIncomingEmail(dto);
  }

  @Get()
  @RequirePermission('quotes.read')
  async findAll() {
    return this.quotesService.findAll();
  }

  @Get(':id')
  @RequirePermission('quotes.read')
  async findOne(@Param('id') id: string) {
    return this.quotesService.findOne(id);
  }

  @Post(':id/pdf')
  @RequirePermission('quotes.update')
  async generatePdf(@Param('id') id: string) {
    return this.quotesService.generateAndSendPdf(id);
  }

  @Get(':id/pdf')
  @RequirePermission('quotes.read')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const quote = await this.quotesService.findOne(id);
    if (!quote.pdfUrl) {
      return res.status(404).json({ error: 'PDF no generado' });
    }
    const base64 = quote.pdfUrl.replace('data:application/pdf;base64,', '');
    const buffer = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="COT-${quote.quoteNumber}.pdf"`,
    );
    res.send(buffer);
  }

  @Post(':id/approve')
  @RequirePermission('quotes.approve')
  async approveQuote(
    @Param('id') quoteId: string,
    @Body('emailId') emailId: string,
  ) {
    return this.quotesService.approveQuote(emailId, quoteId);
  }

  @Post(':id/reject')
  @RequirePermission('quotes.approve')
  async rejectQuote(
    @Param('id') quoteId: string,
    @Body('emailId') emailId: string,
  ) {
    return this.quotesService.rejectQuote(emailId, quoteId);
  }

  @Post(':id/payment-link')
  @RequirePermission('quotes.update')
  async createPaymentLink(@Param('id') id: string) {
    return this.quotesService.createPaymentLink(id);
  }

  @Post(':id/pay')
  @RequirePermission('invoices.mark_paid')
  async simulatePayment(@Param('id') id: string) {
    return this.quotesService.simulatePayment(id);
  }

  @Post(':id/production')
  @RequirePermission('production.execute')
  async moveToProduction(@Param('id') id: string) {
    return this.quotesService.moveToProduction(id);
  }

  @Post(':id/ready')
  @RequirePermission('production.execute')
  async markReady(@Param('id') id: string) {
    return this.quotesService.markReady(id);
  }

  @Post(':id/delivered')
  @RequirePermission('orders.update')
  async markDelivered(@Param('id') id: string) {
    return this.quotesService.markDelivered(id);
  }

  @Get('inbox/emails')
  @RequirePermission('quotes.read')
  async getInbox() {
    return this.quotesService.getInbox();
  }
}
