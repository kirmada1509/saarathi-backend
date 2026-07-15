import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import {
  trimString,
  trimStringOrDefault,
  trimUppercaseString,
} from '../../common/dto/transformers';

export const PriceSensitivityOptions = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  NONE: 'none',
} as const;

export type PriceSensitivityDto =
  (typeof PriceSensitivityOptions)[keyof typeof PriceSensitivityOptions];

export const DirectPreferenceOptions = {
  STRONG: 'strong',
  MODERATE: 'moderate',
  NONE: 'none',
} as const;

export type DirectPreferenceDto =
  (typeof DirectPreferenceOptions)[keyof typeof DirectPreferenceOptions];

export class CreateUserDto {
  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(100)
  age!: number;

  @IsString()
  @Transform(trimUppercaseString)
  home_airport!: string;

  @IsEnum(PriceSensitivityOptions)
  price_sensitivity!: PriceSensitivityDto;

  @IsEnum(DirectPreferenceOptions)
  direct_preference!: DirectPreferenceDto;

  @IsString()
  @Transform(trimStringOrDefault('Economy'))
  preferred_cabin = 'Economy';

  @IsString()
  @Transform(trimStringOrDefault(''))
  preferred_airlines = '';

  @IsString()
  @Transform(trimString)
  @IsNotEmpty({ message: 'History description cannot be empty' })
  raw_history!: string;
}
