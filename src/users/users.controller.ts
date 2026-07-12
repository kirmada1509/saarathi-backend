import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { getStore, coerceUserRow } from '../saarathi/data';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const createUserSchema = z.object({
  home_airport: z.string().toUpperCase().trim(),
  price_sensitivity: z.enum(['low', 'medium', 'high', 'none']),
  direct_preference: z.enum(['strong', 'moderate', 'none']),
  preferred_cabin: z.string().trim().default('Economy'),
  preferred_airlines: z.string().trim().optional().default(''),
  raw_history: z.string().trim().min(1, 'History description cannot be empty'),
});

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

  @Post()
  async createUser(@Body() rawBody: unknown) {
    const parseResult = createUserSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      throw new BadRequestException({
        error: `Validation failed: ${errorMsg}`,
      });
    }

    const body = parseResult.data;
    const store = getStore();
    const targetAirport = body.home_airport;

    if (!store.airports.has(targetAirport)) {
      const examples = Array.from(store.airports.keys()).slice(0, 5).join(', ');
      throw new BadRequestException({
        error: `we don't have flight data for that airport — try ${examples}, ...`,
      });
    }

    const airportInfo = store.airports.get(targetAirport)!;

    // Find the next incremental U-number ID by checking both in-memory store and DB
    let maxIdNum = 50;
    for (const key of store.users.keys()) {
      if (key.startsWith('U')) {
        const num = parseInt(key.substring(1), 10);
        if (!isNaN(num) && num > maxIdNum) {
          maxIdNum = num;
        }
      }
    }

    let userId = '';
    let isUnique = false;
    let increment = 1;
    while (!isUnique) {
      const candidateId = `U${String(maxIdNum + increment).padStart(2, '0')}`;
      const existsInDb = await this.prisma.user.findUnique({
        where: { user_id: candidateId },
      });
      if (!existsInDb && !store.users.has(candidateId)) {
        userId = candidateId;
        isUnique = true;
      } else {
        increment++;
      }
    }

    // Persist to Database via Prisma
    const createdUserDb = await this.prisma.user.create({
      data: {
        user_id: userId,
        age: 30,
        home_airport: targetAirport,
        home_city: airportInfo.city,
        frequent_flyer: 'None',
        preferred_airlines: body.preferred_airlines,
        preferred_cabin: body.preferred_cabin,
        price_sensitivity: body.price_sensitivity,
        direct_preference: body.direct_preference,
        max_layover_minutes: 240,
        date_flexibility_days: 0,
        multi_city_tendency: 'medium',
        trip_purpose: 'Leisure',
        preferred_departure: 'Morning',
        baggage_preference: 'Carry-on only',
        seasonal_pattern: 'None',
        raw_history: body.raw_history,
      },
    });

    // Update in-memory cache directly
    const newUserCoerced = coerceUserRow(createdUserDb);
    store.users.set(userId, newUserCoerced);

    return createdUserDb;
  }
}

