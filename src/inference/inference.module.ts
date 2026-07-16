import { Module } from '@nestjs/common';
import { InferenceService } from './inference.service';
import { PreferenceInferenceService } from './preference-inference.service';
import { RouteStayInferenceService } from './route-stay-inference.service';
import { CortexModule } from '../cortex/cortex.module';

@Module({
  imports: [CortexModule],
  providers: [
    InferenceService,
    PreferenceInferenceService,
    RouteStayInferenceService,
  ],
  exports: [InferenceService],
})
export class InferenceModule {}
