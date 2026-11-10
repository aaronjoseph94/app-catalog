# Vibe Catalog — Freebuff Sites

site id: 75026035-a40b-4be2-a3f5-1e43657fe3de
preview:    https://site-4f2c103d4f6044b098d1f110470c3e23.freebuff.page
production: https://site-fdc52e16990149b7b72ea766e0a4fdb6.freebuff.page

## Redeploy
    npx wrangler deploy --dry-run --outdir dist   # bundles dist/worker.js
    then sites_deploy with manifest.json

## Owner
Write your Freebuff user id (shown on the site after sign-in) to secrets/owner_id.txt,
then set secret OWNER_ID on preview and production via sites_set_secret.

## Local dev
    npm run dev   # http://localhost:8787 (development auth client, local D1)
