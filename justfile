default:
    @just --list

test:
    npm test

pack:
    sh scripts/pack.sh

# Bump version, commit, tag vX.Y.Z and push; CI then builds the release.
release version:
    #!/usr/bin/env bash
    set -euo pipefail
    v="{{version}}"
    [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3" >&2; exit 1; }
    [[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || { echo "release from main" >&2; exit 1; }
    [[ -z "$(git status --porcelain)" ]] || { echo "working tree is not clean" >&2; exit 1; }
    if git rev-parse -q --verify "refs/tags/v$v" >/dev/null; then echo "tag v$v already exists" >&2; exit 1; fi
    for f in src/info.json package.json; do
      node -e 'const fs=require("fs"),[f,v]=process.argv.slice(1);fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/"version": "[^"]*"/,`"version": "${v}"`))' "$f" "$v"
    done
    npm test
    git add src/info.json package.json
    git commit -m "chore: release v$v"
    git tag -a "v$v" -m "v$v"
    git push --atomic origin main "v$v"
