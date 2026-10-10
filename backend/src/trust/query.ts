import type { Request } from 'express';
import { clientIp, userAgentOf } from '../common/http/request.js';

export { QueryFlag } from '../common/http/query-flag.js';

export const meta = (req: Request) => ({ ip: clientIp(req), userAgent: userAgentOf(req) });
