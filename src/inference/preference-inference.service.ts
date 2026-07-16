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
    let pref: InferredPreference;
    try {
      const llmPref = await this.cortexService.inferPreferences(
        user,
        requestText,
        warnings,
      );
      if (!llmPref) {
        throw new Error('LLM preference inference returned null');
      }
      pref = llmPref;
    } catch (err) {
      console.warn(
        '[PreferenceInferenceService] LLM preference inference failed, falling back:',
        err,
      );
      pref = await inferPreferences(user, requestText);
    }

    pref.preferredDays = this.extractPreferredDays(requestText);
    return pref;
  }

  private extractPreferredDays(requestText: string): string[] {
    const matches = requestText.match(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    );
    if (!matches) return [];
    return [...new Set(matches.map((d) => d.toLowerCase()))];
  }
}
