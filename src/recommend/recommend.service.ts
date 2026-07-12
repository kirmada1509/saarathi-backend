import { Injectable, NotFoundException } from '@nestjs/common';
import { getStore } from '../core/data';
import { inferPreferences } from '../core/preferences';
import { applyPerturbations } from '../core/counterfactuals';
import { RecommendSingleLegService } from './recommend-single-leg.service';
import { RecommendMultiCityService } from './recommend-multi-city.service';
import { RecommendResponse, Perturbation } from '../core/types';

@Injectable()
export class RecommendService {
  constructor(
    private readonly singleLegService: RecommendSingleLegService,
    private readonly multiCityService: RecommendMultiCityService,
  ) {}

  async getRecommendation(data: {
    userId: string;
    requestText: string;
    origin?: string;
    destination?: string;
    cities?: string[];
    perturbations?: Perturbation[];
  }): Promise<RecommendResponse> {
    const { userId, requestText, perturbations = [] } = data;
    const store = getStore();

    // 1. Get User Profile
    const user = store.users.get(userId);
    if (!user) {
      throw new NotFoundException({
        error: `User with ID ${userId} not found.`,
      });
    }

    // 2. Infer Preferences (rules + embeddings)
    const basePref = await inferPreferences(user);

    // 3. Apply active perturbations to preferences
    const perturbedPref = applyPerturbations(basePref, perturbations);

    // Check Mode: Multi-City vs Single-Leg
    if (data.cities && data.cities.length > 0) {
      return this.multiCityService.getRecommendation(
        userId,
        requestText,
        data.cities,
        perturbedPref,
        perturbations,
      );
    } else {
      return this.singleLegService.getRecommendation(
        userId,
        requestText,
        user,
        basePref,
        perturbedPref,
        perturbations,
        data.origin,
        data.destination,
      );
    }
  }
}
