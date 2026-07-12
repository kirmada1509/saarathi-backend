import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UsersModule } from './users/users.module';
import { RecommendModule } from './recommend/recommend.module';
import { initializeStoreFromDb } from './saarathi/data';

@Module({
  imports: [UsersModule, RecommendModule],
  providers: [PrismaService],
})
export class AppModule implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Warm up the in-memory cache from the SQLite database on app boot
    await initializeStoreFromDb(this.prisma);
  }
}
