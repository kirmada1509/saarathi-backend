"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.coerceFlightRow = coerceFlightRow;
exports.coerceUserRow = coerceUserRow;
exports.buildStore = buildStore;
exports.getStore = getStore;
exports.initializeStoreFromDb = initializeStoreFromDb;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const papaparse_1 = __importDefault(require("papaparse"));
function resolveDataPath(filename) {
    const paths = [
        path_1.default.join(process.cwd(), "../data", filename),
        path_1.default.join(process.cwd(), "data", filename),
        path_1.default.join(__dirname, "../../data", filename),
        path_1.default.join(__dirname, "../data", filename),
        path_1.default.join(__dirname, "../../../data", filename),
    ];
    for (const p of paths) {
        if (fs_1.default.existsSync(p)) {
            return p;
        }
    }
    throw new Error(`Data file ${filename} not found in search paths.`);
}
function coerceFlightRow(raw) {
    return {
        flight_id: String(raw.flight_id ?? "").trim(),
        airline_code: String(raw.airline_code ?? "").trim(),
        airline_name: String(raw.airline_name ?? "").trim(),
        alliance: String(raw.alliance ?? "").trim(),
        flight_numbers: String(raw.flight_numbers ?? "").trim(),
        origin: String(raw.origin ?? "").trim(),
        origin_city: String(raw.origin_city ?? "").trim(),
        destination: String(raw.destination ?? "").trim(),
        destination_city: String(raw.destination_city ?? "").trim(),
        departure_utc: String(raw.departure_utc ?? "").trim(),
        arrival_utc: String(raw.arrival_utc ?? "").trim(),
        duration_minutes: Number(raw.duration_minutes) || 0,
        stops: Number(raw.stops) || 0,
        layover_airports: String(raw.layover_airports ?? "").trim(),
        layover_minutes: Number(raw.layover_minutes) || 0,
        cabin_class: String(raw.cabin_class ?? "").trim(),
        price: Number(raw.price) || 0,
        currency: String(raw.currency ?? "").trim(),
        seats_available: Number(raw.seats_available) || 0,
        aircraft_type: String(raw.aircraft_type ?? "").trim(),
        on_time_performance: Number(raw.on_time_performance) || 0,
        baggage_included: raw.baggage_included === "True" || raw.baggage_included === "true" || raw.baggage_included === true,
        refundable: raw.refundable === "True" || raw.refundable === "true" || raw.refundable === true,
        demand_level: (raw.demand_level ?? "medium"),
        season: String(raw.season ?? "").trim(),
        is_holiday_season: raw.is_holiday_season === "True" || raw.is_holiday_season === "true" || raw.is_holiday_season === true,
    };
}
function coerceUserRow(raw) {
    return {
        user_id: String(raw.user_id ?? "").trim(),
        age: Number(raw.age) || 0,
        home_airport: String(raw.home_airport ?? "").trim(),
        home_city: String(raw.home_city ?? "").trim(),
        frequent_flyer: String(raw.frequent_flyer ?? "").trim(),
        preferred_airlines: String(raw.preferred_airlines ?? "").trim(),
        preferred_cabin: String(raw.preferred_cabin ?? "").trim(),
        price_sensitivity: (raw.price_sensitivity ?? "none"),
        direct_preference: (raw.direct_preference ?? "none"),
        max_layover_minutes: Number(raw.max_layover_minutes) || 240,
        date_flexibility_days: Number(raw.date_flexibility_days) || 0,
        multi_city_tendency: (raw.multi_city_tendency ?? "low"),
        trip_purpose: String(raw.trip_purpose ?? "").trim(),
        preferred_departure: String(raw.preferred_departure ?? "").trim(),
        baggage_preference: String(raw.baggage_preference ?? "").trim(),
        seasonal_pattern: String(raw.seasonal_pattern ?? "").trim(),
        raw_history: String(raw.raw_history ?? "").trim(),
    };
}
function buildStore() {
    const userPath = resolveDataPath("user_data.csv");
    const flightPath = resolveDataPath("flights_data.csv");
    const startMs = Date.now();
    console.log(`[Saarathi Store] Initializing in-memory data store from CSV...`);
    const userCsv = fs_1.default.readFileSync(userPath, "utf-8");
    const userParseResult = papaparse_1.default.parse(userCsv, { header: true, skipEmptyLines: true });
    const usersMap = new Map();
    for (const row of userParseResult.data) {
        const coerced = coerceUserRow(row);
        if (coerced.user_id) {
            usersMap.set(coerced.user_id, coerced);
        }
    }
    const flightCsv = fs_1.default.readFileSync(flightPath, "utf-8");
    const flightParseResult = papaparse_1.default.parse(flightCsv, { header: true, skipEmptyLines: true });
    const flightsByOriginMap = new Map();
    const flightsByRouteMap = new Map();
    const airportsMap = new Map();
    for (const row of flightParseResult.data) {
        const coerced = coerceFlightRow(row);
        if (!coerced.flight_id)
            continue;
        if (!flightsByOriginMap.has(coerced.origin)) {
            flightsByOriginMap.set(coerced.origin, []);
        }
        flightsByOriginMap.get(coerced.origin).push(coerced);
        const routeKey = `${coerced.origin}-${coerced.destination}`;
        if (!flightsByRouteMap.has(routeKey)) {
            flightsByRouteMap.set(routeKey, []);
        }
        flightsByRouteMap.get(routeKey).push(coerced);
        if (!airportsMap.has(coerced.origin)) {
            airportsMap.set(coerced.origin, { code: coerced.origin, city: coerced.origin_city });
        }
        if (!airportsMap.has(coerced.destination)) {
            airportsMap.set(coerced.destination, { code: coerced.destination, city: coerced.destination_city });
        }
    }
    const durationMs = Date.now() - startMs;
    console.log(`[Saarathi Store] Parsed ${usersMap.size} users, ${flightParseResult.data.length} flights, indexed ${flightsByRouteMap.size} routes in ${durationMs}ms.`);
    return {
        users: usersMap,
        flightsByOrigin: flightsByOriginMap,
        flightsByRoute: flightsByRouteMap,
        airports: airportsMap,
    };
}
let storeSingleton = null;
function getStore() {
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
        if (!globalThis.__saarathi_store__) {
            globalThis.__saarathi_store__ = buildStore();
        }
        return globalThis.__saarathi_store__;
    }
    if (!storeSingleton) {
        if (globalThis.__saarathi_store__) {
            storeSingleton = globalThis.__saarathi_store__;
        }
        else {
            storeSingleton = buildStore();
        }
    }
    return storeSingleton;
}
async function initializeStoreFromDb(prisma) {
    const startMs = Date.now();
    console.log(`[Saarathi Store] Loading in-memory cache from database...`);
    const users = await prisma.user.findMany();
    const usersMap = new Map();
    for (const u of users) {
        usersMap.set(u.user_id, {
            user_id: u.user_id,
            age: u.age,
            home_airport: u.home_airport,
            home_city: u.home_city,
            frequent_flyer: u.frequent_flyer,
            preferred_airlines: u.preferred_airlines,
            preferred_cabin: u.preferred_cabin,
            price_sensitivity: u.price_sensitivity,
            direct_preference: u.direct_preference,
            max_layover_minutes: u.max_layover_minutes,
            date_flexibility_days: u.date_flexibility_days,
            multi_city_tendency: u.multi_city_tendency,
            trip_purpose: u.trip_purpose,
            preferred_departure: u.preferred_departure,
            baggage_preference: u.baggage_preference,
            seasonal_pattern: u.seasonal_pattern,
            raw_history: u.raw_history,
        });
    }
    const flights = await prisma.flight.findMany();
    const flightsByOriginMap = new Map();
    const flightsByRouteMap = new Map();
    const airportsMap = new Map();
    for (const f of flights) {
        const coerced = {
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
        };
        if (!flightsByOriginMap.has(coerced.origin)) {
            flightsByOriginMap.set(coerced.origin, []);
        }
        flightsByOriginMap.get(coerced.origin).push(coerced);
        const routeKey = `${coerced.origin}-${coerced.destination}`;
        if (!flightsByRouteMap.has(routeKey)) {
            flightsByRouteMap.set(routeKey, []);
        }
        flightsByRouteMap.get(routeKey).push(coerced);
        if (!airportsMap.has(coerced.origin)) {
            airportsMap.set(coerced.origin, { code: coerced.origin, city: coerced.origin_city });
        }
        if (!airportsMap.has(coerced.destination)) {
            airportsMap.set(coerced.destination, { code: coerced.destination, city: coerced.destination_city });
        }
    }
    const durationMs = Date.now() - startMs;
    console.log(`[Saarathi Store] Loaded ${usersMap.size} users, ${flights.length} flights, indexed ${flightsByRouteMap.size} routes from DB in ${durationMs}ms.`);
    const storeInstance = {
        users: usersMap,
        flightsByOrigin: flightsByOriginMap,
        flightsByRoute: flightsByRouteMap,
        airports: airportsMap,
    };
    globalThis.__saarathi_store__ = storeInstance;
    storeSingleton = storeInstance;
}
//# sourceMappingURL=data.js.map