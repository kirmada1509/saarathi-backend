import { Injectable, NotFoundException } from '@nestjs/common';
import { getStore } from '../../core/data';
import { inferPreferences } from '../../core/preferences';
import { applyPerturbations } from '../../core/counterfactuals';
import { RecommendSingleLegService } from './recommend-single-leg.service';
import { RecommendMultiCityService } from './recommend-multi-city.service';
import { RecommendResponse, Perturbation } from '../../core/types';
import { RouteParserService } from './routeparser.service';

@Injectable()
export class RecommendService {
  constructor(
    private readonly singleLegService: RecommendSingleLegService,
    private readonly multiCityService: RecommendMultiCityService,
    private readonly routeParserService: RouteParserService,
  ) {}

  async getRecommendation(data: {
    userId: string;
    requestText: string;
    origin?: string;
    destination?: string;
    cities?: string[];
    stayDurations?: Record<string, number>;
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

    // 2. Infer Preferences (rules + embeddings + requestText)
    const basePref = await inferPreferences(user, requestText);

    // 3. Apply active perturbations to preferences
    const perturbedPref = applyPerturbations(basePref, perturbations);

    // 4. Resolve Route (smart inference if not explicitly provided)
    const resolvedOrigin = data.origin;
    let resolvedDestination = data.destination;
    let resolvedCities = data.cities;
    let resolvedStayDurations = data.stayDurations;

    if (
      !resolvedDestination &&
      (!resolvedCities || resolvedCities.length === 0)
    ) {
      // Resolve route only when it was not provided explicitly.
      const inferred = this.routeParserService.inferRouteFromText(
        requestText,
        user.home_airport,
        store,
      );
      resolvedDestination = inferred.destination;
      resolvedCities = inferred.cities;
    }

    if (!resolvedStayDurations && resolvedCities && resolvedCities.length > 0) {
      resolvedStayDurations =
        this.routeParserService.parseStayDurationsFromText(requestText, store);
    }

    // Check Mode: Multi-City vs Single-Leg
    if (resolvedCities && resolvedCities.length > 0) {
      const recommendation: RecommendResponse =
        await this.multiCityService.getRecommendation(
          userId,
          requestText,
          resolvedCities,
          perturbedPref,
          perturbations,
          resolvedStayDurations,
        );
      return recommendation;
    } else {
      const recommendation: RecommendResponse =
        await this.singleLegService.getRecommendation(
          userId,
          requestText,
          user,
          basePref,
          perturbedPref,
          perturbations,
          resolvedOrigin,
          resolvedDestination,
        );
      return recommendation;
    }
  }
}
