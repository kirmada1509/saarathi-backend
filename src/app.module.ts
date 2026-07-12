import { Module, OnModuleInit, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UsersModule } from './users/users.module';
import { RecommendModule } from './recommend/recommend.module';
import { initializeStoreFromDb } from './saarathi/data';
import { LoggerMiddleware } from './logger.middleware';

@Module({
  imports: [UsersModule, RecommendModule],
  providers: [PrismaService],
})
export class AppModule implements OnModuleInit, NestModule {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Warm up the in-memory cache from the SQLite database on app boot
    await initializeStoreFromDb(this.prisma);
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
