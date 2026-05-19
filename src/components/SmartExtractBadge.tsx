type SmartExtractBadgeProps = {
  kind?: string | null;
  addressesExtracted?: number;
  addressZone?: string;
  className?: string;
};

export default function SmartExtractBadge({ kind, addressesExtracted, addressZone, className }: SmartExtractBadgeProps) {
  const tooltipParts: string[] = [];
  if (kind) tooltipParts.push(`Type: ${kind.replace(/_/g, ' ')}`);
  if (typeof addressesExtracted === 'number') tooltipParts.push(`${addressesExtracted} addresses extracted`);
  if (addressZone) tooltipParts.push(`Zone: ${addressZone}`);
  const tooltip = tooltipParts.join(' • ');
  return <span title={tooltip || 'Smart Extract was used for this file'} className={className ?? 'inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200'} data-testid="smart-extract-badge"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true"><path d="M10 2a1 1 0 011 1v1.05a6 6 0 014.95 4.95H17a1 1 0 110 2h-1.05a6 6 0 01-4.95 4.95V17a1 1 0 11-2 0v-1.05A6 6 0 014.05 11H3a1 1 0 110-2h1.05A6 6 0 019 4.05V3a1 1 0 011-1z" /></svg>Smart Extract</span>;
}
