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

  async parseRouteFromRequest(userId: string, requestText: string) {
    const store = getStore();
    const user = store.users.get(userId);
    if (!user) {
      throw new NotFoundException({
        error: `User with ID ${userId} not found.`,
      });
    }

    const route = this.inferRouteFromText(requestText, user.home_airport, store);
    let resolvedStayDurations: Record<string, number> = {};
    if (route.cities && route.cities.length > 0) {
      resolvedStayDurations = this.parseStayDurationsFromText(requestText, store);
      // Pre-fill missing stays with 2 nights
      route.cities.forEach((city) => {
        if (resolvedStayDurations[city] == null) {
          resolvedStayDurations[city] = 2;
        }
      });
    }

    return {
      mode: route.cities ? 'multi' : 'single',
      destination: route.destination,
      cities: route.cities,
      stayDurations: resolvedStayDurations,
    };
  }

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

    let resolvedStayDurations = data.stayDurations;
    if (!resolvedStayDurations && resolvedCities && resolvedCities.length > 0) {
      resolvedStayDurations = this.parseStayDurationsFromText(
        requestText,
        store,
      );
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

  /**
   * Parses stay durations (in nights/days) from trip description text.
   */
  private parseStayDurationsFromText(
    requestText: string,
    store: DataStore,
  ): Record<string, number> {
    const stayDurations: Record<string, number> = {};
    const textLower = requestText.toLowerCase();

    for (const [code, info] of store.airports.entries()) {
      const cityLower = info.city.toLowerCase();

      // "X nights/days in [city]"
      const regex1 = new RegExp(
        `(\\d+)\\s*(?:nights?|days?)\\s+(?:in\\s+)?${cityLower}\\b`,
        'i',
      );
      const match1 = textLower.match(regex1);
      if (match1) {
        stayDurations[code] = parseInt(match1[1], 10);
        continue;
      }

      // "stay in [city] for X nights/days"
      const regex2 = new RegExp(
        `stay\\s+(?:in\\s+)?${cityLower}\\s+(?:for\\s+)?(\\d+)\\s*(?:nights?|days?)`,
        'i',
      );
      const match2 = textLower.match(regex2);
      if (match2) {
        stayDurations[code] = parseInt(match2[1], 10);
        continue;
      }

      // "[city] for X nights/days"
      const regex3 = new RegExp(
        `\\b${cityLower}\\s+(?:for\\s+)?(\\d+)\\s*(?:nights?|days?)`,
        'i',
      );
      const match3 = textLower.match(regex3);
      if (match3) {
        stayDurations[code] = parseInt(match3[1], 10);
        continue;
      }
    }

    return stayDurations;
  }
}
