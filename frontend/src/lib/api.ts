const TOKEN_KEY = 'auth_token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* armazenamento indisponível (aba anônima restrita) */
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sem conexão com o servidor. Verifique sua internet e tente novamente.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { code = 'UNKNOWN', message = 'Erro inesperado.', ...details } = data.error ?? {};
    if (res.status === 401 && token && code === 'UNAUTHENTICATED') tokenStore.set(null);
    throw new ApiError(res.status, code, message, details);
  }
  return data as T;
}
