# Phala CVM Custom Domain DNS Configuration

## The Correct Approach: Use dstack-ingress

**Important:** The v14 compose files (`phala-compose.prod-v14.yaml` and `phala-compose.dev-v14.yaml`) include `dstack-ingress` which **automatically handles DNS and SSL certificate setup**. Do NOT manually create CNAME/TXT records - let dstack-ingress do it.

## How dstack-ingress Works

When you deploy with v14 compose files:

1. dstack-ingress container starts up
2. It uses the Cloudflare API token to create DNS records automatically
3. It requests SSL certificates from Let's Encrypt
4. It sets up the reverse proxy with SSL termination

## Required Environment Variables

In your `.env` file (or Phala dashboard secrets):

```bash
CLOUDFLARE_API_TOKEN=your_cloudflare_dns_token
CERTBOT_EMAIL=hello@mysterygift.fun
```

The `GATEWAY_DOMAIN` is automatically provided by Phala Cloud as `dstack-pha-prod5.phala.network`.

## Deployment Steps

### 1. Build and push the Docker image

```bash
# On Hetzner build server
cd ~/mystery-gift-deploy/services/verifiable-randomness-service/worker
sudo docker build -t phantasybot/verifiable-randomness-service:v0.1.0-BETA-v14 .
sudo docker push phantasybot/verifiable-randomness-service:v0.1.0-BETA-v14
```

### 2. Deploy to Phala CVM

```bash
# Deploy prod (use app_id, not cvm_id)
cd ~/mystery-gift-deploy
npx phala deploy --cvm-id de014c8e6c862d1d0799ec035e85f93912769f12 \
  -c services/verifiable-randomness-service/worker/phala-compose.prod-v14.yaml \
  -e services/verifiable-randomness-service/worker/.env

# Deploy dev
npx phala deploy --cvm-id 68bfb1758fa20d75cac0af456e9868e4f1cc9e7c \
  -c services/verifiable-randomness-service/worker/phala-compose.dev-v14.yaml \
  -e services/verifiable-randomness-service/worker/.env
```

### 3. Wait for DNS propagation

After deployment (1-2 minutes), the custom domains should work automatically:

- https://vrf.mysterygift.fun
- https://vrf-dev.mysterygift.fun

## Current CVM Configuration

| Environment | App ID                                   | Custom Domain           | Status     |
| ----------- | ---------------------------------------- | ----------------------- | ---------- |
| Prod        | de014c8e6c862d1d0799ec035e85f93912769f12 | vrf.mysterygift.fun     | ✅ Working |
| Dev         | 68bfb1758fa20d75cac0af456e9868e4f1cc9e7c | vrf-dev.mysterygift.fun | ✅ Working |

## Troubleshooting

### Domain shows SSL 525 error

- Wait 2-5 minutes for dstack-ingress to configure DNS
- Check CVM logs: `npx phala cvms logs <app_id>`
- Verify env vars are set correctly in Phala dashboard

### Domain shows 302 redirect to Cloudflare Access

- Check if Cloudflare Zero Trust Access policy is blocking the domain
- Remove domain from Access policies in Cloudflare Dashboard

### Everything works but returns wrong environment

- Make sure you're using the correct compose file (prod vs dev)
- The dev compose sets `APP_ENVIRONMENT=development`

## What NOT to Do

❌ Do NOT manually create CNAME records pointing to `_.dstack-pha-prod5.phala.network`  
❌ Do NOT manually create TXT records for `_dstack-app-address`  
❌ Do NOT try to use "combined" compose files with multiple ingresses

The dstack-ingress container handles all of this automatically.

## Legacy Information

The previous approach (manual CNAME/TXT records) did NOT work - it resulted in SSL 525 errors because:

1. Cloudflare couldn't validate the origin SSL certificate properly
2. The wildcard CNAME format requires specific TXT records that are difficult to get right
3. dstack-ingress provides a much simpler and more reliable solution

Only use v14+ compose files with dstack-ingress for custom domain deployment.
