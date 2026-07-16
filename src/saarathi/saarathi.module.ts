import { Module } from '@nestjs/common';
import { SaarathiDataService } from './data.service';
import { ConfidenceService } from './confidence.service';
import { CounterfactualsService } from './counterfactuals.service';
import { RankingService } from './ranking.service';
import { SaarathiPreferencesService } from './preferences.service';
import { MultiCityService } from './multicity.service';

@Module({
  providers: [
    SaarathiDataService,
    ConfidenceService,
    CounterfactualsService,
    RankingService,
    SaarathiPreferencesService,
    MultiCityService,
  ],
  exports: [
    SaarathiDataService,
    ConfidenceService,
    CounterfactualsService,
    RankingService,
    SaarathiPreferencesService,
    MultiCityService,
  ],
})
export class SaarathiModule {}
