import { getMetadataStorage } from 'class-validator';

/**
 * What a request must look like, read from the very validators that enforce it.
 *
 * The validation pipe refuses a request that does not match a DTO class, so that class *is* the
 * contract. Reading the contract back out of the validators (instead of describing it a second time
 * by hand in `@ApiProperty` decorators) means the documentation cannot say something the pipe does
 * not enforce, and a new field is documented the moment it is validated.
 */
export interface FieldInfo {
  name: string;
  /** JSON type: string, integer, number, boolean, array, object. */
  type: string;
  required: boolean;
  format?: string;
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  pattern?: string;
  /** Said in words, for the reference. */
  notes: string[];
}

interface Meta {
  type: string;
  name?: string;
  propertyName: string;
  constraints: unknown[];
}

const VALUES = (x: unknown): string[] =>
  Array.isArray(x)
    ? x.map(String)
    : x && typeof x === 'object'
      ? Object.values(x as Record<string, unknown>)
          .filter((v) => typeof v === 'string' || typeof v === 'number')
          .map(String)
      : [];

/** The fields a DTO class validates, with the rules each carries. */
export function fieldsOf(dto: unknown): FieldInfo[] {
  if (
    typeof dto !== 'function' ||
    dto === Object ||
    dto === String ||
    dto === Number ||
    dto === Boolean
  )
    return [];
  const metas = getMetadataStorage().getTargetValidationMetadatas(
    dto as new () => object,
    '',
    false,
    false,
  ) as unknown as Meta[];
  const byField = new Map<string, Meta[]>();
  for (const m of metas) byField.set(m.propertyName, [...(byField.get(m.propertyName) ?? []), m]);

  const out: FieldInfo[] = [];
  for (const [name, list] of byField) {
    const f: FieldInfo = { name, type: 'string', required: true, notes: [] };
    for (const m of list) {
      if (m.type === 'conditionalValidation') f.required = false;
      else if (m.type === 'nestedValidation') f.type = f.type === 'array' ? 'array' : 'object';
      else if (m.type === 'customValidation' || m.type === 'isDefined') {
        const c = m.constraints ?? [];
        switch (m.name) {
          case 'isString':
            f.type = f.type === 'array' ? 'array' : 'string';
            break;
          case 'isInt':
            f.type = 'integer';
            break;
          case 'isNumber':
            f.type = 'number';
            break;
          case 'isBoolean':
            f.type = 'boolean';
            break;
          case 'isArray':
            f.type = 'array';
            break;
          case 'isObject':
            f.type = 'object';
            break;
          case 'isUuid':
            f.format = 'uuid';
            break;
          case 'isIso8601':
            f.format = 'date-time';
            break;
          case 'isEmail':
            f.format = 'email';
            break;
          case 'isIn':
            f.enum = VALUES(c[0]);
            break;
          case 'isEnum':
            f.enum = VALUES(c[0]);
            break;
          case 'isLength':
            f.minLength = Number(c[0]);
            if (c[1] !== undefined) f.maxLength = Number(c[1]);
            break;
          case 'minLength':
            f.minLength = Number(c[0]);
            break;
          case 'maxLength':
            f.maxLength = Number(c[0]);
            break;
          case 'min':
            f.minimum = Number(c[0]);
            break;
          case 'max':
            f.maximum = Number(c[0]);
            break;
          case 'arrayMaxSize':
            f.maxItems = Number(c[0]);
            break;
          case 'arrayUnique':
            f.notes.push('no repeats');
            break;
          case 'matches':
            f.pattern = c[0] instanceof RegExp ? c[0].source : String(c[0]);
            break;
          default:
            break;
        }
      }
    }
    out.push(f);
  }
  return out;
}

/** A JSON Schema fragment for one field. */
export function schemaOf(f: FieldInfo): Record<string, unknown> {
  return {
    type: f.type,
    ...(f.format ? { format: f.format } : {}),
    ...(f.enum ? { enum: f.enum } : {}),
    ...(f.minLength !== undefined ? { minLength: f.minLength } : {}),
    ...(f.maxLength !== undefined ? { maxLength: f.maxLength } : {}),
    ...(f.minimum !== undefined ? { minimum: f.minimum } : {}),
    ...(f.maximum !== undefined ? { maximum: f.maximum } : {}),
    ...(f.maxItems !== undefined ? { maxItems: f.maxItems } : {}),
    ...(f.pattern ? { pattern: f.pattern } : {}),
    ...(f.notes.length ? { description: f.notes.join('; ') } : {}),
  };
}
