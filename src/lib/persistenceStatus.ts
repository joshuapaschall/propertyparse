export const LOCAL_PARSE_PERSISTENCE_KEY = 'pp-local-parse-persistence';
const VERSION = 1;

export type LocalParsePersistenceState = {
  version: number;
  jobId?: string;
  completedAt: string;
  persistenceWarning: boolean;
};

export const readLocalParsePersistenceState = (): LocalParsePersistenceState | null => {
  try {
    const raw = window.localStorage.getItem(LOCAL_PARSE_PERSISTENCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalParsePersistenceState;
    if (!parsed || parsed.version !== VERSION || !parsed.completedAt) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeLocalParsePersistenceState = (input: {
  jobId?: string;
  persistenceWarning: boolean;
}) => {
  const payload: LocalParsePersistenceState = {
    version: VERSION,
    jobId: input.jobId,
    completedAt: new Date().toISOString(),
    persistenceWarning: input.persistenceWarning,
  };
  try {
    window.localStorage.setItem(LOCAL_PARSE_PERSISTENCE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
};

export const clearLocalParsePersistenceState = () => {
  try {
    window.localStorage.removeItem(LOCAL_PARSE_PERSISTENCE_KEY);
  } catch {
    // ignore storage failures
  }
};
