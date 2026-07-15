import { TransformFnParams } from 'class-transformer';

export function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function trimUppercaseString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.toUpperCase().trim() : value;
}

export function trimStringOrDefault(defaultValue: string) {
  return ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : defaultValue;
}
