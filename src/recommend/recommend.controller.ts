import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { RecommendService } from './services/recommend.service';

const PerturbationSchema = z.union([
  z.object({
    kind: z.literal('price_drop'),
    flightId: z.string(),
    toPrice: z.number(),
  }),
  z.object({ kind: z.literal('accept_one_stop') }),
  z.object({ kind: z.literal('bags_matter') }),
  z.object({ kind: z.literal('evening_ok') }),
  z.object({ kind: z.literal('ignore_loyalty') }),
  z.object({ kind: z.literal('shift_dates'), days: z.number() }),
]);

const RecommendRequestSchema = z.object({
  userId: z.string(),
  requestText: z.string(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  cities: z.array(z.string()).optional(),
  stayDurations: z.record(z.string(), z.number()).optional(),
  perturbations: z.array(PerturbationSchema).optional(),
});

@Controller('api/recommend')
export class RecommendController {
  constructor(private readonly recommendService: RecommendService) {}

  @Post('parse-route')
  async parseRoute(@Body() body: any) {
    const parsed = z.object({
      userId: z.string(),
      requestText: z.string(),
    }).safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }

    return this.recommendService.parseRouteFromRequest(parsed.data.userId, parsed.data.requestText);
  }

  @Post()
  async getRecommendation(@Body() body: any) {
    const parsed = RecommendRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }

    return this.recommendService.getRecommendation(parsed.data);
  }
}
