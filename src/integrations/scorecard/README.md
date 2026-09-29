# Scorecard (deferred)

Your team has a required scorecard that the owner will provide later. **It is intentionally not built.** This folder
only marks where it will live so nothing else has to move.

## Expected interface

```ts
// src/integrations/scorecard/index.ts (to be added)
export type Scorecard = unknown; // the owner will define the shape

/** One member's scorecard for one season. Must enforce access itself (see below). */
export function getScorecard(userId: string, seasonId: string): Promise<Scorecard>;
```

## Rules for whoever builds it

- Permissions are enforced on the server. A member sees only their own scorecard; leads and admins see everyone's;
  a parent sees only an approved student's, and only through `src/lib/parent-scope.ts` (`requireStudent`), never by
  trusting an id from the URL.
- Season-based: it takes a `seasonId`, and archived seasons stay viewable.
- No UI slot is provided yet. Add the page and navigation only when the owner supplies the details.
- Anything it stores or shows about people must be added to the Privacy Policy (`src/lib/legal/privacy.ts`) in the
  same change.
