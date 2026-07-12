import { Module } from '@nestjs/common';
import { RecommendController } from './recommend.controller';
import { RecommendService } from './services/recommend.service';
import { RecommendSingleLegService } from './services/recommend-single-leg.service';
import { RecommendMultiCityService } from './services/recommend-multi-city.service';
import { RouteParserService } from './services/routeparser.service';
import { CortexModule } from '../cortex/cortex.module';

@Module({
  imports: [CortexModule],
  controllers: [RecommendController],
  providers: [
    RecommendService,
    RecommendSingleLegService,
    RecommendMultiCityService,
    RouteParserService,
  ],
})
export class RecommendModule {}
