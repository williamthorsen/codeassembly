---
title: A custom insight record
recordType: insight
captured-at: 2026-05-22T10:00:00.000Z
repo: owner/repo-custom
# Deliberately bare to exercise the legacy YYYY-MM-DD age-parsing path of `computeAgeDays`.
last-verified: 2026-04-10
summary: A custom insight surfaced during review
tags: [custom]
---

A custom record type carrying both a capture timestamp and a last-verified date,
so a single fixture can exercise either recall policy.
