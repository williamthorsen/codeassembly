---
recordType: event
id: 01HZAAAAAAAAAAAAAAAAAAAAAA
captured-at: 2026-05-20T10:00:00.000Z
session: session-1
cwd: /tmp/work
repo: owner/repo-x
summary: Noticed a flaky retry under fake timers
---

The retry path polls real time, so fake timers never advance it.
