import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * A `?flag=true` query parameter.
 *
 * Query strings are text, and `Boolean('false')` is `true`, so the common
 * `@Type(() => Boolean)` turns `?unreadOnly=false` into "only unread". The words
 * are read explicitly here instead: `true` and `false` mean what they say, and
 * anything else is a validation error rather than a guess.
 */
export function QueryFlag(): PropertyDecorator {
  const transform = Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  );
  const optional = IsOptional();
  const bool = IsBoolean();
  return (target, key) => {
    transform(target, key);
    optional(target, key);
    bool(target, key);
  };
}
