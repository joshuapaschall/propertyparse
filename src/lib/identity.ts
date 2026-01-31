const ORG_ID_KEY = 'pp-org-id';
const USER_ID_KEY = 'pp-user-id';

const generateFallbackId = () => {
  const segment = (length: number) =>
    Math.random()
      .toString(16)
      .slice(2)
      .padEnd(length, '0')
      .slice(0, length);
  return `${segment(8)}-${segment(4)}-${segment(4)}-${segment(4)}-${segment(12)}`;
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return generateFallbackId();
};

const getOrCreate = (key: string) => {
  if (typeof window === 'undefined') {
    return generateId();
  }
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const next = generateId();
  window.localStorage.setItem(key, next);
  return next;
};

export const getOrCreateOrgId = () => getOrCreate(ORG_ID_KEY);
export const getOrCreateUserId = () => getOrCreate(USER_ID_KEY);
