# Branch Protection — Status and Configuration

## Current status

Branch protection for `main` is **not enabled**. The GitHub API returns HTTP 403:

> Upgrade to GitHub Pro or make this repository public to enable this feature.

This is a **billing/account limitation**, not a code or configuration issue. The repository is private and the account is on the free tier.

## Recommended configuration (when available)

When the repository is upgraded to GitHub Pro or made public, apply the following branch protection rules to `main`:

| Setting                               | Value                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| Require a pull request before merging | Yes                                                                          |
| Required approvals                    | 1                                                                            |
| Dismiss stale reviews                 | Yes                                                                          |
| Require status checks to pass         | Yes                                                                          |
| Required status checks                | `Quality Gate`, `Payments Contracts`, `Ticketing Contracts`, `CRM Contracts` |
| Require branches to be up to date     | Yes                                                                          |
| Require conversation resolution       | Yes                                                                          |
| Require signed commits                | Recommended                                                                  |
| Include administrators                | Yes                                                                          |
| Allow force pushes                    | No                                                                           |
| Allow deletions                       | No                                                                           |

## API command (for when Pro is available)

```bash
gh api repos/luizidebook/touristic-digital-platform/branches/main/protection \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Quality Gate",
      "Payments Contracts",
      "Ticketing Contracts",
      "CRM Contracts"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

## Interim governance

Until branch protection is available, the following manual governance applies:

1. **All changes go through PRs** — no direct pushes to `main`.
2. **Quality Gate must pass locally** before requesting merge (`pnpm check`).
3. **Squash merge** is the default merge strategy to keep history clean.
4. **No force pushes** to `main` under any circumstances.
5. **Release promotion** requires explicit evidence documentation.
