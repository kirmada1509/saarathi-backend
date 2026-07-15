import { IsString } from 'class-validator';

export class ParseRouteRequestDto {
  @IsString()
  userId!: string;

  @IsString()
  requestText!: string;
}
