import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { NotificationService } from '../services/notification.service';
import {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationStatus,
} from '../entities/notification.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Returns user notifications' })
  async getUserNotifications(
    @Request() req,
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
    @Query('status') status?: NotificationStatus,
  ): Promise<{ notifications: Notification[]; total: number }> {
    return await this.notificationService.getUserNotifications(
      req.user.userId,
      limit,
      offset,
      status,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({
    status: 200,
    description: 'Returns unread notification count',
  })
  async getUnreadCount(@Request() req): Promise<{ count: number }> {
    const count = await this.notificationService.getUnreadCount(
      req.user.userId,
    );
    return { count };
  }

  @Get('high-priority')
  @ApiOperation({ summary: 'Get high priority notifications' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Returns high priority notifications',
  })
  async getHighPriorityNotifications(
    @Request() req,
    @Query('limit') limit: number = 5,
  ): Promise<Notification[]> {
    return await this.notificationService.getHighPriorityNotifications(
      req.user.userId,
      limit,
    );
  }

  @Get('category/:category')
  @ApiOperation({ summary: 'Get notifications by category' })
  @ApiParam({ name: 'category', type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Returns notifications by category',
  })
  async getNotificationsByCategory(
    @Param('category') category: string,
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
  ): Promise<{ notifications: Notification[]; total: number }> {
    return await this.notificationService.getNotificationsByCategory(
      category,
      limit,
      offset,
    );
  }

  @Put(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'Notification marked as read' })
  async markAsRead(@Param('id') id: string, @Request() req): Promise<void> {
    await this.notificationService.markAsRead(id, req.user.userId);
  }

  @Put('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark multiple notifications as read' })
  @ApiResponse({
    status: 200,
    description: 'Returns number of notifications marked as read',
  })
  async markMultipleAsRead(
    @Body() body: { notificationIds: string[] },
    @Request() req,
  ): Promise<{ marked: number }> {
    const marked = await this.notificationService.markMultipleAsRead(
      body.notificationIds,
      req.user.userId,
    );
    return { marked };
  }

  @Put(':id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dismiss notification' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'Notification dismissed' })
  async dismissNotification(
    @Param('id') id: string,
    @Request() req,
  ): Promise<void> {
    await this.notificationService.dismissNotification(id, req.user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete notification' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'Notification deleted' })
  async deleteNotification(
    @Param('id') id: string,
    @Request() req,
  ): Promise<void> {
    await this.notificationService.deleteNotification(id, req.user.userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get notification statistics' })
  @ApiResponse({ status: 200, description: 'Returns notification statistics' })
  async getNotificationStats(@Request() req): Promise<any> {
    return await this.notificationService.getNotificationStats(req.user.userId);
  }

  @Post('test')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create test notification' })
  @ApiResponse({ status: 201, description: 'Test notification created' })
  async createTestNotification(@Request() req): Promise<Notification> {
    return await this.notificationService.createNotification(
      NotificationType.INFO,
      NotificationPriority.NORMAL,
      'Test Notification',
      'This is a test notification',
      req.user.userId,
      'test',
    );
  }
}
