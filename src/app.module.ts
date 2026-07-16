import {
  Module,
  OnModuleInit,
  NestModule,
  MiddlewareConsumer,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UsersModule } from './users/users.module';
import { RecommendModule } from './recommend/recommend.module';
import { SaarathiModule } from './saarathi/saarathi.module';
import { SaarathiDataService } from './saarathi/data.service';
import { LoggerMiddleware } from './logger.middleware';

@Module({
  imports: [UsersModule, RecommendModule, SaarathiModule],
  providers: [PrismaService],
})
export class AppModule implements OnModuleInit, NestModule {
  constructor(
    private prisma: PrismaService,
    private dataService: SaarathiDataService,
  ) {}

  async onModuleInit() {
    // Warm up the in-memory cache from the SQLite database on app boot
    await this.dataService.initializeStoreFromDb(this.prisma);
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
