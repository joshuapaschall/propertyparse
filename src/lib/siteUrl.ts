const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

export function getSiteUrl(explicitSiteUrl?: string, origin = window.location.origin): string {
  const candidate = explicitSiteUrl ?? (import.meta.env.VITE_SITE_URL as string | undefined);
  const normalizedCandidate = candidate?.trim();

  if (normalizedCandidate) {
    return trimTrailingSlashes(normalizedCandidate);
  }

  return trimTrailingSlashes(origin);
}
