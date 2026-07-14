import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermission } from './require-permission.decorator';
import { UsersService } from './users.service';
import {
  CreateTenantUserDto,
  ResetTenantUserPasswordDto,
  UpdateTenantUserDto,
} from './dto/security.dto';

/**
 * Administración Enterprise: CRUD de usuarios del tenant. Separado de
 * SecurityController (roles/permisos) por claridad de responsabilidad, pero
 * comparte el mismo esquema de permisos users.* — nunca un rol hardcodeado.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('users.read')
  list() {
    return this.usersService.list();
  }

  @Get(':id')
  @RequirePermission('users.read')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @RequirePermission('users.create')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(
    @Body() dto: CreateTenantUserDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.usersService.create(dto, req.user.sub);
  }

  @Put(':id')
  @RequirePermission('users.update')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  update(@Param('id') id: string, @Body() dto: UpdateTenantUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('users.delete')
  remove(@Param('id') id: string, @Req() req: { user: { sub: string } }) {
    return this.usersService.remove(id, req.user.sub);
  }

  @Post(':id/activate')
  @RequirePermission('users.update')
  activate(@Param('id') id: string) {
    return this.usersService.setActive(id, true);
  }

  @Post(':id/deactivate')
  @RequirePermission('users.update')
  deactivate(@Param('id') id: string) {
    return this.usersService.setActive(id, false);
  }

  @Post(':id/lock')
  @RequirePermission('users.update')
  lock(@Param('id') id: string) {
    return this.usersService.lock(id);
  }

  @Post(':id/unlock')
  @RequirePermission('users.update')
  unlock(@Param('id') id: string) {
    return this.usersService.unlock(id);
  }

  @Post(':id/reset-password')
  @RequirePermission('users.update')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetTenantUserPasswordDto,
  ) {
    return this.usersService.resetPassword(id, dto.password);
  }
}
