import { Controller, Post, Body } from '@nestjs/common';
import { RecommendService } from './services/recommend.service';
import { RouteParserService } from './services/routeparser.service';
import { ParseRouteRequestDto } from './dto/parse-route-request.dto';
import { ParseRouteResponseDto } from './dto/parse-route-response.dto';
import { RecommendRequestDto } from './dto/recommend-request.dto';
import { RecommendResponseDto } from './dto/recommend-response.dto';

@Controller('api/recommend')
export class RecommendController {
  constructor(
    private readonly recommendService: RecommendService,
    private readonly routeParserService: RouteParserService,
  ) {}

  @Post('parse-route')
  async parseRoute(
    @Body() body: ParseRouteRequestDto,
  ): Promise<ParseRouteResponseDto> {
    const warnings: string[] = [];
    const result = await this.routeParserService.parseRouteFromRequest(
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
