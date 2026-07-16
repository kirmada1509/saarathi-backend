import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { PrismaService } from '../prisma.service';
import { SaarathiModule } from '../saarathi/saarathi.module';

@Module({
  imports: [SaarathiModule],
  controllers: [UsersController],
  providers: [PrismaService],
})
export class UsersModule {}
