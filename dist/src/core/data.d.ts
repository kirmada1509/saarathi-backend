import type { PrismaClient } from '@prisma/client';
import { UserRow, FlightRow } from './types';
export interface DataStore {
    users: Map<string, UserRow>;
    flightsByOrigin: Map<string, FlightRow[]>;
    flightsByRoute: Map<string, FlightRow[]>;
    airports: Map<string, {
        code: string;
        city: string;
    }>;
}
export declare function coerceFlightRow(raw: Record<string, unknown>): FlightRow;
export declare function coerceUserRow(raw: Record<string, unknown>): UserRow;
export declare function buildStore(): DataStore;
declare global {
    var __saarathi_store__: DataStore | undefined;
}
export declare function getStore(): DataStore;
export declare function initializeStoreFromDb(prisma: PrismaClient): Promise<void>;
