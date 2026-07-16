import {
  Controller,
  Get,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SaarathiDataService } from '../saarathi/data.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Controller('users')
export class UsersController {
  constructor(
    private prisma: PrismaService,
    private readonly dataService: SaarathiDataService,
  ) {}

  @Get()
  async getUsers(): Promise<UserResponseDto[]> {
    return this.prisma.user
      .findMany({
        select: {
          id: true,
          user_id: true,
          age: true,
          home_airport: true,
          home_city: true,
          frequent_flyer: true,
          preferred_airlines: true,
          preferred_cabin: true,
          price_sensitivity: true,
          direct_preference: true,
          max_layover_minutes: true,
          date_flexibility_days: true,
          multi_city_tendency: true,
          trip_purpose: true,
          preferred_departure: true,
          baggage_preference: true,
          seasonal_pattern: true,
          raw_history: true,
        },
      })
      .then((users) => users.map((user) => UserResponseDto.fromEntity(user)));
  }

  @Post()
  async createUser(@Body() body: CreateUserDto): Promise<UserResponseDto> {
    const store = this.dataService.getStore();
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
        age: body.age,
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
    const newUserCoerced = this.dataService.coerceUserRow(createdUserDb);
    store.users.set(userId, newUserCoerced);

    return UserResponseDto.fromEntity(createdUserDb);
  }
}
