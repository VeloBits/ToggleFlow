CREATE TYPE "public"."segment_match" AS ENUM('all', 'any');--> statement-breakpoint
ALTER TABLE "segments" ALTER COLUMN "rules" SET DEFAULT '[[]]'::jsonb;--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "match" "segment_match" DEFAULT 'all' NOT NULL;--> statement-breakpoint
/*
 * Hand-written: drizzle-kit emits the DDL above but cannot know that `rules`
 * changed SHAPE, from a flat condition list to a list of AND-groups. The new
 * DEFAULT only applies to rows inserted from here on, so every existing row
 * still holds a flat list and has to be wrapped into a single group.
 *
 *   []          ->  [[]]        one empty group: still matches everyone
 *   [c1, c2]    ->  [[c1, c2]]  one group of two ANDed conditions
 *
 * With `match` defaulting to 'all', a single group evaluates exactly as the flat
 * list did, so no segment changes meaning. `lib/snapshot.ts` unwraps the
 * single-group case back to a bare `conditions` array when it writes the
 * snapshot, which is what keeps content hashes from churning.
 */
UPDATE "segments" SET "rules" = jsonb_build_array("rules");