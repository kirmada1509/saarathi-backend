import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsNumberRecord(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNumberRecord',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value == null) {
            return true;
          }

          if (typeof value !== 'object' || Array.isArray(value)) {
            return false;
          }

          return Object.values(value as Record<string, unknown>).every(
            (entry) => typeof entry === 'number' && Number.isFinite(entry),
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a record of numbers`;
        },
      },
    });
  };
}
