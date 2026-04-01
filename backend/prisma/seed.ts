import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
  const usersToSeed = [
    {
      role: 'admin' as const,
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      name: process.env.ADMIN_NAME || 'Administrator',
    },
    {
      role: 'manager' as const,
      email: process.env.MANAGER_EMAIL,
      password: process.env.MANAGER_PASSWORD,
      name: process.env.MANAGER_NAME || 'Manager',
    },
  ];

  for (const userConfig of usersToSeed) {
    if (!userConfig.email || !userConfig.password) {
      console.log(
        `🌱 Skipping ${userConfig.role} seed: ${userConfig.role.toUpperCase()}_EMAIL or ${userConfig.role.toUpperCase()}_PASSWORD not provided.`
      );
      continue;
    }

    const normalizedEmail = userConfig.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      if (existing.role !== userConfig.role) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            role: userConfig.role,
            name: userConfig.name,
          },
        });
        console.log(`🌱 Promoted existing user to ${userConfig.role}: ${normalizedEmail}`);
      } else {
        console.log(`🌱 ${userConfig.role} user already exists: ${normalizedEmail}`);
      }
      continue;
    }

    const hashed = await bcrypt.hash(userConfig.password, 10);
    await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashed,
        name: userConfig.name,
        role: userConfig.role,
      },
    });

    console.log(`🌱 ${userConfig.role} user created: ${normalizedEmail}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
