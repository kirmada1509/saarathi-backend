import { RecommendResponse } from '../../saarathi/types';

export class RecommendResponseDto {
  mode!: RecommendResponse['mode'];
  verdict!: RecommendResponse['verdict'];
  ranked!: RecommendResponse['ranked'];
  preference!: RecommendResponse['preference'];
  alternatives!: RecommendResponse['alternatives'];
  counterfactuals!: RecommendResponse['counterfactuals'];
  confidence!: RecommendResponse['confidence'];
  trace!: RecommendResponse['trace'];
  explanation!: string;
  itinerary?: RecommendResponse['itinerary'];
  appliedPerturbations!: RecommendResponse['appliedPerturbations'];
  warnings?: string[];

  static from(result: RecommendResponse): RecommendResponseDto {
    return Object.assign(new RecommendResponseDto(), result);
  }
}
