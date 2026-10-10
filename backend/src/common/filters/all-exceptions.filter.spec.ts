import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../errors/app-error.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

/** Runs one error through the filter and returns what the client would have received. */
function answer(error: unknown) {
  const headers: Record<string, string> = {};
  const sent: { status?: number; body?: { error: Record<string, unknown> } } = {};
  const res = {
    headersSent: false,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    status: (code: number) => {
      sent.status = code;
      return { json: (body: { error: Record<string, unknown> }) => (sent.body = body) };
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: 'req-1', method: 'POST', path: '/api/v1/x' }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  const filter = new AllExceptionsFilter();
  vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  filter.catch(error, host);
  return { status: sent.status, error: sent.body?.error, headers };
}

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('SQL detail that must never reach a client', {
    code,
    clientVersion: 'test',
  });

describe('the one place errors leave the API', () => {
  it('answers a database that was too busy to start the work with "try again", not a 500', () => {
    for (const code of ['P2028', 'P2034']) {
      const { status, error, headers } = answer(known(code));
      expect(status, code).toBe(503);
      expect(error).toMatchObject({ code: 'SERVICE_UNAVAILABLE', requestId: 'req-1' });
      expect(headers['Retry-After']).toBe('1');
      expect(JSON.stringify(error)).not.toContain('SQL detail');
    }
  });

  it('still maps the ordinary database errors it always did', () => {
    expect(answer(known('P2002')).status).toBe(409);
    expect(answer(known('P2025')).status).toBe(404);
    expect(answer(known('P2003')).status).toBe(409);
  });

  it('answers any other database error with a plain 500 that says nothing about the database', () => {
    const { status, error } = answer(known('P1001'));
    expect(status).toBe(500);
    expect(error).toMatchObject({ code: 'INTERNAL' });
    expect(JSON.stringify(error)).not.toMatch(/SQL|P1001/);
  });

  it("passes the API's own errors through with their code and message", () => {
    const { status, error } = answer(new AppError(409, 'CONFLICT', 'Already done.'));
    expect(status).toBe(409);
    expect(error).toMatchObject({ code: 'CONFLICT', message: 'Already done.' });
  });

  it('keeps framework errors in the same envelope', () => {
    const { status, error } = answer(new BadRequestException('nope'));
    expect(status).toBe(400);
    expect(error).toHaveProperty('requestId', 'req-1');
  });

  it('never lets an unknown error leak its message', () => {
    const { status, error } = answer(new Error('connection string postgres://user:secret@host'));
    expect(status).toBe(500);
    expect(JSON.stringify(error)).not.toContain('secret');
  });
});
