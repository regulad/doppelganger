# AGENTS.md

## Fixing Sentry issues

Errors from the web app and the Pheidippides apps go to Sentry, in the
`regulad` organization. When a commit fixes one of these issues, give its
message one `Fixes <SHORT-ID>` line per issue. Put them in their own paragraph,
after the body and before any trailers:

```
Wait out a booting device instead of giving up in two seconds

...

Fixes DOPPELGANGER-D3
Fixes DOPPELGANGER-D6

Co-Authored-By: ...
```

The short ID is the one Sentry shows on the issue, such as `DOPPELGANGER-D7` or
`PHEIDIPPIDES-LOCATE-E`.

Sentry's GitHub integration reads these lines and links each issue to the
commit. The `sentry-release` jobs in `.github/workflows/ci-cd.yml` link each
master build's release to its commits. Once the fixing commit is in a release,
Sentry marks the issue resolved in that release:

- Errors from older builds still running don't reopen it.
- An error from the fixed build or a later one reopens it as a regression.

For a pull request that will be squash-merged, also put the lines in the PR
description.
