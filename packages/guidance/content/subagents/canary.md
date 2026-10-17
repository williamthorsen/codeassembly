---
name: canary
description: Deployment canary for the declared-subagent mechanism; not meant to be invoked.
standalone: exercises the declared-subagent mechanism rather than doing work of its own
tools: [Read]
---

# Canary

This subagent exists to prove that declared subagents deploy end-to-end. It doesn't have any consumers in this library and is never dispatched. Its body deliberately exercises the harness transform so that the deployed file is a real specimen: The transform rewrites a `{tool:Read}` placeholder to the harness-native tool name and a `{harness_home_dir}` reference to the harness home path.

Read configuration from `{harness_home_dir}/skills/_data/` if you ever need it, using the {tool:Read} tool.
