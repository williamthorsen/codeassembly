A cluster whose events all predate a change to the guidance that governs its lesson is evidence about guidance that no longer exists: It does not show that the failure recurs under the current guidance. Before you judge a cluster's priority, check whether that guidance changed after the cluster's latest capture, `signals.latestCapturedAt` in the clusters file.

Check each artifact that states or should state the lesson: the target, every artifact that your search found stating the lesson, and every partial that one of them includes.

1. Find the artifact's source file in the repository that owns it. A guidance-library artifact's source is under `packages/guidance/content/` in the CodeAssembly repository, at its path relative to the content root, such as `subagents/entry-drafter.md`.
2. List the commits that touched the source file after the latest capture. In a local clone of the owning repository, run `git -C {clone} log --first-parent --since={latestCapturedAt} --format='%h %cs %s' -- {path}`. Otherwise, run `gh api 'repos/{owner}/{repo}/commits?path={path}&since={latestCapturedAt}' --jq '.[] | [.sha[0:8], .commit.committer.date, (.commit.message | split("\n")[0])] | @tsv'`.
3. Read the message of each listed commit, with `git -C {clone} show --no-patch --format=%B {sha}` or `gh api repos/{owner}/{repo}/commits/{sha} --jq .commit.message`. A commit changed the guidance when it changed what the artifact tells the agent to do about the lesson. A commit that only repairs prose, reformats, or renames does not.

The guidance changed after the latest capture when at least one commit changed it; name the latest such commit by its short SHA, date, and subject. Otherwise, it did not change.
