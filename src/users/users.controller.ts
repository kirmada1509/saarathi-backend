import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('api/users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        user_id: true,
        home_airport: true,
        home_city: true,
        raw_history: true,
        age: true,
        price_sensitivity: true,
        direct_preference: true,
        preferred_cabin: true,
        preferred_airlines: true,
      },
    });
  }
}
