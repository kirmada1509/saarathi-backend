import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
export declare class AppModule implements OnModuleInit {
    private prisma;
    constructor(prisma: PrismaService);
    onModuleInit(): Promise<void>;
}
