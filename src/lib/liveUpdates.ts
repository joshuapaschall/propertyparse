export type JobUpdateKind = 'job-updated' | 'metrics-updated' | 'job-exported';

export type JobUpdateEvent = {
  kind: JobUpdateKind;
  jobId?: string;
  orgId?: string;
  updatedAt: number;
};

const CHANNEL_NAME = 'propertyparse-live-updates';
const STORAGE_KEY = 'propertyparse-live-updates';

const safeParse = (value: string | null): JobUpdateEvent | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as JobUpdateEvent;
    if (!parsed || typeof parsed.kind !== 'string' || typeof parsed.updatedAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const publishJobUpdate = (event: Omit<JobUpdateEvent, 'updatedAt'> & { updatedAt?: number }) => {
  if (typeof window === 'undefined') return;
  const payload: JobUpdateEvent = { ...event, updatedAt: event.updatedAt ?? Date.now() };

  if (typeof window.BroadcastChannel !== 'undefined') {
    const channel = new window.BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const subscribeJobUpdates = (onEvent: (event: JobUpdateEvent) => void) => {
  if (typeof window === 'undefined') return () => undefined;

  const channel =
    typeof window.BroadcastChannel !== 'undefined'
      ? new window.BroadcastChannel(CHANNEL_NAME)
      : null;

  const onStorage = (storageEvent: StorageEvent) => {
    if (storageEvent.key !== STORAGE_KEY) return;
    const parsed = safeParse(storageEvent.newValue);
    if (parsed) onEvent(parsed);
  };

  const onMessage = (messageEvent: MessageEvent<JobUpdateEvent>) => {
    const payload = messageEvent.data;
    if (!payload || typeof payload.kind !== 'string') return;
    onEvent(payload);
  };

  window.addEventListener('storage', onStorage);
  channel?.addEventListener('message', onMessage);

  return () => {
    window.removeEventListener('storage', onStorage);
    channel?.removeEventListener('message', onMessage);
    channel?.close();
  };
};
