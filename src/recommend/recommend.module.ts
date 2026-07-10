import { Module } from '@nestjs/common';
import { RecommendController } from './recommend.controller';

@Module({
  controllers: [RecommendController],
})
export class RecommendModule {}
