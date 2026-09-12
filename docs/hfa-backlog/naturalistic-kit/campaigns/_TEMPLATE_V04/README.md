# V04 campaign template

Use only for new per-axis campaigns. Populate `manifest.json`, then lock authorized source/reference artifacts before blind review.

Directories:
- `reference/`: sealed human/adjudicated reference; never distribute to blind reviewers
- `blind/`: blind evaluator forms only
- `vnext/`: engine captures after reference lock
- `adjudication/`: post-review disagreement resolution
- `pairs/`: V2 descriptive pairs
- `leakage/`: development-exposure and holdout-integrity records

The template intentionally contains zero real cases and zero reviewers.
