import { createHash, randomUUID } from 'node:crypto';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

interface Stored {
  body: Buffer;
  contentType: string;
}

export interface SeenRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingMessage['headers'];
}

/**
 * Just enough of Amazon S3 (path-style) to run the real AWS SDK against: put, get with
 * ranges, head, delete, and multipart uploads. It does **not** verify signatures: it
 * proves that the driver issues the right *operations*, not that S3 would accept the
 * signature. It records every request so tests can inspect them.
 */
export class FakeS3 {
  readonly objects = new Map<string, Stored>();
  readonly requests: SeenRequest[] = [];
  private readonly uploads = new Map<
    string,
    { key: string; contentType: string; parts: Map<number, Buffer> }
  >();
  private server: Server | undefined;
  endpoint = '';

  async start(): Promise<void> {
    const server = createServer((req, res) => void this.handle(req, res));
    this.server = server;
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    this.endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((done) => (this.server ? this.server.close(() => done()) : done()));
  }

  private static async read(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
    const url = new URL(req.url ?? '/', 'http://fake');
    const method = req.method ?? 'GET';
    this.requests.push({
      method,
      path: url.pathname,
      query: url.searchParams,
      headers: req.headers,
    });
    const key = decodeURIComponent(url.pathname.slice(1)); // "bucket/key"
    const xml = (status: number, body: string) => {
      res.writeHead(status, { 'Content-Type': 'application/xml' });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
    };
    const error = (status: number, code: string) =>
      xml(status, `<Error><Code>${code}</Code><Message>${code}</Message></Error>`);

    if (method === 'POST' && url.searchParams.has('uploads')) {
      const uploadId = randomUUID();
      this.uploads.set(uploadId, {
        key,
        contentType: String(req.headers['content-type'] ?? 'application/octet-stream'),
        parts: new Map(),
      });
      return xml(
        200,
        `<InitiateMultipartUploadResult><Bucket>b</Bucket><Key>k</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`,
      );
    }
    if (method === 'POST' && url.searchParams.has('uploadId')) {
      const upload = this.uploads.get(url.searchParams.get('uploadId') ?? '');
      if (!upload) return error(404, 'NoSuchUpload');
      const wanted = [
        ...(await FakeS3.read(req)).toString().matchAll(/<PartNumber>(\d+)<\/PartNumber>/g),
      ].map((m) => Number(m[1]));
      const parts = wanted.map((n) => upload.parts.get(n));
      if (parts.some((p) => !p)) return error(400, 'InvalidPart');
      this.objects.set(upload.key, {
        body: Buffer.concat(parts as Buffer[]),
        contentType: upload.contentType,
      });
      this.uploads.delete(url.searchParams.get('uploadId') ?? '');
      return xml(
        200,
        '<CompleteMultipartUploadResult><ETag>"joined"</ETag></CompleteMultipartUploadResult>',
      );
    }
    if (method === 'PUT') {
      const body = await FakeS3.read(req);
      const etag = `"${createHash('md5').update(body).digest('hex')}"`;
      const uploadId = url.searchParams.get('uploadId');
      if (uploadId) {
        const upload = this.uploads.get(uploadId);
        if (!upload) return error(404, 'NoSuchUpload');
        upload.parts.set(Number(url.searchParams.get('partNumber')), body);
      } else {
        this.objects.set(key, {
          body,
          contentType: String(req.headers['content-type'] ?? 'binary/octet-stream'),
        });
      }
      res.writeHead(200, { ETag: etag });
      return res.end();
    }
    if (method === 'DELETE') {
      const uploadId = url.searchParams.get('uploadId');
      if (uploadId) {
        if (!this.uploads.delete(uploadId)) return error(404, 'NoSuchUpload');
      } else this.objects.delete(key);
      res.writeHead(204);
      return res.end();
    }
    const obj = this.objects.get(key);
    if (!obj) {
      res.writeHead(404, { 'Content-Type': 'application/xml' });
      return res.end(method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>');
    }
    if (method === 'HEAD') {
      res.writeHead(200, {
        'Content-Length': obj.body.length,
        'Content-Type': obj.contentType,
        ETag: '"abc"',
      });
      return res.end();
    }
    if (method === 'GET') {
      const range = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers['range'] ?? ''));
      if (range) {
        const start = Number(range[1]);
        const end = Math.min(Number(range[2]), obj.body.length - 1);
        const slice = obj.body.subarray(start, end + 1);
        res.writeHead(206, {
          'Content-Length': slice.length,
          'Content-Range': `bytes ${start}-${end}/${obj.body.length}`,
          'Content-Type': obj.contentType,
        });
        return res.end(slice);
      }
      res.writeHead(200, { 'Content-Length': obj.body.length, 'Content-Type': obj.contentType });
      return res.end(obj.body);
    }
    return error(405, 'MethodNotAllowed');
  }
}
