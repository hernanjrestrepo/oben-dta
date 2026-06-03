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
} from '@nestjs/common';
import type { Response } from 'express';
import { QuotesService } from './quotes.service';
import type { ProcessEmailDto } from './quotes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post('email')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async receiveEmail(@Body() dto: ProcessEmailDto) {
    return this.quotesService.processIncomingEmail(dto);
  }

  @Get()
  async findAll() {
    return this.quotesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.quotesService.findOne(id);
  }

  @Post(':id/pdf')
  async generatePdf(@Param('id') id: string) {
    return this.quotesService.generateAndSendPdf(id);
  }

  @Get(':id/pdf')
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
  async approveQuote(
    @Param('id') quoteId: string,
    @Body('emailId') emailId: string,
  ) {
    return this.quotesService.approveQuote(emailId, quoteId);
  }

  @Post(':id/payment-link')
  async createPaymentLink(@Param('id') id: string) {
    return this.quotesService.createPaymentLink(id);
  }

  @Post(':id/pay')
  async simulatePayment(@Param('id') id: string) {
    return this.quotesService.simulatePayment(id);
  }

  @Post(':id/production')
  async moveToProduction(@Param('id') id: string) {
    return this.quotesService.moveToProduction(id);
  }

  @Post(':id/ready')
  async markReady(@Param('id') id: string) {
    return this.quotesService.markReady(id);
  }

  @Post(':id/delivered')
  async markDelivered(@Param('id') id: string) {
    return this.quotesService.markDelivered(id);
  }

  @Get('inbox/emails')
  async getInbox() {
    return this.quotesService.getInbox();
  }
}
