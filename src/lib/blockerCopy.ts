export type BlockerCopy = { label: string; sentence: string };

const FALLBACK: BlockerCopy = {
  label: "Can't auto-approve",
  sentence: 'This row needs a manual check before it can be approved.',
};

const NORMALIZE = (raw: string | null | undefined) =>
  (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

const MAP: Record<string, BlockerCopy> = {
  missing_county_from_result: {
    label: 'County not confirmed',
    sentence:
      "We couldn't confirm a county for this address. Edit the address or override to valid if you're sure.",
  },
  route_mismatch: {
    label: 'Street name conflict',
    sentence:
      "The street name didn't match the verified address. Confirm the street, then approve.",
  },
  house_number_mismatch: {
    label: 'House number conflict',
    sentence:
      "The house number doesn't match the verified address.",
  },
  street_number_not_verified: {
    label: 'House number not verified',
    sentence:
      "We couldn't confirm a house number. Add one and retry.",
  },
  house_number_not_verified: {
    label: 'House number not verified',
    sentence:
      "We couldn't confirm a house number. Add one and retry.",
  },
  missing_street_number: {
    label: 'House number missing',
    sentence:
      'The address is missing a house number. Add one and retry.',
  },
  multiple_viable_candidates: {
    label: 'Multiple matches',
    sentence:
      'More than one valid candidate matched. Pick the right one and approve it.',
  },
  low_precision_match: {
    label: 'Approximate match',
    sentence:
      'The verifier returned an approximate match. Confirm before approving.',
  },
  low_precision: {
    label: 'Approximate match',
    sentence:
      'The verifier returned an approximate match. Confirm before approving.',
  },
  out_of_scope: {
    label: 'Outside scope',
    sentence:
      'This address is outside the counties or localities selected for this run.',
  },
  out_of_scope_city: {
    label: 'Outside scope',
    sentence:
      'This address is outside the counties or localities selected for this run.',
  },
  out_of_scope_county: {
    label: 'Outside scope',
    sentence:
      'This address is outside the counties or localities selected for this run.',
  },
};

export const humanizeBlocker = (raw: string | null | undefined): BlockerCopy => {
  const key = NORMALIZE(raw);
  if (!key) return FALLBACK;
  if (MAP[key]) return MAP[key];
  const rawStr = (raw ?? '').trim();
  if (/\s/.test(rawStr) && !/^[a-z0-9_]+$/.test(rawStr)) {
    return { label: rawStr, sentence: rawStr };
  }
  return FALLBACK;
};

export const blockerLabel = (raw: string | null | undefined) => humanizeBlocker(raw).label;
export const blockerSentence = (raw: string | null | undefined) => humanizeBlocker(raw).sentence;
