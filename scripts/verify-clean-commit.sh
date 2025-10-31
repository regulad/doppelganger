#!/bin/bash

# This script verifies that any precommit files are up-to-date.
pnpm exec turbo run precommit --dry=json 2>/dev/null | jq -e '.tasks[] | select(.task == "precommit") | select(.cache.status == "MISS")' > /dev/null && exit 1 || exit 0
