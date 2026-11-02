import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

/**
 * Carrega `path` ao montar e sempre que o caminho ou o usuário logado mudam
 * (várias respostas dependem de quem pede). Respostas de requisições antigas são descartadas.
 */
export function useApi<T>(path: string) {
  const { user } = useAuth();
  const userId = user?.id;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++latest.current;
    try {
      const result = await api<T>(path);
      if (request !== latest.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (request === latest.current) setError((err as Error).message);
    }
  }, [path]);

  // userId não é usado dentro do efeito: está aqui para recarregar ao entrar/sair da conta.
  useEffect(() => {
    reload();
  }, [reload, userId]);

  return { data, error, reload, setData };
}
