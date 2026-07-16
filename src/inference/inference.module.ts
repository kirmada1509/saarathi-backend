import { Module } from '@nestjs/common';
import { InferenceService } from './inference.service';
import { PreferenceInferenceService } from './preference-inference.service';
import { RouteStayInferenceService } from './route-stay-inference.service';
import { CortexModule } from '../cortex/cortex.module';
import { SaarathiModule } from '../saarathi/saarathi.module';

@Module({
  imports: [CortexModule, SaarathiModule],
  providers: [
    InferenceService,
    PreferenceInferenceService,
    RouteStayInferenceService,
  ],
  exports: [InferenceService],
})
export class InferenceModule {}
