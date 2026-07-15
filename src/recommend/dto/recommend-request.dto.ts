import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { IsNumberRecord } from '../../common/validators/is-number-record.decorator';
import {
  PerturbationDto,
  PerturbationRequestDto,
  perturbationDiscriminator,
} from './perturbation.dto';

export class RecommendRequestDto {
  @IsString()
  userId!: string;

  @IsString()
  requestText!: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cities?: string[];

  @IsOptional()
  @IsObject()
  @IsNumberRecord()
  stayDurations?: Record<string, number>;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PerturbationDto, {
    discriminator: perturbationDiscriminator,
    keepDiscriminatorProperty: true,
  })
  perturbations?: PerturbationRequestDto[];
}
