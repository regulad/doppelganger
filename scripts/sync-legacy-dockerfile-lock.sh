#!/bin/bash

set -e

# make-dedicated-lockfile has an extremely weird side effect of mutating the state of the entire project. 

WORKSPACE=$(pwd)

cp_reflink() {
    # Detect platform and try platform-specific reflink option
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - try cp -c (clone)
        cp -c "$@" 2>/dev/null || cp "$@"
    else
        # Linux/other - try cp --reflink
        cp --reflink=auto "$@" 2>/dev/null || cp "$@"
    fi
}

TEMP_DIR=$(mktemp -d)

cp_reflink -r . $TEMP_DIR || echo "Had some weird copying trouble. Continuing..."

cd $TEMP_DIR

cd apps/web
pnpm exec make-dedicated-lockfile &>/dev/null
cp $TEMP_DIR/apps/web/pnpm-lock.yaml $WORKSPACE/apps/web

cd $WORKSPACE
rm -rf $TEMP_DIR
