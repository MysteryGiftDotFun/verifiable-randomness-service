#!/bin/bash
# ===========================================
# Quick Deploy to Phala Cloud
# ===========================================
# This is a simplified interactive deployment script.
# Run: ./scripts/quick-deploy.sh

set -e

cd "$(dirname "$0")/.."

echo ""
echo "==================================================="
echo "  Mystery Gift TEE Randomness - Quick Deploy"
echo "==================================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
	echo "ERROR: Docker is not installed."
	exit 1
fi

if ! docker info &>/dev/null 2>&1; then
	echo "ERROR: Docker is not running. Please start Docker."
	exit 1
fi

# Check Docker Hub login and get username
DOCKER_USERNAME=${DOCKER_USERNAME:-""}

if [ -z "$DOCKER_USERNAME" ]; then
	# Method 1: Try docker system info
	DOCKER_USERNAME=$(docker system info 2>/dev/null | grep -i "username" | awk '{print $2}' | head -1)

	# Method 2: Try docker info
	if [ -z "$DOCKER_USERNAME" ]; then
		DOCKER_USERNAME=$(docker info 2>&1 | grep -i "username" | awk '{print $2}' | head -1)
	fi

	# Method 3: Check docker config.json for auth
	if [ -z "$DOCKER_USERNAME" ]; then
		if [ -f ~/.docker/config.json ]; then
			# Try to get username from auths section (it's base64 encoded as user:pass)
			AUTH=$(cat ~/.docker/config.json | python3 -c "import sys,json; d=json.load(sys.stdin); auths=d.get('auths',{}); hub=auths.get('https://index.docker.io/v1/',{}); print(hub.get('auth',''))" 2>/dev/null || echo "")
			if [ -n "$AUTH" ]; then
				DOCKER_USERNAME=$(echo "$AUTH" | base64 -d 2>/dev/null | cut -d: -f1 || echo "")
			fi
		fi
	fi
fi

# If we still don't have a username, we need to login
if [ -z "$DOCKER_USERNAME" ]; then
	echo ""
	echo "You need to log into Docker Hub first."
	echo "Running: docker login"
	echo ""
	docker login

	# Try again after login
	DOCKER_USERNAME=$(docker info 2>&1 | grep -i "username" | awk '{print $2}' | head -1)
fi

# Final check - ask user if still empty
if [ -z "$DOCKER_USERNAME" ]; then
	echo ""
	echo "Could not auto-detect Docker Hub username."
	while [ -z "$DOCKER_USERNAME" ]; do
		read -p "Enter your Docker Hub username: " DOCKER_USERNAME
		if [ -z "$DOCKER_USERNAME" ]; then
			echo "Username cannot be empty. Please try again."
		fi
	done
fi

echo "Docker Hub username: $DOCKER_USERNAME"

# Check Phala login
echo ""
echo "Checking Phala Cloud login..."
PHALA_STATUS=$(npx phala status 2>&1 || echo "not logged in")
if ! echo "$PHALA_STATUS" | grep -qi "authenticated\|logged in\|API key\|Welcome"; then
	echo ""
	echo "You need to log into Phala Cloud first."
	echo "Running: npx phala login"
	echo ""
	npx phala login
fi

echo ""
echo "==================================================="
echo "  Configuration"
echo "==================================================="
echo ""

# Load from .env file if it exists (non-interactive mode)
if [ -f .env ]; then
	echo "Found .env file, loading configuration..."
	set -a
	source .env
	set +a
	echo "Loaded configuration from .env ✓"
	echo ""
fi

# Load package.json version
PACKAGE_VERSION=$(cat package.json | grep '"version"' | cut -d'"' -f4)

# Set defaults
IMAGE_NAME="${DOCKER_USERNAME}/verifiable-randomness-service:v${PACKAGE_VERSION}"
CVM_NAME="verifiable-randomness-service"

echo "Docker Image: $IMAGE_NAME"
echo "CVM Name: $CVM_NAME"
echo ""

# Payment wallet - use existing or prompt
if [ -z "$PAYMENT_WALLET" ]; then
	read -p "Payment wallet (press Enter for default): " PAYMENT_WALLET
	PAYMENT_WALLET="${PAYMENT_WALLET:-3Qudd5FG8foyFnbKxwfkDktnuushG7CDHBMSNk9owAjx}"
fi
echo "Payment wallet: $PAYMENT_WALLET"

# Solana RPC Configuration - use existing or prompt
if [ -z "$HELIUS_RPC_URL" ] && [ -z "$ALCHEMY_RPC_URL" ]; then
	echo ""
	echo "Solana RPC Configuration (Free tiers recommended):"
	echo "  - Helius: https://helius.dev (1M credits/mo free)"
	echo "  - Alchemy: https://alchemy.com (30M CUs/mo free)"
	echo ""

	read -p "Helius RPC URL (recommended, press Enter to skip): " HELIUS_RPC_URL
	read -p "Alchemy RPC URL (fallback, press Enter to skip): " ALCHEMY_RPC_URL
fi

# Display RPC status
if [ -n "$HELIUS_RPC_URL" ]; then
	echo "Primary RPC: Helius ✓"
fi
if [ -n "$ALCHEMY_RPC_URL" ]; then
	echo "Fallback RPC: Alchemy ✓"
fi

# Legacy public RPC as last resort
SOLANA_RPC_URL="${SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com}"
if [ -z "$HELIUS_RPC_URL" ] && [ -z "$ALCHEMY_RPC_URL" ]; then
	echo ""
	echo "⚠️  WARNING: No RPC providers configured!"
	echo "   Using public RPC which may return 403 errors under load."
	echo "   Strongly recommend setting up Helius or Alchemy (free tier)."
	read -p "Continue anyway? (y/n): " CONTINUE
	if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
		echo "Deployment cancelled. Please configure RPC providers."
		exit 1
	fi
else
	echo "RPC fallback chain configured ✓"
fi

# API keys - use existing or generate fresh
if [ -z "$API_KEYS" ]; then
	echo ""
	echo "Generating new API keys..."
	API_KEY_PRIMARY=$(openssl rand -hex 32)
	API_KEY_SECONDARY=$(openssl rand -hex 32)
	API_KEY_TESTING=$(openssl rand -hex 32)
	API_KEYS="${API_KEY_PRIMARY},${API_KEY_SECONDARY},${API_KEY_TESTING}"
	echo "New API keys generated ✓"
	NEW_KEYS_GENERATED=true
else
	echo "Using existing API keys from .env ✓"
	NEW_KEYS_GENERATED=false
fi

# Whitelist - use existing or default
WHITELIST="${WHITELIST:-localhost,mysterygift.fun,api.mysterygift.fun}"

echo ""
echo "==================================================="
echo "  Building Docker Image"
echo "==================================================="
echo ""

# Build TypeScript
echo "Compiling TypeScript..."
npm run build

# Build Docker image for linux/amd64 (required for Phala TEE)
echo ""
echo "Building Docker image: $IMAGE_NAME (linux/amd64)"
echo "Note: Phala TEE runs on x86_64/amd64 architecture"

# Use buildx to build and push for amd64 platform
docker buildx create --name phala-builder --use 2>/dev/null || docker buildx use phala-builder 2>/dev/null || true
docker buildx build --platform linux/amd64 -t "$IMAGE_NAME" --push .

echo ""
echo "Image built and pushed to Docker Hub!"

echo ""
echo "==================================================="
echo "  Preparing Phala Deployment"
echo "==================================================="
echo ""

# Update the compose file with the correct image
if [[ "$OSTYPE" == "darwin"* ]]; then
	# macOS
	sed -i '' "s|image:.*|image: $IMAGE_NAME|g" phala-compose.yaml
else
	# Linux
	sed -i "s|image:.*|image: $IMAGE_NAME|g" phala-compose.yaml
fi

echo "Updated phala-compose.yaml with image: $IMAGE_NAME"

# Create .env file for phala deploy
cat >.env.deploy <<EOF
PAYMENT_WALLET=$PAYMENT_WALLET
WHITELIST=$WHITELIST
API_KEYS=$API_KEYS
HELIUS_RPC_URL=$HELIUS_RPC_URL
ALCHEMY_RPC_URL=$ALCHEMY_RPC_URL
SOLANA_RPC_URL=$SOLANA_RPC_URL
EOF

echo "Created .env.deploy with environment variables"

echo ""
echo "==================================================="
echo "  Deploying to Phala Cloud"
echo "==================================================="
echo ""

echo "Deploying CVM: $CVM_NAME"
echo ""

# Use the phala deploy command with all options
npx phala deploy \
	--name "$CVM_NAME" \
	--compose ./phala-compose.yaml \
	-e .env.deploy \
	--vcpu 2 \
	--memory 2G \
	--disk-size 20G

# Clean up temp file
rm -f .env.deploy

echo ""
echo "==================================================="
echo "  Deployment Complete!"
echo "==================================================="
echo ""
echo "Getting your CVM details..."
echo ""
npx phala cvms list 2>/dev/null || echo "(run 'npx phala cvms list' to see your CVMs)"

echo ""
echo "Next steps:"
echo "1. Run 'npx phala cvms list' to get your App ID"
echo "2. Your endpoint will be: https://[app-id]-3000.dstack-pha-prod5.phala.network"
echo "3. Test your endpoint: curl https://[app-id]-3000.dstack-pha-prod5.phala.network/v1/health"
echo ""
echo "4. Update apps/server/.env with:"
echo "   RANDOMNESS_PROVIDER=phala"
echo "   TEE_RANDOMNESS_ENDPOINT=https://[app-id]-3000.dstack-pha-prod5.phala.network"

if [ "$NEW_KEYS_GENERATED" = true ]; then
	echo "   TEE_RANDOMNESS_API_KEY=${API_KEY_PRIMARY}"
	echo ""
	echo "Your API Keys (keep these secret!):"
	echo "  Primary:   ${API_KEY_PRIMARY}"
	echo "  Secondary: ${API_KEY_SECONDARY}"
	echo "  Testing:   ${API_KEY_TESTING}"
	echo ""
	echo "IMPORTANT: These keys were just generated. Save them now!"
	echo "           They will not be shown again."
else
	echo "   TEE_RANDOMNESS_API_KEY=<use your existing key from .env>"
	echo ""
	echo "Using existing API keys from your .env file."
fi
echo ""
