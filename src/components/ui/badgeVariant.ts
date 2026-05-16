export type BadgeVariant =
  | 'neutral'
  | 'muted'
  | 'running'
  | 'done'
  | 'failed'
  | 'valid'
  | 'needs_review'
  | 'skipped'
  | 'duplicate'
  | 'out_of_scope';

export function getBadgeVariant(value: string | null | undefined): BadgeVariant {
  const normalized = (value ?? '').toUpperCase();
  if (normalized.includes('FAIL')) return 'failed';
  if (normalized.includes('DONE') || normalized.includes('COMPLETE') || normalized.includes('SUCCESS')) return 'done';
  if (normalized.includes('RUN') || normalized.includes('PENDING') || normalized.includes('PROCESS')) return 'running';
  if (normalized === 'VALID') return 'valid';
  if (normalized === 'NEEDS_REVIEW') return 'needs_review';
  if (normalized === 'SKIPPED') return 'skipped';
  if (normalized === 'DUPLICATE') return 'duplicate';
  if (normalized.startsWith('OUT_OF_SCOPE')) return 'out_of_scope';
  return 'neutral';
}
