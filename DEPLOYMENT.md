# Verifiable Randomness Service Deployment Guide

## Deployment Status (Active)

- **CVM Name**: `verifiable-randomness-service`
- **App ID**: `app_f040f9c288bbced3a380069c39795af27b8630de` (Deployed Jan 12 2026)
- **Endpoint**: `https://app_f040f9c288bbced3a380069c39795af27b8630de-3000.dstack-pha-prod5.phala.network`
- **Version**: `0.0.1-BETA`

## Quick Start

Run the deployment script:

```bash
cd worker
./scripts/quick-deploy.sh
```

## Manual Deployment

```bash
# Login
npx phala login

# Deploy
npx phala deploy --name verifiable-randomness-service --compose worker/phala-compose.yaml --vcpu 2 --memory 2G
```

## API Keys

Generated on first deploy. Check your `.env` or deployment logs.
