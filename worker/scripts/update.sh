#!/bin/bash
# ===========================================
# Update TEE Worker on Phala Cloud
# ===========================================
# Rebuilds and redeploys to existing CVM.
# Run: ./scripts/update.sh
#
# This script:
# 1. Rebuilds the Docker image
# 2. Pushes to Docker Hub
# 3. Updates the existing CVM
# ===========================================

set -e

cd "$(dirname "$0")/.."

# Configuration
APP_NAME="mysterygift-tee-randomness"
IMAGE_NAME="phantasybot/tee-randomness:v0.0.5"

echo ""
echo "==================================================="
echo "  Mystery Gift TEE Randomness - Update Deployment"
echo "==================================================="
echo ""

# Auto-detect CVM ID
echo "Finding CVM '$APP_NAME'..."
CVM_INFO=$(npx phala cvms list --json 2>/dev/null | python3 scripts/get_cvm_info.py "$APP_NAME")

if [ -z "$CVM_INFO" ]; then
	echo "ERROR: Could not find running CVM named '$APP_NAME'"
	echo "Run './scripts/quick-deploy.sh' to create one first."
	exit 1
fi

CVM_ID=$(echo "$CVM_INFO" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
APP_ID=$(echo "$CVM_INFO" | python3 -c "import sys, json; print(json.load(sys.stdin)['app_id'])")
ENDPOINT="https://${APP_ID}-3000.dstack-pha-prod5.phala.network"

echo "Found CVM:"
echo "- UUID: $CVM_ID"
echo "- App ID: $APP_ID"
echo "- Endpoint: $ENDPOINT"
echo "- Image: $IMAGE_NAME"
echo ""
echo "==================================================="
echo "  Mystery Gift TEE Randomness - Update Deployment"
echo "==================================================="
echo ""
echo "CVM ID: $CVM_ID"
echo "App ID: $APP_ID"
echo "Endpoint: $ENDPOINT"
echo "Image: $IMAGE_NAME"
echo ""

# Check prerequisites
if ! command -v docker &>/dev/null; then
	echo "ERROR: Docker is not installed."
	exit 1
fi

if ! docker info &>/dev/null 2>&1; then
	echo "ERROR: Docker is not running. Please start Docker."
	exit 1
fi

# Build TypeScript
echo "Step 1: Compiling TypeScript..."
npm run build
echo ""

# Copy x402 shared package for Docker build
echo "Step 1b: Copying x402 shared package..."
rm -rf .x402-pkg
mkdir -p .x402-pkg/dist
cp ../../../../packages/x402/package.json .x402-pkg/
cp -r ../../../../packages/x402/dist/* .x402-pkg/dist/

# Build and push Docker image
echo "Step 2: Building Docker image (linux/amd64)..."
docker buildx create --name phala-builder --use 2>/dev/null || docker buildx use phala-builder 2>/dev/null || true
docker buildx build --platform linux/amd64 -t "$IMAGE_NAME" --push .

# Clean up x402 package copy
rm -rf .x402-pkg
echo ""
echo "Image pushed to Docker Hub!"
echo ""

# Update compose file with image
if [[ "$OSTYPE" == "darwin"* ]]; then
	sed -i '' "s|image:.*|image: $IMAGE_NAME|g" phala-compose.yaml
else
	sed -i "s|image:.*|image: $IMAGE_NAME|g" phala-compose.yaml
fi

# Update CVM
echo "Step 3: Updating CVM on Phala Cloud..."
echo ""

npx phala deploy \
	--cvm-id "$CVM_ID" \
	--compose ./phala-compose.yaml \
	--wait

echo ""
echo "==================================================="
echo "  Update Complete!"
echo "==================================================="
echo ""
echo "Endpoint: $ENDPOINT"
echo ""
echo "Testing health endpoint..."
sleep 5
curl -s "$ENDPOINT/v1/health" | python3 -m json.tool 2>/dev/null || curl -s "$ENDPOINT/v1/health"
echo ""
echo ""
echo "Done! Your TEE worker has been updated."
echo ""
