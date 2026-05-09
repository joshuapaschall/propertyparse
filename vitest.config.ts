import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
    css: true,
    // Default 5000ms is tight for jsdom + waitFor chains in some tests.
    // 10000ms gives slow CI runners headroom while passing tests still
    // complete in normal time (timeout only matters on hangs).
    testTimeout: 10000,
    // Auto-retry transient flakes once. Real failures still fail twice
    // and surface in CI; this catches one-shot races without forcing
    // PRs to merge with red CI under a "flaky-test policy" exemption.
    // B80 (AdminPage refresh) and B82 (DashboardPage subscribe-updates)
    // were observed once each during clusters R and R-2, then could
    // not be reproduced in 3 baseline runs of cluster X. Defensive close.
    retry: 1,
  },
});
