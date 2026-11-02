type Log = (message: string, err?: unknown) => void;

export interface Logger {
  info: Log;
  error: Log;
}

const write = (stream: 'log' | 'error', scope: string, message: string, err?: unknown) => {
  const line = `${new Date().toISOString()} [${scope}] ${message}`;
  if (err === undefined) console[stream](line);
  else console[stream](line, err);
};

export function createLogger(scope: string): Logger {
  return {
    info: (message, err) => write('log', scope, message, err),
    error: (message, err) => write('error', scope, message, err),
  };
}
