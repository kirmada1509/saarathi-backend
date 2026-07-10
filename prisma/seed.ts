import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { coerceUserRow, coerceFlightRow } from "../src/core/data";

const prisma = new PrismaClient();

function resolveDataPath(filename: string): string {
  const paths = [
    path.join(process.cwd(), "../data", filename),
    path.join(process.cwd(), "data", filename),
    path.join(process.cwd(), "saarathi-backend/data", filename),
    path.join(__dirname, "../../data", filename),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error(`Data file ${filename} not found.`);
}

async function main() {
  console.log("Starting database seed...");

  // 1. Clear database
  await prisma.user.deleteMany();
  await prisma.flight.deleteMany();

  // 2. Seed Users
  const userPath = resolveDataPath("user_data.csv");
  console.log(`Reading users from ${userPath}`);
  const userCsv = fs.readFileSync(userPath, "utf-8");
  const userParseResult = Papa.parse(userCsv, { header: true, skipEmptyLines: true });
  
  const userRows = userParseResult.data.map((row) => coerceUserRow(row));
  console.log(`Parsed ${userRows.length} users. Seeding...`);
  
  for (const user of userRows) {
    if (user.user_id) {
      await prisma.user.create({
        data: {
          user_id: user.user_id,
          age: user.age,
          home_airport: user.home_airport,
          home_city: user.home_city,
          frequent_flyer: user.frequent_flyer,
          preferred_airlines: user.preferred_airlines,
          preferred_cabin: user.preferred_cabin,
          price_sensitivity: user.price_sensitivity,
          direct_preference: user.direct_preference,
          max_layover_minutes: user.max_layover_minutes,
          date_flexibility_days: user.date_flexibility_days,
          multi_city_tendency: user.multi_city_tendency,
          trip_purpose: user.trip_purpose,
          preferred_departure: user.preferred_departure,
          baggage_preference: user.baggage_preference,
          seasonal_pattern: user.seasonal_pattern,
          raw_history: user.raw_history,
        },
      });
    }
  }

  // 3. Seed Flights
  const flightPath = resolveDataPath("flights_data.csv");
  console.log(`Reading flights from ${flightPath}`);
  const flightCsv = fs.readFileSync(flightPath, "utf-8");
  const flightParseResult = Papa.parse(flightCsv, { header: true, skipEmptyLines: true });
  
  const flightRows = flightParseResult.data.map((row) => coerceFlightRow(row));
  console.log(`Parsed ${flightRows.length} flights. Seeding in chunks...`);

  // Chunk array to avoid SQLite parameter limit
  const chunkSize = 2000;
  for (let i = 0; i < flightRows.length; i += chunkSize) {
    const chunk = flightRows.slice(i, i + chunkSize);
    const dataToInsert = chunk.map((f) => ({
      flight_id: f.flight_id,
      airline_code: f.airline_code,
      airline_name: f.airline_name,
      alliance: f.alliance,
      flight_numbers: f.flight_numbers,
      origin: f.origin,
      origin_city: f.origin_city,
      destination: f.destination,
      destination_city: f.destination_city,
      departure_utc: f.departure_utc,
      arrival_utc: f.arrival_utc,
      duration_minutes: f.duration_minutes,
      stops: f.stops,
      layover_airports: f.layover_airports,
      layover_minutes: f.layover_minutes,
      cabin_class: f.cabin_class,
      price: f.price,
      currency: f.currency,
      seats_available: f.seats_available,
      aircraft_type: f.aircraft_type,
      on_time_performance: f.on_time_performance,
      baggage_included: f.baggage_included,
      refundable: f.refundable,
      demand_level: f.demand_level,
      season: f.season,
      is_holiday_season: f.is_holiday_season,
    }));

    await prisma.flight.createMany({
      data: dataToInsert,
    });
    console.log(`Seeded flights ${i} to ${Math.min(i + chunkSize, flightRows.length)}`);
  }

  console.log("Database seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
