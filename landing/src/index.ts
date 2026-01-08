/**
 * Mystery Gift TEE Landing Page - Cloudflare Worker
 * 
 * Serves the landing page and proxies API requests to the actual TEE Worker on Phala.
 * https://rng.mysterygift.fun
 */

import { renderLandingPage } from './landing';
import { renderStaticPage, TERMS_CONTENT, PRIVACY_CONTENT } from './html';

export interface Env {
  ASSETS: Fetcher;
  TEE_API_URL: string;
}

// Configuration
const VERSION = '0.0.1';
const APP_ID = '0fd4d6d4ad7d850389643319dd0e35ad14f578a5';
const PAYMENT_WALLET = '3Qudd5FG8foyFnbKxwfkDktnuushG7CDHBMSNk9owAjx';
const RPC_URL = 'https://api.mainnet-beta.solana.com';

// API endpoints that should be proxied to the TEE Worker
const API_ROUTES = [
  '/v1/randomness',
  '/v1/random/number',
  '/v1/random/pick',
  '/v1/random/shuffle',
  '/v1/random/winners',
  '/v1/random/uuid',
  '/v1/random/dice',
  '/v1/health',
  '/v1/stats',
  '/v1/attestation',
  '/v1/verify',
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check if this is an API route that should be proxied
    const isApiRoute = API_ROUTES.some(route => path.startsWith(route));
    
    if (isApiRoute) {
      // Proxy to the actual TEE Worker
      const teeUrl = new URL(path + url.search, env.TEE_API_URL || 'https://0fd4d6d4ad7d850389643319dd0e35ad14f578a5-3000.dstack-pha-prod5.phala.network');
      
      const proxyRequest = new Request(teeUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      try {
        const response = await fetch(proxyRequest);
        
        // Mirror worker's CORS policy - don't blindly allow all origins
        const newHeaders = new Headers(response.headers);
        const origin = request.headers.get('Origin');
        
        // Allowed origins (must match worker's CORS config)
        const allowedOrigins = [
          'https://mysterygift.fun',
          'https://rng.mysterygift.fun',
        ];
        
        // Check if origin is allowed
        if (origin && (allowedOrigins.includes(origin) || /\.mysterygift\.fun$/.test(origin))) {
          newHeaders.set('Access-Control-Allow-Origin', origin);
          newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, X-Payment, X-API-Key');
          newHeaders.set('Access-Control-Allow-Credentials', 'true');
        } else {
          // Don't set CORS headers for unauthorized origins
          newHeaders.delete('Access-Control-Allow-Origin');
          newHeaders.delete('Access-Control-Allow-Methods');
          newHeaders.delete('Access-Control-Allow-Headers');
          newHeaders.delete('Access-Control-Allow-Credentials');
        }
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'TEE Worker unavailable' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Payment, X-API-Key',
        },
      });
    }

    // Static assets (images, etc.)
    if (path.startsWith('/assets/')) {
      return env.ASSETS.fetch(request);
    }

    // Landing page
    if (path === '/' || path === '') {
      const composeHash = 'Loading...'; // Will be fetched client-side
      const nodeUrl = `https://${APP_ID}-8090.dstack-pha-prod5.phala.network/`;
      
      const html = renderLandingPage(
        VERSION,
        APP_ID,
        composeHash,
        nodeUrl,
        PAYMENT_WALLET,
        RPC_URL
      );

      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Terms page
    if (path === '/terms') {
      return new Response(renderStaticPage('Terms of Service', TERMS_CONTENT), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Privacy page
    if (path === '/privacy') {
      return new Response(renderStaticPage('Privacy Policy', PRIVACY_CONTENT), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Changelog page - simple version for now
    if (path === '/changelog') {
      const changelogContent = `
        <h1>Changelog</h1>
        <div class="subtitle">TEE Worker Release Notes</div>
        
        <h2>[0.0.5] - 2026-01-08</h2>
        <h3>Changed</h3>
        <ul>
          <li><strong>Branding</strong>: Updated Twitter references to X (mysterygift_fun).</li>
          <li><strong>Changelog</strong>: Displaying changelog in chronological order (oldest first).</li>
        </ul>
        
        <h2>[0.0.4] - 2026-01-08</h2>
        <h3>Changed</h3>
        <ul>
          <li><strong>UI Polish</strong>: Reduced console height to 34px and added sleek scrollbars.</li>
          <li><strong>Content</strong>: Simplified information panels to reduce scrolling.</li>
          <li><strong>Layout</strong>: Optimized padding and spacing.</li>
        </ul>
        
        <h2>[0.0.3] - 2026-01-08</h2>
        <h3>Fixed</h3>
        <ul>
          <li><strong>Changelog</strong>: Fixed changelog file missing from Docker image.</li>
          <li><strong>Cache</strong>: Forced image generation to ensure latest assets are served.</li>
        </ul>
        
        <h2>[0.0.2] - 2026-01-08</h2>
        <h3>Added</h3>
        <ul>
          <li><strong>Changelog Page</strong>: Added this changelog page with version history.</li>
          <li><strong>UI Update</strong>: Version tag is now clickable and links to the changelog.</li>
          <li><strong>Deployment</strong>: Redeployed with dynamic versioning and layout fixes.</li>
        </ul>
        
        <h2>[0.0.1] - 2026-01-08</h2>
        <h3>Added</h3>
        <ul>
          <li><strong>Fresh Start</strong>: Re-initialized versioning at v0.0.1.</li>
          <li><strong>Dynamic Versioning</strong>: UI and Health endpoint reflect package.json version.</li>
          <li><strong>Verification UI</strong>: Added timeout-safe attestation verification in the landing page.</li>
          <li><strong>Phala TEE Integration</strong>: Full support for Phala Cloud TEE deployment with remote attestation.</li>
        </ul>
      `;
      return new Response(renderStaticPage('Changelog', changelogContent), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 404 for everything else
    return new Response('Not Found', { status: 404 });
  },
};
