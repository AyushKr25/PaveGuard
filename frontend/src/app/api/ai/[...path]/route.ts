import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy to the FastAPI AI service. The AI_SERVICE_SECRET is
// injected here so it never reaches the browser. The frontend calls
// /api/ai/<path> which forwards to AI_SERVICE_URL (default http://localhost:8000).
//
// Note: request bodies are limited by the platform (Vercel ~4.5 MB). Large
// video uploads should target the AI service URL directly from a trusted
// environment or use pre-signed storage uploads.

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || 'http://localhost:8000';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'host',
  'content-length',
]);

async function forward(request: NextRequest, path: string[]) {
  const target = `${AI_SERVICE_URL}/${path.join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const secret = process.env.AI_SERVICE_SECRET;
  if (secret) {
    headers.set('X-AI-Service-Secret', secret);
  }

  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(300000),
    });
  } catch {
    return NextResponse.json(
      { detail: 'AI service is unreachable. Start the ai-service or check NEXT_PUBLIC_AI_API_URL / AI_SERVICE_URL.' },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== 'content-encoding') {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

type Params = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { path } = await params;
  return forward(request, path);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { path } = await params;
  return forward(request, path);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { path } = await params;
  return forward(request, path);
}
