# Archive Directory

This directory contains files that are no longer actively used but kept for reference.

## Contents

### Legacy Server Code
- `server/api.ts` - Old Express API routes (replaced by Vercel serverless functions)
- `server/mockData.ts` - Mock data generators (no longer used in production)
- `server/scheduler.ts` - Scheduled tasks using mock data (replaced by Vercel functions)

### Unused Components
- `client/src/components/JobMarketTemperature.tsx` - Component exists but not used in Home.tsx
- `client/src/components/VideoGrid.tsx` - Component exists but Videos Tab is placeholder

### Test Scripts
- Root-level test scripts (`test-*.ts`, `test-*.mjs`) - Temporary test scripts, replaced by `scripts/test-local-api.ts`

### Historical Documentation
- Various `.md` files documenting past milestones, fixes, and verification reports

## Notes

- These files are kept for historical reference and potential future use
- Do not import or use these files in active code
- If you need to reference them, check git history or this archive
