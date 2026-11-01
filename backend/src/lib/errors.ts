export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Recurso') => new AppError(404, 'NOT_FOUND', `${what} não encontrado.`);
export const forbidden = (message = 'Você não tem permissão para esta ação.') =>
  new AppError(403, 'FORBIDDEN', message);
