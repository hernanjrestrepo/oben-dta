import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermission } from './require-permission.decorator';
import { PlatformUsersService } from './platform-users.service';
import { CreatePlatformUserDto, UpdatePlatformUserDto } from './dto/security.dto';

@Controller('platform/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlatformUsersController {
  constructor(private readonly platformUsers: PlatformUsersService) {}

  @Get()
  @RequirePermission('platform.users.read')
  list() {
    return this.platformUsers.list();
  }

  @Get(':id')
  @RequirePermission('platform.users.read')
  findOne(@Param('id') id: string) {
    return this.platformUsers.findById(id);
  }

  @Post()
  @RequirePermission('platform.users.manage')
  create(@Body() dto: CreatePlatformUserDto, @Req() req: { user: { sub: string } }) {
    return this.platformUsers.create(dto, req.user.sub);
  }

  @Patch(':id')
  @RequirePermission('platform.users.manage')
  update(@Param('id') id: string, @Body() dto: UpdatePlatformUserDto) {
    return this.platformUsers.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('platform.users.manage')
  remove(@Param('id') id: string) {
    return this.platformUsers.remove(id);
  }
}
