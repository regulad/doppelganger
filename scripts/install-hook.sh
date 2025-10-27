#!/bin/bash

# Create the pre-commit hook file
cat > .git/hooks/pre-commit << EOL
#!/bin/sh

# While it would be good to run this on every commit, on macOS it takes way too long due to copying with -c into the tmpdir being horribly inefficient. (Is it possible that /var/tmp is mounted as a memory disk and it has to copy it? Not sure.)
#echo "Syncing lock for legacy Dockerfile..."
#./scripts/sync-legacy-dockerfile-lock.sh

echo "Running formatter..."
if pnpm format --check | grep -q "Files were formatted"; then
  exit 1
fi

echo "Running type check, lint, and test..."
turbo type-check lint test || exit 1

echo "All checks passed"
exit 0
EOL

# Make the hook executable
chmod +x .git/hooks/pre-commit

echo "Pre-commit hook installed successfully!"
