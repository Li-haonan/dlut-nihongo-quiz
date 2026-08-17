# Short sync relay

The static site uploads the existing compressed `DLUTSYNC:` value to this small Cloudflare
Worker and receives a 19-character code such as `DLUT-ABCD-EFGH-JK23`. Values expire after
seven days. The relay never receives API keys because they are removed before compression.

1. Create a Cloudflare KV namespace: `npx wrangler kv namespace create SYNC_CODES`.
2. Copy `wrangler.toml.example` to `wrangler.toml` and insert the returned namespace ID.
3. Run `npx wrangler deploy --config worker/wrangler.toml` from the repository root.
4. Set `VITE_SYNC_RELAY_URL` to the deployed Worker URL when building the web app.

## GitHub Actions deployment

The existing Pages deployment workflow can deploy the Worker before it builds the site. Configure
these repository **Actions secrets** once:

- `CLOUDFLARE_API_TOKEN`: a token with Workers Scripts edit and Workers KV Storage edit access.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
- `CLOUDFLARE_KV_NAMESPACE_ID`: the ID returned when the `SYNC_CODES` namespace is created.

After that, every push to `main` deploys the Worker and injects its deployment URL into the Pages
build automatically. `workflow_dispatch` does the same for a manual deployment. If the secrets are
absent, the Worker step is skipped and Pages still deploys; `VITE_SYNC_RELAY_URL` can instead be set
as an Actions variable when an externally deployed relay is used.

The original long offline synchronization code remains available when the relay is not wanted.
