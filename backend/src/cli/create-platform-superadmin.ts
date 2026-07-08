import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { User } from '../entities/user.entity';
import { PlatformRolesService } from '../modules/security/platform-roles.service';

/**
 * Bootstrap del primer SuperAdmin de plataforma.
 *
 * Resuelve el problema del huevo-y-la-gallina: platform.users.manage y
 * platform.tenants.manage solo los otorga un platform role, y el único
 * endpoint para asignar platform roles requiere ya tener ese permiso. Este
 * script usa las MISMAS clases de servicio que la API (PlatformRolesService),
 * no SQL manual, y es idempotente: si el usuario ya existe, solo asegura el
 * rol asignado (y opcionalmente resetea el password con --password).
 *
 * Uso:
 *   npm run platform:bootstrap -- --email=admin@paradixe.com --password=... --firstName=Admin --lastName=Paradixe
 *   npm run platform:bootstrap -- --email=admin@paradixe.com --role=platform.support
 */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]] = m[2] ?? 'true';
  }
  return out;
}

async function run() {
  const logger = new Logger('PlatformBootstrapCLI');
  const args = parseArgs(process.argv.slice(2));

  if (!args.email) {
    logger.error('Falta --email=<correo>. Ejemplo: npm run platform:bootstrap -- --email=admin@paradixe.com --password=...');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const users = app.get<Repository<User>>(getRepositoryToken(User));
    const platformRoles = app.get(PlatformRolesService);
    const roleKey = args.role ?? 'platform.superadmin';

    let user = await users.findOne({ where: { email: args.email, tenantId: IsNull() } });

    if (!user) {
      if (!args.password) {
        logger.error('Usuario nuevo: falta --password=<password> (mínimo 8 caracteres).');
        process.exit(1);
        return;
      }
      const passwordHash = await bcrypt.hash(args.password, 12);
      user = await users.save(users.create({
        tenantId: null,
        firstName: args.firstName ?? 'Super',
        lastName: args.lastName ?? 'Admin',
        email: args.email,
        passwordHash,
        isActive: true,
        isSuperAdmin: false,
      }));
      logger.log(`Usuario de plataforma creado: ${user.email} (${user.id})`);
    } else {
      logger.log(`Usuario de plataforma existente reutilizado: ${user.email} (${user.id})`);
      if (args.password) {
        user.passwordHash = await bcrypt.hash(args.password, 12);
        await users.save(user);
        logger.log('Password actualizado.');
      }
    }

    await platformRoles.assign({ userId: user.id, platformRoleKey: roleKey }, user.id);
    logger.log(`Rol de plataforma asegurado: ${roleKey}`);
    logger.log('LISTO. Login vía POST /auth/platform-login con email + password.');
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
