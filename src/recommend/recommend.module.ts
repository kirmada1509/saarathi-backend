import { Module } from '@nestjs/common';
import { RecommendController } from './recommend.controller';
import { RecommendService } from './recommend.service';
import { RecommendSingleLegService } from './recommend-single-leg.service';
import { RecommendMultiCityService } from './recommend-multi-city.service';

@Module({
  controllers: [RecommendController],
  providers: [
    RecommendService,
    RecommendSingleLegService,
    RecommendMultiCityService,
  ],
})
export class RecommendModule {}
