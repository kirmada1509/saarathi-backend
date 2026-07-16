import { ParsedRouteFromRequest } from '../../inference/inference.service';

export class ParseRouteResponseDto implements ParsedRouteFromRequest {
  mode!: ParsedRouteFromRequest['mode'];
  destination?: string;
  origin?: string;
  cities?: string[];
  stayDurations!: Record<string, number>;
  placeNames!: Record<string, string>;
  returnCity?: string;
  fixed_itinerary?: boolean;
  warnings?: string[];

  static from(
    result: ParsedRouteFromRequest,
    warnings?: string[],
  ): ParseRouteResponseDto {
    return Object.assign(new ParseRouteResponseDto(), result, {
      warnings: warnings && warnings.length > 0 ? warnings : undefined,
    });
  }
}
