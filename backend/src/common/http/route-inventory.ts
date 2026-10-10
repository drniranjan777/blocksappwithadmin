import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { ModulesContainer, Reflector } from '@nestjs/core';
import {
  ALLOW_ENROL_SCOPE,
  ANY_ADMIN,
  IS_ADMIN_ROUTE,
  IS_PUBLIC,
  IS_RAW,
  PERMISSIONS_KEY,
  PUBLISHES,
} from '../decorators/route-metadata.js';
import { type FieldInfo, fieldsOf } from './route-schemas.js';

/** What the guards will decide about one route, read from the same metadata they read. */
export interface RouteInfo {
  method: string;
  /** The full path, `/api/v1/...`, with `:params` as written. */
  path: string;
  controller: string;
  handler: string;
  /** Anyone may call it, signed in or not. */
  public: boolean;
  /** Protected by the staff guard rather than the app-user guard. */
  admin: boolean;
  /** Permissions a staff member must hold (all of them). */
  permissions: string[];
  /** Any fully signed-in staff member (their own profile, their own sessions). */
  anyAdmin: boolean;
  /** A step a half-enrolled staff account may take (set a password, set up two-step). */
  enrolScope: boolean;
  /** Puts something in front of other people; a restricted account is refused. */
  publishes: boolean;
  /** Returns a body that is not wrapped in the usual envelope (files, health probes). */
  raw: boolean;
  /** The JSON body it accepts, as its validators describe it. */
  body: FieldInfo[];
  /** The query parameters it accepts, as its validators describe them. */
  query: FieldInfo[];
}

/** The DTO class used for the body (or the query) of a handler, if it takes one as a whole. */
function dtoFor(controller: object, handler: string, kind: RouteParamtypes): FieldInfo[] {
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller.constructor, handler) as
    Record<string, { index: number; data?: unknown }> | undefined;
  const types = Reflect.getMetadata('design:paramtypes', controller, handler) as
    unknown[] | undefined;
  for (const [key, arg] of Object.entries(args ?? {})) {
    if (Number(key.split(':')[0]) === kind && arg.data === undefined) {
      return fieldsOf(types?.[arg.index]);
    }
  }
  return [];
}

const METHODS: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
};

const joinPath = (...parts: Array<string | undefined>): string =>
  `/${parts
    .flatMap((p) => (p ?? '').split('/'))
    .filter(Boolean)
    .join('/')}`;

const first = (value: unknown): string | undefined =>
  Array.isArray(value) ? (value[0] as string | undefined) : (value as string | undefined);

/**
 * Every HTTP route the application serves, with its protection. Used by the route-protection test
 * (so a new route cannot quietly be left open) and by the API documentation generator.
 */
export function listRoutes(app: INestApplication, prefix = 'api/v1'): RouteInfo[] {
  const reflector = new Reflector();
  const routes: RouteInfo[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!controller) continue;
      const base = first(Reflect.getMetadata(PATH_METADATA, controller));
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        if (name === 'constructor') continue;
        const handler = (controller.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (method === undefined) continue;
        const path = first(Reflect.getMetadata(PATH_METADATA, handler));
        const targets = [handler, controller];
        const flag = (key: string) => !!reflector.getAllAndOverride<boolean>(key, targets);
        routes.push({
          method: METHODS[method] ?? String(method),
          path: joinPath(prefix, base, path),
          controller: controller.name,
          handler: name,
          public: flag(IS_PUBLIC),
          admin: flag(IS_ADMIN_ROUTE),
          permissions:
            reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, targets) ?? [],
          anyAdmin: flag(ANY_ADMIN),
          enrolScope: flag(ALLOW_ENROL_SCOPE),
          publishes: flag(PUBLISHES),
          raw: flag(IS_RAW),
          body: dtoFor(controller.prototype, name, RouteParamtypes.BODY),
          query: dtoFor(controller.prototype, name, RouteParamtypes.QUERY),
        });
      }
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}
