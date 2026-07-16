import { Controller, Post, Body } from '@nestjs/common';
import { RecommendService } from './services/recommend.service';
import { InferenceService } from '../inference/inference.service';
import { ParseRouteRequestDto } from './dto/parse-route-request.dto';
import { ParseRouteResponseDto } from './dto/parse-route-response.dto';
import { RecommendRequestDto } from './dto/recommend-request.dto';
import { RecommendResponseDto } from './dto/recommend-response.dto';

@Controller('recommend')
export class RecommendController {
  constructor(
    private readonly recommendService: RecommendService,
    private readonly inferenceService: InferenceService,
  ) {}

  @Post('parse-route')
  async parseRoute(
    @Body() body: ParseRouteRequestDto,
  ): Promise<ParseRouteResponseDto> {
    const warnings: string[] = [];
    const result = await this.inferenceService.parseRouteFromRequest(
      body.userId,
      body.requestText,
      warnings,
    );
    return ParseRouteResponseDto.from(result, warnings);
  }

  @Post()
  async getRecommendation(
    @Body() body: RecommendRequestDto,
  ): Promise<RecommendResponseDto> {
    const result = await this.recommendService.getRecommendation(body);
    return RecommendResponseDto.from(result);
  }
}
