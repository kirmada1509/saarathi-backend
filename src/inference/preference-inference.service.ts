import { Injectable } from '@nestjs/common';
import { CortexService } from '../cortex/cortex.service';
import { UserRow, InferredPreference } from '../saarathi/types';
import { inferPreferences } from '../saarathi/preferences';

@Injectable()
export class PreferenceInferenceService {
  constructor(private readonly cortexService: CortexService) {}

  /**
   * Infers traveler preferences using the LLM with a fallback to rule/embedding-based inference.
   */
  async inferPreferences(
    user: UserRow,
    requestText: string,
    warnings?: string[],
  ): Promise<InferredPreference> {
    try {
      const llmPref = await this.cortexService.inferPreferences(
        user,
        requestText,
        warnings,
      );
      if (!llmPref) {
        throw new Error('LLM preference inference returned null');
      }
      return llmPref;
    } catch (err) {
      console.warn(
        '[PreferenceInferenceService] LLM preference inference failed, falling back:',
        err,
      );
      return await inferPreferences(user, requestText);
    }
  }
}
