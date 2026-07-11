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
function asString(v) {
    if (v === null || v === undefined)
        return '';
    if (typeof v === 'string')
        return v;
    if (typeof v === 'number' || typeof v === 'boolean')
        return String(v);
    return '';
}
function resolveDataPath(filename) {
    const paths = [
        path_1.default.join(process.cwd(), '../data', filename),
        path_1.default.join(process.cwd(), 'data', filename),
        path_1.default.join(__dirname, '../../data', filename),
        path_1.default.join(__dirname, '../data', filename),
        path_1.default.join(__dirname, '../../../data', filename),
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
        baggage_included: raw.baggage_included === 'True' ||
            raw.baggage_included === 'true' ||
            raw.baggage_included === true,
        refundable: raw.refundable === 'True' ||
            raw.refundable === 'true' ||
            raw.refundable === true,
        demand_level: (raw.demand_level ?? 'medium'),
        season: asString(raw.season).trim(),
        is_holiday_season: raw.is_holiday_season === 'True' ||
            raw.is_holiday_season === 'true' ||
            raw.is_holiday_season === true,
    };
}
function coerceUserRow(raw) {
    return {
        user_id: asString(raw.user_id).trim(),
        age: Number(raw.age) || 0,
        home_airport: asString(raw.home_airport).trim(),
        home_city: asString(raw.home_city).trim(),
        frequent_flyer: asString(raw.frequent_flyer).trim(),
        preferred_airlines: asString(raw.preferred_airlines).trim(),
        preferred_cabin: asString(raw.preferred_cabin).trim(),
        price_sensitivity: (raw.price_sensitivity ?? 'none'),
        direct_preference: (raw.direct_preference ?? 'none'),
        max_layover_minutes: Number(raw.max_layover_minutes) || 240,
        date_flexibility_days: Number(raw.date_flexibility_days) || 0,
        multi_city_tendency: (raw.multi_city_tendency ?? 'low'),
        trip_purpose: asString(raw.trip_purpose).trim(),
        preferred_departure: asString(raw.preferred_departure).trim(),
        baggage_preference: asString(raw.baggage_preference).trim(),
        seasonal_pattern: asString(raw.seasonal_pattern).trim(),
        raw_history: asString(raw.raw_history).trim(),
    };
}
function buildStore() {
    const userPath = resolveDataPath('user_data.csv');
    const flightPath = resolveDataPath('flights_data.csv');
    const startMs = Date.now();
    console.log(`[Saarathi Store] Initializing in-memory data store from CSV...`);
    const userCsv = fs_1.default.readFileSync(userPath, 'utf-8');
    const userParseResult = papaparse_1.default.parse(userCsv, {
        header: true,
        skipEmptyLines: true,
    });
    const usersMap = new Map();
    for (const row of userParseResult.data) {
        const coerced = coerceUserRow(row);
        if (coerced.user_id) {
            usersMap.set(coerced.user_id, coerced);
        }
    }
    const flightCsv = fs_1.default.readFileSync(flightPath, 'utf-8');
    const flightParseResult = papaparse_1.default.parse(flightCsv, {
        header: true,
        skipEmptyLines: true,
    });
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
    if (process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test') {
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
        const coerced = coerceUserRow(u);
        usersMap.set(coerced.user_id, coerced);
    }
    const flights = await prisma.flight.findMany();
    const flightsByOriginMap = new Map();
    const flightsByRouteMap = new Map();
    const airportsMap = new Map();
    for (const f of flights) {
        const coerced = coerceFlightRow(f);
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