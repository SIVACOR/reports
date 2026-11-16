#!/bin/bash
# Print the progress-report statistics from the deploy-dev MongoDB.
# Restore a production dump first: deploy-dev/restore_dump.sh <dump.gz>
# SINCE=YYYY-MM-DD limits users/jobs/runs to that date onward (default: 12 months ago).
set -e
here=$(cd "$(dirname "$0")" && pwd)
mongo_cid=$(docker ps -qf name=wt_mongo)
[ -n "$mongo_cid" ] || { echo "wt_mongo is not running" >&2; exit 1; }
pre=""
[ -n "$SINCE" ] && pre="var SINCE=\"$SINCE\";"
# One personal domain per line; untracked because each names a person.
if [ -f "$here/personal_domains.txt" ]; then
    pre="$pre var EXTRA_PERSONAL=[$(grep -v '^\s*\(#\|$\)' "$here/personal_domains.txt" | sed 's/.*/"&"/' | paste -sd,)];"
else
    echo "note: no personal_domains.txt; vanity domains will count as institutions" >&2
fi
docker exec "$mongo_cid" mongo girder --quiet --eval "$pre$(cat "$here/stats.js")"
