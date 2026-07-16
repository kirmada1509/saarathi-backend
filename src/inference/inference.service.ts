import { Injectable } from '@nestjs/common';
import { DataStore } from '../saarathi/data.service';
import { UserRow, InferredPreference } from '../saarathi/types';
import { PreferenceInferenceService } from './preference-inference.service';
import {
  RouteStayInferenceService,
  ParsedRouteFromRequest,
} from './route-stay-inference.service';

export type { ParsedRouteFromRequest };

@Injectable()
export class InferenceService {
  constructor(
    private readonly preferenceInferenceService: PreferenceInferenceService,
    private readonly routeStayInferenceService: RouteStayInferenceService,
  ) {}

  /**
   * Infers traveler preferences using the LLM with a fallback to rule/embedding-based inference.
   */
  async inferPreferences(
    user: UserRow,
    requestText: string,
    warnings?: string[],
  ): Promise<InferredPreference> {
    return this.preferenceInferenceService.inferPreferences(
      user,
      requestText,
      warnings,
    );
  }

  /**
   * Parsed route from request utilizing the LLM with regex/heuristic-based fallbacks.
   */
  async parseRouteFromRequest(
    userId: string,
    requestText: string,
    warnings?: string[],
  ): Promise<ParsedRouteFromRequest> {
    return this.routeStayInferenceService.parseRouteFromRequest(
      userId,
      requestText,
      warnings,
    );
  }

  /**
   * Resolves origin, destination, cities and stay durations.
   * Runs the fallback heuristic-based inference when values are not explicitly provided.
   */
  resolveRouteAndStays(
    requestText: string,
    homeAirport: string,
    store: DataStore,
    provided: {
      origin?: string;
      destination?: string;
      cities?: string[];
      stayDurations?: Record<string, number>;
    },
  ): {
    origin?: string;
    destination?: string;
    cities?: string[];
    stayDurations?: Record<string, number>;
  } {
    return this.routeStayInferenceService.resolveRouteAndStays(
      requestText,
      homeAirport,
      store,
      provided,
    );
  }

  /**
   * Infers origin/destination or multi-city route from text prompts (fallback logic).
   */
  inferRouteFromText(
    requestText: string,
    homeAirport: string,
    store: DataStore,
  ): { destination?: string; cities?: string[] } {
    return this.routeStayInferenceService.inferRouteFromText(
      requestText,
      homeAirport,
      store,
    );
  }

  /**
   * Infers stay durations for cities from text prompts (fallback logic).
   */
  parseStayDurationsFromText(
    requestText: string,
    store: DataStore,
  ): Record<string, number> {
    return this.routeStayInferenceService.parseStayDurationsFromText(
      requestText,
      store,
    );
  }
}
