import { auth } from '../lib/firebase';

const TOKEN_KEY = 'amzhub_br_token';

// Firebase ID tokens are kept strictly in memory (never in localStorage).
let firebaseMemoryToken: string | null = null;

export function setFirebaseMemoryToken(token: string | null): void {
  firebaseMemoryToken = token;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export async function getActiveAuthToken(): Promise<string | null> {
  if (auth.currentUser) {
    try {
      const fresh = await auth.currentUser.getIdToken();
      firebaseMemoryToken = fresh;
      return fresh;
    } catch {
      return firebaseMemoryToken;
    }
  }
  if (firebaseMemoryToken) return firebaseMemoryToken;
  return getStoredToken();
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getActiveAuthToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erro na requisição (${res.status})`);
  }
  return data as T;
}
