import { Module } from '@nestjs/common';
import { CortexService } from './cortex.service';

@Module({
  providers: [CortexService],
  exports: [CortexService],
})
export class CortexModule {}
