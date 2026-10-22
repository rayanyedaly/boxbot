// lib/agent/kb-search.ts
//
// Knowledge-base search, shared by the agent's search_knowledge_base tool and the UI
// that re-resolves logged queries into citations — so a citation always names the
// articles the agent actually saw.
//
// Postgres full-text search, ranked. The model writes keyword-style queries
// ("refund policy annual plan"), so terms are OR'd and ts_rank puts the article
// matching the most of them first; title and tags outweigh body. English stemming lets
// "refunds"/"refunded" match "refund". The vector is computed per query — fine at this
// KB's size; a larger KB would add a GIN expression index.

import { prisma } from "../prisma";

export interface KbHit {
  title: string;
  body: string;
  slug: string;
}

export const KB_DEFAULT_LIMIT = 3;
const KB_MAX_LIMIT = 10;

/**
 * Free text → an OR'd tsquery ("refund | annual | plan"). Only letter/digit runs
 * survive — every tsquery operator is punctuation — so model or customer text can't
 * change the query's shape. Returns null when nothing searchable is left.
 */
export function orQuery(text: string): string | null {
  const terms = [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
  return terms.length ? terms.join(" | ") : null;
}

/** Model-supplied limit → an integer in 1..10 (default 3 when missing or not a number). */
export function kbLimit(limit: unknown): number {
  const n = Math.trunc(Number(limit));
  if (limit == null || !Number.isFinite(n) || n === 0) return KB_DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), KB_MAX_LIMIT);
}

export async function searchKb(query: string, limit?: unknown): Promise<KbHit[]> {
  const tsquery = orQuery(query);
  if (!tsquery) return [];
  return prisma.$queryRaw<KbHit[]>`
    SELECT title, body, slug
    FROM (
      SELECT title, body, slug,
        ts_rank(
          setweight(to_tsvector('english', title || ' ' || array_to_string(tags, ' ')), 'A') ||
          setweight(to_tsvector('english', body), 'B'),
          to_tsquery('english', ${tsquery})
        ) AS rank
      FROM "KbArticle"
    ) ranked
    WHERE rank > 0
    ORDER BY rank DESC, slug ASC
    LIMIT ${kbLimit(limit)}`;
}
