import { PrismaService } from '../prisma.service';
export declare class UsersController {
    private prisma;
    constructor(prisma: PrismaService);
    getUsers(): Promise<{
        preferred_airlines: string;
        preferred_cabin: string;
        raw_history: string;
        user_id: string;
        age: number;
        home_airport: string;
        home_city: string;
        price_sensitivity: string;
        direct_preference: string;
    }[]>;
}
