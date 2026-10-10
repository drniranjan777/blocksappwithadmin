import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

/**
 * A coarse place name ("Hyderabad, TS") for a request, used for sign-in history
 * and risk scoring. Never a precise location, never stored beyond this label.
 */
export abstract class GeoLocator {
  abstract locate(req: Request): string | undefined;
}

/**
 * Reads the label from headers that the CDN or load balancer adds from its own
 * IP-geolocation (`X-Geo-City`, `X-Geo-Region`). The headers are trustworthy only
 * when the proxy overwrites any copy the client sent: configure it to, and set
 * `TRUST_PROXY_HOPS` to match. Without such a proxy no label is produced.
 */
@Injectable()
export class HeaderGeoLocator extends GeoLocator {
  locate(req: Request): string | undefined {
    const clean = (value: unknown): string | undefined => {
      if (typeof value !== 'string') return undefined;
      // Printable text only, short: it ends up in a log line and a notification.
      const text = value
        .replace(/[^\p{L}\p{N} .,'-]/gu, '')
        .trim()
        .slice(0, 60);
      return text || undefined;
    };
    const city = clean(req.headers['x-geo-city']);
    const region = clean(req.headers['x-geo-region']);
    return [city, region].filter(Boolean).join(', ') || undefined;
  }
}
