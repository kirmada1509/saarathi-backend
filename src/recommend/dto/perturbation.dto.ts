import { Equals, IsNumber, IsString } from 'class-validator';

export enum PerturbationKindDto {
  PRICE_DROP = 'price_drop',
  ACCEPT_ONE_STOP = 'accept_one_stop',
  BAGS_MATTER = 'bags_matter',
  EVENING_OK = 'evening_ok',
  IGNORE_LOYALTY = 'ignore_loyalty',
  SHIFT_DATES = 'shift_dates',
}

export abstract class PerturbationDto {
  @IsString()
  kind!: PerturbationKindDto;
}

export class PriceDropPerturbationDto extends PerturbationDto {
  @Equals(PerturbationKindDto.PRICE_DROP)
  kind: PerturbationKindDto.PRICE_DROP = PerturbationKindDto.PRICE_DROP;

  @IsString()
  flightId!: string;

  @IsNumber()
  toPrice!: number;
}

export class AcceptOneStopPerturbationDto extends PerturbationDto {
  @Equals(PerturbationKindDto.ACCEPT_ONE_STOP)
  kind: PerturbationKindDto.ACCEPT_ONE_STOP =
    PerturbationKindDto.ACCEPT_ONE_STOP;
}

export class BagsMatterPerturbationDto extends PerturbationDto {
  @Equals(PerturbationKindDto.BAGS_MATTER)
  kind: PerturbationKindDto.BAGS_MATTER = PerturbationKindDto.BAGS_MATTER;
}

export class EveningOkPerturbationDto extends PerturbationDto {
  @Equals(PerturbationKindDto.EVENING_OK)
  kind: PerturbationKindDto.EVENING_OK = PerturbationKindDto.EVENING_OK;
}

export class IgnoreLoyaltyPerturbationDto extends PerturbationDto {
  @Equals(PerturbationKindDto.IGNORE_LOYALTY)
  kind: PerturbationKindDto.IGNORE_LOYALTY = PerturbationKindDto.IGNORE_LOYALTY;
}

export class ShiftDatesPerturbationDto extends PerturbationDto {
  @Equals(PerturbationKindDto.SHIFT_DATES)
  kind: PerturbationKindDto.SHIFT_DATES = PerturbationKindDto.SHIFT_DATES;

  @IsNumber()
  days!: number;
}

export type PerturbationRequestDto =
  | PriceDropPerturbationDto
  | AcceptOneStopPerturbationDto
  | BagsMatterPerturbationDto
  | EveningOkPerturbationDto
  | IgnoreLoyaltyPerturbationDto
  | ShiftDatesPerturbationDto;

export const perturbationDiscriminator = {
  property: 'kind',
  subTypes: [
    { name: PerturbationKindDto.PRICE_DROP, value: PriceDropPerturbationDto },
    {
      name: PerturbationKindDto.ACCEPT_ONE_STOP,
      value: AcceptOneStopPerturbationDto,
    },
    { name: PerturbationKindDto.BAGS_MATTER, value: BagsMatterPerturbationDto },
    { name: PerturbationKindDto.EVENING_OK, value: EveningOkPerturbationDto },
    {
      name: PerturbationKindDto.IGNORE_LOYALTY,
      value: IgnoreLoyaltyPerturbationDto,
    },
    { name: PerturbationKindDto.SHIFT_DATES, value: ShiftDatesPerturbationDto },
  ],
};
