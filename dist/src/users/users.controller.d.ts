import { PrismaService } from '../prisma.service';
export declare class UsersController {
    private prisma;
    constructor(prisma: PrismaService);
    getUsers(): Promise<{
        raw_history: string;
        user_id: string;
        age: number;
        home_airport: string;
        home_city: string;
        preferred_airlines: string;
        preferred_cabin: string;
        price_sensitivity: string;
        direct_preference: string;
    }[]>;
}
