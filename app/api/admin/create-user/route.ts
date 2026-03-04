import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

type AppRole =
  | 'admin'
  | 'rcm'
  | 'event-manager'
  | 'reception'
  | 'trainer'
  | 'gear-manager'
  | 'track-manager';

function emailKey(email: string): string {
  return email.trim().toLowerCase().replaceAll('.', ',');
}

function isRole(value: string): value is AppRole {
  return ['admin', 'rcm', 'event-manager', 'reception', 'trainer', 'gear-manager', 'track-manager'].includes(value);
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      return NextResponse.json({ error: 'missing auth token' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const callerEmail = decoded.email?.toLowerCase();
    if (!callerEmail) {
      return NextResponse.json({ error: 'invalid caller identity' }, { status: 401 });
    }

    const callerDoc = await adminDb.collection('users').doc(emailKey(callerEmail)).get();
    const callerRole = (callerDoc.data()?.role ?? null) as AppRole | null;

    if (callerRole !== 'admin' && callerRole !== 'event-manager') {
      return NextResponse.json({ error: 'not allowed' }, { status: 403 });
    }

    const body = (await request.json()) as { email?: string; password?: string; role?: string };
    const email = body.email?.trim().toLowerCase() ?? '';
    const password = body.password?.trim() ?? '';
    const role = body.role?.trim() ?? '';

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'email, password and role are required' }, { status: 400 });
    }

    if (!isRole(role)) {
      return NextResponse.json({ error: 'invalid role' }, { status: 400 });
    }

    if (callerRole === 'event-manager' && (role === 'admin' || role === 'rcm' || role === 'event-manager')) {
      return NextResponse.json({ error: 'event manager can only create operational roles' }, { status: 403 });
    }

    try {
      await adminAuth.createUser({
        email,
        password,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'could not create auth user';
      if (!message.toLowerCase().includes('email-already-exists')) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    await adminDb.collection('users').doc(emailKey(email)).set(
      {
        email,
        role,
        createdAt: Date.now(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
