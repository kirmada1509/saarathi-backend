import { Injectable } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import type { PrismaClient } from '@prisma/client';
import { UserRow, FlightRow } from './types';

export interface DataStore {
  users: Map<string, UserRow>;
  flightsByOrigin: Map<string, FlightRow[]>;
  flightsByRoute: Map<string, FlightRow[]>; // key: `${origin}-${destination}`
  airports: Map<string, { code: string; city: string }>;
}

declare global {
  var __saarathi_store__: DataStore | undefined;
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function resolveDataPath(filename: string): string {
  const paths = [
    path.join(process.cwd(), 'data', filename),
    path.join(__dirname, '../data', filename),
    path.join(__dirname, '../../data', filename),
    path.join(process.cwd(), '../data', filename),
    path.join(__dirname, '../../../data', filename),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error(`Data file ${filename} not found in search paths.`);
}

@Injectable()
export class SaarathiDataService {
  private storeSingleton: DataStore | null = null;

  coerceFlightRow(raw: Record<string, unknown>): FlightRow {
    return {
      flight_id: asString(raw.flight_id).trim(),
      airline_code: asString(raw.airline_code).trim(),
      airline_name: asString(raw.airline_name).trim(),
      alliance: asString(raw.alliance).trim(),
      flight_numbers: asString(raw.flight_numbers).trim(),
      origin: asString(raw.origin).trim(),
      origin_city: asString(raw.origin_city).trim(),
      destination: asString(raw.destination).trim(),
      destination_city: asString(raw.destination_city).trim(),
      departure_utc: asString(raw.departure_utc).trim(),
      arrival_utc: asString(raw.arrival_utc).trim(),
      duration_minutes: Number(raw.duration_minutes) || 0,
      stops: Number(raw.stops) || 0,
      layover_airports: asString(raw.layover_airports).trim(),
      layover_minutes: Number(raw.layover_minutes) || 0,
      cabin_class: asString(raw.cabin_class).trim(),
      price: Number(raw.price) || 0,
      currency: asString(raw.currency).trim(),
      seats_available: Number(raw.seats_available) || 0,
      aircraft_type: asString(raw.aircraft_type).trim(),
      on_time_performance: Number(raw.on_time_performance) || 0,
      baggage_included:
        raw.baggage_included === 'True' ||
        raw.baggage_included === 'true' ||
        raw.baggage_included === true,
      refundable:
        raw.refundable === 'True' ||
        raw.refundable === 'true' ||
        raw.refundable === true,
      demand_level: (raw.demand_level ?? 'medium') as 'low' | 'medium' | 'high',
      season: asString(raw.season).trim(),
      is_holiday_season:
        raw.is_holiday_season === 'True' ||
        raw.is_holiday_season === 'true' ||
        raw.is_holiday_season === true,
    };
  }

  coerceUserRow(raw: Record<string, unknown>): UserRow {
    return {
      user_id: asString(raw.user_id).trim(),
      age: Number(raw.age) || 0,
      home_airport: asString(raw.home_airport).trim(),
      home_city: asString(raw.home_city).trim(),
      frequent_flyer: asString(raw.frequent_flyer).trim(),
      preferred_airlines: asString(raw.preferred_airlines).trim(),
      preferred_cabin: asString(raw.preferred_cabin).trim(),
      price_sensitivity: (raw.price_sensitivity ?? 'none') as
        'low' | 'medium' | 'high' | 'none',
      direct_preference: (raw.direct_preference ?? 'none') as
        'strong' | 'moderate' | 'none',
      max_layover_minutes: Number(raw.max_layover_minutes) || 240,
      date_flexibility_days: Number(raw.date_flexibility_days) || 0,
      multi_city_tendency: (raw.multi_city_tendency ?? 'low') as
        'low' | 'medium' | 'high',
      trip_purpose: asString(raw.trip_purpose).trim(),
      preferred_departure: asString(raw.preferred_departure).trim(),
      baggage_preference: asString(raw.baggage_preference).trim(),
      seasonal_pattern: asString(raw.seasonal_pattern).trim(),
      raw_history: asString(raw.raw_history).trim(),
    };
  }

  buildStore(): DataStore {
    const userPath = resolveDataPath('user_data.csv');
    const flightPath = resolveDataPath('flights_data.csv');

    const startMs = Date.now();
    console.log(
      `[Saarathi Store] Initializing in-memory data store from CSV...`,
    );

    // Parse Users
    const userCsv = fs.readFileSync(userPath, 'utf-8');
    const userParseResult = Papa.parse<Record<string, unknown>>(userCsv, {
      header: true,
      skipEmptyLines: true,
    });
    const usersMap = new Map<string, UserRow>();
    for (const row of userParseResult.data) {
      const coerced = this.coerceUserRow(row);
      if (coerced.user_id) {
        usersMap.set(coerced.user_id, coerced);
      }
    }

    // Parse Flights
    const flightCsv = fs.readFileSync(flightPath, 'utf-8');
    const flightParseResult = Papa.parse<Record<string, unknown>>(flightCsv, {
      header: true,
      skipEmptyLines: true,
    });
    const flightsByOriginMap = new Map<string, FlightRow[]>();
    const flightsByRouteMap = new Map<string, FlightRow[]>();
    const airportsMap = new Map<string, { code: string; city: string }>();

    for (const row of flightParseResult.data) {
      const coerced = this.coerceFlightRow(row);
      if (!coerced.flight_id) continue;

      // Index by origin
      if (!flightsByOriginMap.has(coerced.origin)) {
        flightsByOriginMap.set(coerced.origin, []);
      }
      flightsByOriginMap.get(coerced.origin)!.push(coerced);

      // Index by route
      const routeKey = `${coerced.origin}-${coerced.destination}`;
      if (!flightsByRouteMap.has(routeKey)) {
        flightsByRouteMap.set(routeKey, []);
      }
      flightsByRouteMap.get(routeKey)!.push(coerced);

      // Collect airports
      if (!airportsMap.has(coerced.origin)) {
        airportsMap.set(coerced.origin, {
          code: coerced.origin,
          city: coerced.origin_city,
        });
      }
      if (!airportsMap.has(coerced.destination)) {
        airportsMap.set(coerced.destination, {
          code: coerced.destination,
          city: coerced.destination_city,
        });
      }
    }

    const durationMs = Date.now() - startMs;
    console.log(
      `[Saarathi Store] Parsed ${usersMap.size} users, ${flightParseResult.data.length} flights, indexed ${flightsByRouteMap.size} routes in ${durationMs}ms.`,
    );

    return {
      users: usersMap,
      flightsByOrigin: flightsByOriginMap,
      flightsByRoute: flightsByRouteMap,
      airports: airportsMap,
    };
  }

  getStore(): DataStore {
    // In development and test environments, cache on globalThis
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test'
    ) {
      if (!globalThis.__saarathi_store__) {
        globalThis.__saarathi_store__ = this.buildStore();
      }
      return globalThis.__saarathi_store__;
    }

    if (!this.storeSingleton) {
      if (globalThis.__saarathi_store__) {
        this.storeSingleton = globalThis.__saarathi_store__;
      } else {
        this.storeSingleton = this.buildStore();
      }
    }
    return this.storeSingleton;
  }

  async initializeStoreFromDb(prisma: PrismaClient) {
    const startMs = Date.now();
    console.log(`[Saarathi Store] Loading in-memory cache from database...`);

    // 1. Load Users
    const users = await prisma.user.findMany();
    const usersMap = new Map<string, UserRow>();
    for (const u of users) {
      const coerced = this.coerceUserRow(u);
      usersMap.set(coerced.user_id, coerced);
    }

    // 2. Load Flights
    const flights = await prisma.flight.findMany();
    const flightsByOriginMap = new Map<string, FlightRow[]>();
    const flightsByRouteMap = new Map<string, FlightRow[]>();
    const airportsMap = new Map<string, { code: string; city: string }>();

    for (const f of flights) {
      const coerced = this.coerceFlightRow(f);

      // Index by origin
      if (!flightsByOriginMap.has(coerced.origin)) {
        flightsByOriginMap.set(coerced.origin, []);
      }
      flightsByOriginMap.get(coerced.origin)!.push(coerced);

      // Index by route
      const routeKey = `${coerced.origin}-${coerced.destination}`;
      if (!flightsByRouteMap.has(routeKey)) {
        flightsByRouteMap.set(routeKey, []);
      }
      flightsByRouteMap.get(routeKey)!.push(coerced);

      // Collect airports
      if (!airportsMap.has(coerced.origin)) {
        airportsMap.set(coerced.origin, {
          code: coerced.origin,
          city: coerced.origin_city,
        });
      }
      if (!airportsMap.has(coerced.destination)) {
        airportsMap.set(coerced.destination, {
          code: coerced.destination,
          city: coerced.destination_city,
        });
      }
    }

    const durationMs = Date.now() - startMs;
    console.log(
      `[Saarathi Store] Cache loaded: ${usersMap.size} users, ${flights.length} flights in ${durationMs}ms.`,
    );

    const store = {
      users: usersMap,
      flightsByOrigin: flightsByOriginMap,
      flightsByRoute: flightsByRouteMap,
      airports: airportsMap,
    };

    globalThis.__saarathi_store__ = store;
    this.storeSingleton = store;
  }
}
