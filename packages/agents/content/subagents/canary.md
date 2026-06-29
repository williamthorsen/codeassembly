---
name: canary
description: Deployment canary for the declared-subagent mechanism; not meant to be invoked.
tools: [Read]
---

# Canary

This subagent exists to prove that declared subagents deploy end-to-end. It has no consumers and is never dispatched. Its body deliberately exercises the harness transform so the deployed file is a real specimen: a `{tool:Read}` placeholder rewrites to the harness-native tool name, and a `{harness_home_dir}` reference rewrites to the harness home path.

Read configuration from `{harness_home_dir}/skills/_data/` if you ever need it, using the {tool:Read} tool.
