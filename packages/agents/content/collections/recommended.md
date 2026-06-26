---
name: recommended
description: The batteries-included default set of artifacts, opt-in via codeassembly.yaml.
dependencies:
  skills:
    - people-report
  subagents:
    - canary
---

# Recommended

A dependency-only aggregate: declaring it in `codeassembly.yaml` pulls in its members' transitive closure, which `sync` then deploys. It currently bundles the declared proof artifacts to exercise collection resolution end-to-end; the full default set joins it once global delivery lands.
