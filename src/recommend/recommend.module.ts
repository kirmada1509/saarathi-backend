import { Module } from '@nestjs/common';
import { RecommendController } from './recommend.controller';
import { RecommendService } from './services/recommend.service';
import { RecommendSingleLegService } from './services/recommend-single-leg.service';
import { RecommendMultiCityService } from './services/recommend-multi-city.service';
import { InferenceModule } from '../inference/inference.module';
import { SaarathiModule } from '../saarathi/saarathi.module';

@Module({
  imports: [InferenceModule, SaarathiModule],
  controllers: [RecommendController],
  providers: [
    RecommendService,
    RecommendSingleLegService,
    RecommendMultiCityService,
  ],
})
export class RecommendModule {}
