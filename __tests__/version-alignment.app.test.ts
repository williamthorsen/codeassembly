import { checkNodeVersionConsistency, findMonorepoRoot } from '@williamthorsen/nmr/tests';

checkNodeVersionConsistency(findMonorepoRoot());
