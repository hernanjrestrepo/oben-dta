import {
  Controller,
  Post,
  Body,
  ValidationPipe,
  UsePipes,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, PlatformLoginDto, ChangePasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionsGuard } from '../security/permissions.guard';
import { RequirePermission } from '../security/require-permission.decorator';

// Límite estricto por IP en endpoints de autenticación, más allá de los
// buckets globales — mitiga fuerza bruta contra credenciales específicas.
const AUTH_THROTTLE = { medium: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Ya NO es un registro público — crea un usuario dentro del tenant de
   * quien llama (ver AuthService.register). Requiere `users.create`.
   */
  @Post('register')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('users.create')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('platform-login')
  @Throttle(AUTH_THROTTLE)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async platformLogin(@Body() dto: PlatformLoginDto) {
    return this.authService.platformLogin(dto);
  }

  @Post('refresh')
  async refresh(
    @Body() body: { refreshToken?: string; refresh_token?: string },
  ) {
    // Acepta ambos nombres: login devuelve `refresh_token` (snake_case) y
    // algunos clientes envían `refreshToken` (camelCase). Hardening de
    // consistencia de API para que el refresh funcione con cualquiera.
    const token = body.refreshToken ?? body.refresh_token;
    if (!token) {
      throw new UnauthorizedException('Refresh token requerido');
    }
    return this.authService.refresh(token);
  }

  /** El propio usuario cambia su contraseña (obligatorio si entró con una temporal). */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async changePassword(@CurrentUser() user: { sub: string }, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: any) {
    return this.authService.logout(user.sub);
  }
}
