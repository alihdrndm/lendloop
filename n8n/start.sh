#!/bin/sh
# Import the workflows from the repo, publish them, then start n8n.
set -e

n8n import:workflow --separate --input=/lendloop/workflows
for id in lendloopErrorsWf lendloopRequests lendloopOverdues; do
  n8n publish:workflow --id="$id"
done

exec n8n start
