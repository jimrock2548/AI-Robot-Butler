import { NextRequest, NextResponse } from 'next/server';

const backend = process.env.API_URL ?? 'http://localhost:4000';
const token = process.env.KIOSK_TOKEN ?? (process.env.NODE_ENV === 'production' ? undefined : 'dev-kiosk-token');

async function forward(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path;
  const allowed =
    (req.method === 'GET' && path.length === 1 && ['destinations', 'ai-status'].includes(path[0])) ||
    (req.method === 'GET' && path.length === 2 && path[0] === 'session' && /^\d+$/.test(path[1])) ||
    (req.method === 'POST' && path.length === 1 && path[0] === 'conversation') ||
    (req.method === 'GET' && path.length === 2 && path[0] === 'conversation' && /^[0-9a-f-]{36}$/i.test(path[1])) ||
    (req.method === 'POST' && path.length === 3 && path[0] === 'conversation' && /^[0-9a-f-]{36}$/i.test(path[1]) && path[2] === 'messages') ||
    (req.method === 'POST' && path.length === 1 && ['escort', 'cancel', 'intent', 'voice', 'chat'].includes(path[0]));
  if (!allowed) return NextResponse.json({ error: { code: 'not_found', message: 'ไม่พบคำสั่ง' } }, { status: 404 });
  if (!token) return NextResponse.json({ error: { code: 'unconfigured', message: 'ยังไม่ได้ตั้งค่าจอหุ่น' } }, { status: 503 });

  try {
    const body = req.method === 'POST' ? await req.arrayBuffer() : undefined;
    if (body && body.byteLength > 2_000_000) {
      return NextResponse.json({ error: { code: 'too_large', message: 'ไฟล์เสียงใหญ่เกินไป' } }, { status: 413 });
    }
    const url = new URL(`/api/kiosk/${path.join('/')}`, backend);
    url.search = req.nextUrl.search;
    const deadline = AbortSignal.timeout(path[0] === 'chat' || path[2] === 'messages' ? 105_000 : path[0] === 'voice' || path[0] === 'intent' ? 23_000 : 5000);
    const upstream = await fetch(url, {
      method: req.method,
      headers: { 'Content-Type': req.headers.get('content-type') ?? 'application/json', Authorization: `Bearer ${token}`,
        'x-conversation-token': req.headers.get('x-conversation-token') ?? '' },
      body,
      cache: 'no-store',
      signal: AbortSignal.any([req.signal, deadline]),
    });
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const timedOut = error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name);
    const aiRequest = ['voice', 'intent', 'chat'].includes(path[0]);
    return NextResponse.json({ error: {
      code: timedOut && aiRequest ? 'ai_timeout' : 'backend_unavailable',
      message: timedOut && aiRequest ? 'รอคำตอบจาก AI นานเกินไป กรุณาลองใหม่' : 'เชื่อมต่อระบบหลังบ้านไม่ได้',
    } }, { status: timedOut && aiRequest ? 504 : 502 });
  }
}

export const GET = forward;
export const POST = forward;
