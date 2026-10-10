import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { Errors, type FieldIssue } from '../errors/app-error.js';

function flatten(errors: ValidationError[], parent = ''): FieldIssue[] {
  const out: FieldIssue[] = [];
  for (const e of errors) {
    const field = parent ? `${parent}.${e.property}` : e.property;
    if (e.constraints) {
      // The constraint *names* (isEmail, maxLength...) are the machine-readable
      // reasons. The submitted value is never echoed back.
      out.push({ field, reasons: Object.keys(e.constraints) });
    }
    if (e.children?.length) out.push(...flatten(e.children, field));
  }
  return out;
}

/**
 * Validates and cleans every request body, query and path parameter against its
 * DTO class. Unknown properties are rejected (not silently dropped), so a client
 * cannot slip in `role: "admin"` or `reachLevel: "GLOBAL"` and have it ignored
 * today and honoured after a refactor.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validateCustomDecorators: true,
    exceptionFactory: (errors) => Errors.validation(flatten(errors)),
  });
}
