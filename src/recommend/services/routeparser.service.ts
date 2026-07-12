import { Injectable, NotFoundException } from '@nestjs/common';
import { getStore, DataStore } from '../../saarathi/data';
import { CortexService } from '../../cortex/cortex.service';

export interface ParsedRouteFromRequest {
  mode: 'single' | 'multi';
  destination?: string;
  origin?: string;
  cities?: string[];
  stayDurations: Record<string, number>;
  placeNames: Record<string, string>;
  /** The airport code of the return-home leg, if this is a round-trip. Excluded from intermediate stays. */
  returnCity?: string;
}

@Injectable()
export class RouteParserService {
  constructor(private readonly cortexService: CortexService) {}
  async parseRouteFromRequest(
    userId: string,
    requestText: string,
  ): Promise<ParsedRouteFromRequest> {
    const store = getStore();
    const user = store.users.get(userId);
    if (!user) {
      throw new NotFoundException({
        error: `User with ID ${userId} not found.`,
      });
    }

    const llmParsed = await this.cortexService.parseRoute(
      requestText,
      user.home_airport,
      store.airports,
    );
    if (llmParsed) {
      const placeNames: Record<string, string> = {};
      if (llmParsed.destination && store.airports.has(llmParsed.destination)) {
        placeNames[llmParsed.destination] = store.airports.get(
          llmParsed.destination,
        )!.city;
      }
      if (llmParsed.origin && store.airports.has(llmParsed.origin)) {
        placeNames[llmParsed.origin] = store.airports.get(
          llmParsed.origin,
        )!.city;
      }
      if (llmParsed.cities) {
        llmParsed.cities.forEach((city) => {
          if (store.airports.has(city)) {
            placeNames[city] = store.airports.get(city)!.city;
          }
        });
      }

      // LLM already includes homeAirport in cities for round-trips.
      if (llmParsed.cities && llmParsed.cities.length > 0) {
        const stayDurations = llmParsed.stayDurations || {};
        const lastCity = llmParsed.cities[llmParsed.cities.length - 1];
        const returnCity = lastCity === user.home_airport ? lastCity : undefined;
        llmParsed.cities.forEach((city) => {
          // Never assign a stay to the home return leg
          if (city === returnCity) {
            stayDurations[city] = 0;
          } else if (stayDurations[city] == null) {
            stayDurations[city] = 2;
          }
        });
        return {
          mode: 'multi',
          destination: undefined,
          origin: undefined,
          cities: llmParsed.cities,
          stayDurations,
          placeNames,
          returnCity,
        };
      }

      return {
        mode: 'single',
        destination: llmParsed.destination || undefined,
        origin: llmParsed.origin || undefined,
        cities: undefined,
        stayDurations: {},
        placeNames,
      };
    }

    const route = this.inferRouteFromText(
      requestText,
      user.home_airport,
      store,
    );
    const placeNames: Record<string, string> = {};
    if (route.destination && store.airports.has(route.destination)) {
      placeNames[route.destination] = store.airports.get(
        route.destination,
      )!.city;
    }
    if (route.cities) {
      route.cities.forEach((city) => {
        if (store.airports.has(city)) {
          placeNames[city] = store.airports.get(city)!.city;
        }
      });
    }

    let resolvedStayDurations: Record<string, number> = {};
    const lastCity = route.cities?.[route.cities.length - 1];
    const returnCity = lastCity === user.home_airport ? lastCity : undefined;
    if (route.cities && route.cities.length > 0) {
      const textDurations = this.parseStayDurationsFromText(requestText, store);
      Object.assign(resolvedStayDurations, textDurations);
      route.cities.forEach((city) => {
        if (city === returnCity) {
          resolvedStayDurations[city] = 0;
        } else if (resolvedStayDurations[city] == null) {
          resolvedStayDurations[city] = 2;
        }
      });
    }

    return {
      mode: route.cities ? 'multi' : 'single',
      destination: route.destination,
      origin: undefined,
      cities: route.cities,
      stayDurations: resolvedStayDurations,
      placeNames,
      returnCity,
    };
  }

  inferRouteFromText(
    requestText: string,
    homeAirport: string,
    store: DataStore,
  ): { destination?: string; cities?: string[] } {
    const text = requestText.toLowerCase();

    // Detect round-trip intent from keywords — expands [dest, home] directly
    const roundTripKeywords = [
      'back home', 'back to home', 'and return', 'return home',
      'go home', 'round trip', 'roundtrip', 'return flight', 'return back',
    ];
    const isRoundTrip = roundTripKeywords.some((kw) => text.includes(kw));

    interface FoundEntity { code: string; index: number; }
    const found: FoundEntity[] = [];

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

    found.sort((a, b) => a.index - b.index);
    const codes = found.map((f) => f.code);

    // Round-trip with one destination → [dest, home] treated as multi-city
    if (isRoundTrip && codes.length === 1) {
      return { cities: [codes[0], homeAirport] };
    }
    if (codes.length >= 2) return { cities: codes };
    if (codes.length === 1) return { destination: codes[0] };
    return {};
  }

  parseStayDurationsFromText(
    requestText: string,
    store: DataStore,
  ): Record<string, number> {
    const stayDurations: Record<string, number> = {};
    const textLower = requestText.toLowerCase();

    for (const [code, info] of store.airports.entries()) {
      const cityLower = info.city.toLowerCase();

      const regex1 = new RegExp(
        `(\\d+)\\s*(?:nights?|days?)\\s+(?:in\\s+)?${cityLower}\\b`,
        'i',
      );
      const match1 = textLower.match(regex1);
      if (match1) {
        stayDurations[code] = parseInt(match1[1], 10);
        continue;
      }

      const regex2 = new RegExp(
        `stay\\s+(?:in\\s+)?${cityLower}\\s+(?:for\\s+)?(\\d+)\\s*(?:nights?|days?)`,
        'i',
      );
      const match2 = textLower.match(regex2);
      if (match2) {
        stayDurations[code] = parseInt(match2[1], 10);
        continue;
      }

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
