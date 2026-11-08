# Vendored skills

Copied in for the design-system colour pass. Both are Apache-2.0; their licences sit beside them.

| Skill | Source | Commit |
| --- | --- | --- |
| `impeccable` (+ `../agents/impeccable-*.md`) | https://github.com/pbakaus/impeccable (`.claude/`), v4.8.1 | 924bbd194d02e5e15a227e75b5901fb0d7a4ecad |
| `frontend-design` | https://github.com/anthropics/claude-plugins-official (`plugins/frontend-design/skills/`) | 0412be76f50ab4f4f8abff3753efa9269fbbca5b |

Impeccable's design-check hooks (`.claude/settings.json` upstream) are deliberately not installed: they run its downloaded engine binary on every edit. Its `scripts/bin/` is not vendored either; the launcher fetches and checksum-verifies it on first use.

To update, re-copy from upstream and bump the commit here.
