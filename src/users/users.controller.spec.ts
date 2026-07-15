import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { PrismaService } from '../prisma.service';
import { getStore } from '../saarathi/data';
import { inferPreferences } from '../saarathi/preferences';

describe('UsersController', () => {
  let controller: UsersController;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [PrismaService],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();

    // Warm up the store cache (forces it to load CSV/data if empty)
    const store = getStore();
    if (store.airports.size === 0) {
      const { buildStore } = await import('../saarathi/data.js');
      globalThis.__saarathi_store__ = buildStore();
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should create a user, immediately update in-memory store, and return user without needing rebuild/reinit', async () => {
    const payload = {
      home_airport: 'JFK',
      price_sensitivity: 'low' as const,
      direct_preference: 'strong' as const,
      preferred_cabin: 'Economy',
      preferred_airlines: 'UA;DL',
      raw_history: 'hate connections | cheapest option always',
    };

    const result = await controller.createUser(payload);
    expect(result).toBeDefined();
    expect(result.user_id).toMatch(/^U\d+/);

    // Confirm that the created user is immediately in the store.users Map
    const store = getStore();
    const cachedUser = store.users.get(result.user_id);
    expect(cachedUser).toBeDefined();
    expect(cachedUser?.user_id).toBe(result.user_id);
    expect(cachedUser?.home_airport).toBe('JFK');
    expect(cachedUser?.preferred_cabin).toBe('Economy');

    // Clean up test user from DB and cache
    await prisma.user.delete({
      where: { user_id: result.user_id },
    });
    store.users.delete(result.user_id);
  });

  it('should infer preferences and produce evidence entries matching DIRECT_BOOST and COST_BOOST', async () => {
    const payload = {
      home_airport: 'JFK',
      price_sensitivity: 'low' as const,
      direct_preference: 'strong' as const,
      preferred_cabin: 'Economy',
      preferred_airlines: 'UA;DL',
      raw_history: 'hate connections | cheapest option always',
    };

    const result = await controller.createUser(payload);

    // Fetch the cached user
    const store = getStore();
    const cachedUser = store.users.get(result.user_id);
    expect(cachedUser).toBeDefined();

    // Run inferPreferences on the cached user
    const inferred = await inferPreferences(cachedUser!);
    expect(inferred).toBeDefined();

    // Check evidence entries
    const directEvidence = inferred.evidence.filter(
      (e) => e.dimension === 'direct',
    );
    const costEvidence = inferred.evidence.filter(
      (e) => e.dimension === 'cost',
    );

    expect(directEvidence.length).toBeGreaterThan(0);
    expect(costEvidence.length).toBeGreaterThan(0);

    const directText = directEvidence.map((e) => e.text).join(' ');
    const costText = costEvidence.map((e) => e.text).join(' ');

    expect(directText).toContain('signals direct-flight preference');
    expect(costText).toContain('signals price sensitivity');

    // Clean up test user from DB and cache
    await prisma.user.delete({
      where: { user_id: result.user_id },
    });
    store.users.delete(result.user_id);
  });
});
