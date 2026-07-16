import { Injectable, NotFoundException } from '@nestjs/common';
import { SaarathiDataService } from '../../saarathi/data.service';
import { CounterfactualsService } from '../../saarathi/counterfactuals.service';
import { RecommendSingleLegService } from './recommend-single-leg.service';
import { RecommendMultiCityService } from './recommend-multi-city.service';
import { InferenceService } from '../../inference/inference.service';
import { RecommendResponse } from '../../saarathi/types';
import { RecommendRequestDto } from '../dto/recommend-request.dto';

@Injectable()
export class RecommendService {
  constructor(
    private readonly singleLegService: RecommendSingleLegService,
    private readonly multiCityService: RecommendMultiCityService,
    private readonly inferenceService: InferenceService,
    private readonly dataService: SaarathiDataService,
    private readonly counterfactualsService: CounterfactualsService,
  ) {}

  async getRecommendation(
    data: RecommendRequestDto,
  ): Promise<RecommendResponse> {
    const { userId, requestText, perturbations = [] } = data;
    const store = this.dataService.getStore();
    const warnings: string[] = [];

    // 1. Get User Profile
    // TODO: get user profile from userService
    const user = store.users.get(userId);
    if (!user) {
      throw new NotFoundException({
        error: `User with ID ${userId} not found.`,
      });
    }

    // 2. Infer Preferences (LLM with regex/embeddings fallback inside InferenceService)
    const basePref = await this.inferenceService.inferPreferences(
      user,
      requestText,
      warnings,
    );

    // 3. Apply active perturbations to preferences
    const perturbedPref = this.counterfactualsService.applyPerturbations(
      basePref,
      perturbations,
    );

    // 4. Resolve Route (smart inference if not explicitly provided)
    const resolved = this.inferenceService.resolveRouteAndStays(
      requestText,
      user.home_airport,
      store,
      {
        origin: data.origin,
        destination: data.destination,
        cities: data.cities,
        stayDurations: data.stayDurations,
      },
    );

    // Check Mode: Multi-City vs Single-Leg
    const resolvedCities = resolved.cities;
    if (resolvedCities && resolvedCities.length > 0) {
      const recommendation: RecommendResponse =
        await this.multiCityService.getRecommendation({
          userId,
          requestText,
          cities: resolvedCities,
          perturbedPref,
          perturbations,
          destination: resolved.destination,
          stayDurations: resolved.stayDurations,
          warnings,
        });

      return {
        ...recommendation,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } else {
      const recommendation: RecommendResponse =
        await this.singleLegService.getRecommendation({
          userId,
          requestText,
          user,
          basePref,
          perturbedPref,
          perturbations,
          explicitOrigin: resolved.origin,
          explicitDestination: resolved.destination!,
          warnings,
        });

      return {
        ...recommendation,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  }
}
