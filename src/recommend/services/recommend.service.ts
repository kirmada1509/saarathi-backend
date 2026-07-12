import { Injectable, NotFoundException } from '@nestjs/common';
import { getStore, DataStore } from '../../core/data';
import { inferPreferences } from '../../core/preferences';
import { applyPerturbations } from '../../core/counterfactuals';
import { RecommendSingleLegService } from './recommend-single-leg.service';
import { RecommendMultiCityService } from './recommend-multi-city.service';
import { RecommendResponse, Perturbation } from '../../core/types';

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

    // 2. Infer Preferences (rules + embeddings + requestText)
    const basePref = await inferPreferences(user, requestText);

    // 3. Apply active perturbations to preferences
    const perturbedPref = applyPerturbations(basePref, perturbations);

    // 4. Resolve Route (smart inference if not explicitly provided)
    let resolvedDestination = data.destination;
    let resolvedCities = data.cities;

    if (
      !resolvedDestination &&
      (!resolvedCities || resolvedCities.length === 0)
    ) {
      const inferred = this.inferRouteFromText(
        requestText,
        user.home_airport,
        store,
      );
      resolvedDestination = inferred.destination;
      resolvedCities = inferred.cities;
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
          data.origin,
          resolvedDestination,
        );
      return recommendation;
    }
  }

  /**
   * Helper to parse cities and destination dynamically from requestText.
   */
  private inferRouteFromText(
    requestText: string,
    homeAirport: string,
    store: DataStore,
  ): { destination?: string; cities?: string[] } {
    const text = requestText.toLowerCase();

    interface FoundEntity {
      code: string;
      index: number;
    }
    const found: FoundEntity[] = [];

    // 1. Scan for IATA codes (excluding home airport)
    const matches = requestText.match(/\b([A-Z]{3})\b/g);
    if (matches) {
      for (const match of matches) {
        if (store.airports.has(match) && match !== homeAirport) {
          const index = requestText.indexOf(match);
          if (!found.some((f) => f.code === match)) {
            found.push({ code: match, index });
          }
        }
      }
    }

    // 2. Scan for city names (excluding home airport)
    for (const [code, info] of store.airports.entries()) {
      if (code === homeAirport) continue;
      const cityLower = info.city.toLowerCase();
      if (text.includes(cityLower)) {
        const index = text.indexOf(cityLower);
        if (!found.some((f) => f.code === code)) {
          found.push({ code, index });
        }
      }
    }

    // Sort by appearance in text
    found.sort((a, b) => a.index - b.index);

    const codes = found.map((f) => f.code);

    if (codes.length >= 2) {
      return { cities: codes };
    } else if (codes.length === 1) {
      return { destination: codes[0] };
    }

    return {};
  }
}
