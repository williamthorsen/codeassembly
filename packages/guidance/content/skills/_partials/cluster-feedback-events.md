An inventory is clustered in batches, because one clusterer cannot place every event of a large store. Each batch is clustered on its own, and when there is more than one, a merge pass groups the batch clusters that teach the same lesson.

1. Run `lesson-clusters inventory --store <store> --out {work}/inventory.json`. Report each `skipped` file, and stop when `pool` and `deferred` are both zero: Nothing awaits attention.
2. Run `lesson-clusters batch --inventory {work}/inventory.json --out {work}/batches`. Its `batches` list gives each batch's `path` and the `map` path to which its clusterer writes.
3. Send one {tool:Task} call per batch, all in one message, `subagent_type: lesson-clusterer`, each with this block and nothing else composed into it:

   ```dispatch
   inventory: {batch path}
   output: {batch map path}
   ```

4. When there is one batch, its map is the event map: Copy `{work}/batches/map-01.json` to `{work}/map.json`, and skip sub-steps 5 to 7.
5. Run `lesson-clusters lessons --batches {work}/batches --out {work}/lessons.json`. On `invalid-map`, resume the clusterer of each batch that the `violations` name once, sending it that batch's violations and asking it to correct its map; on Claude Code, send it a message with `SendMessage`, addressed by the agent ID that its dispatch returned. Run `lessons` again, and on a second failure, stop and report the violations.
6. Send one more {tool:Task} call, `subagent_type: lesson-clusterer`, for the merge pass:

   ```dispatch
   inventory: {work}/lessons.json
   output: {work}/merge.json
   ```

7. Run `lesson-clusters combine --batches {work}/batches --lessons {work}/lessons.json --map {work}/merge.json --out {work}/map.json`. On `invalid-map`, resume the merge clusterer once with the violations, run `combine` again, and on a second failure, stop and report them.
