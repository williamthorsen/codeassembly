import type { ChangeRecord, Taxonomy } from './types.ts';

/**
 * Derives the consolidated record of a branch's entries: the type that speaks for the branch, whether the branch is
 * breaking, and the scope where the entries agree on one.
 *
 * The type is the highest-ranked entry, never the most frequent one: breaking outranks non-breaking, then the tier's
 * position in the taxonomy, then the type's listing order within it. Ranking by frequency would let three routine
 * fixes speak over the one feature the branch exists for.
 *
 * Exactly one distinct scope survives; a branch carrying two names none, since no scope describes it.
 */
export function consolidate(entries: readonly ChangeRecord[], taxonomy: Taxonomy): ChangeRecord {
  const consolidated: ChangeRecord = {};

  const scopes = new Set<string>();
  for (const entry of entries) {
    if (entry.scope !== undefined) {
      scopes.add(entry.scope);
    }
  }
  const [scope] = scopes;
  if (scopes.size === 1 && scope !== undefined) {
    consolidated.scope = scope;
  }

  let winner: RankedEntry | undefined;
  for (const entry of entries) {
    const ranked = rankEntry(entry, taxonomy);
    if (ranked !== undefined && (winner === undefined || outranks(ranked.rank, winner.rank))) {
      winner = { breaking: entry.breaking === true, key: ranked.key, rank: ranked.rank };
    }
  }
  if (winner !== undefined) {
    consolidated.type = winner.key;
    if (winner.breaking) {
      consolidated.breaking = true;
    }
  }

  return consolidated;
}

// region | Helpers

/** Reports whether `rank` beats `incumbent` on breaking, then tier, then listing order. */
function outranks(rank: Rank, incumbent: Rank): boolean {
  if (rank.breaking !== incumbent.breaking) {
    return rank.breaking < incumbent.breaking;
  }
  if (rank.tier !== incumbent.tier) {
    return rank.tier < incumbent.tier;
  }
  return rank.listing < incumbent.listing;
}

/**
 * Ranks one entry against the taxonomy, lower being stronger, and reports the canonical key it named. Yields nothing
 * for a type the taxonomy omits, which no rank can place.
 */
function rankEntry(entry: ChangeRecord, taxonomy: Taxonomy): { key: string; rank: Rank } | undefined {
  const listing = taxonomy.types.findIndex((candidate) => candidate.key === entry.type);
  const workType = taxonomy.types[listing];
  if (workType === undefined) {
    return undefined;
  }
  const tier = taxonomy.tiers.indexOf(workType.tier);
  return {
    key: workType.key,
    rank: {
      breaking: entry.breaking === true ? 0 : 1,
      listing,
      tier: tier === -1 ? taxonomy.tiers.length : tier,
    },
  };
}

/** One entry's place in the ordering, each component lower-is-stronger. */
interface Rank {
  breaking: number;
  listing: number;
  tier: number;
}

/** The winning entry reduced to what the consolidated record needs from it. */
interface RankedEntry {
  breaking: boolean;
  key: string;
  rank: Rank;
}

// endregion | Helpers
