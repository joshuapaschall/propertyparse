const RECENT_CUSTOM_LOCALITIES_KEY = 'pp-recent-custom-localities';

export const normalizeLocalityInput = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const readRecentCustomValues = (cacheScope: string) => {
  try {
    const raw = window.localStorage.getItem(RECENT_CUSTOM_LOCALITIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return Array.isArray(parsed?.[cacheScope]) ? parsed[cacheScope] : [];
  } catch {
    return [];
  }
};

export const writeRecentCustomValue = (cacheScope: string, value: string) => {
  try {
    const raw = window.localStorage.getItem(RECENT_CUSTOM_LOCALITIES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    const existing = Array.isArray(parsed[cacheScope]) ? parsed[cacheScope] : [];
    parsed[cacheScope] = [value, ...existing.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 8);
    window.localStorage.setItem(RECENT_CUSTOM_LOCALITIES_KEY, JSON.stringify(parsed));
  } catch {
    // no-op
  }
};
