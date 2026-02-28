/**
 * Landing page for the Verifiable Randomness Service.
 * Extracted from index.ts for maintainability.
 *
 * Payment flow uses facilitator-based x402 (chain-agnostic).
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findLandingClientJS(): string {
  const possiblePaths = [
    path.join(__dirname, "static", "landing-client.js"),
    path.join(__dirname, "..", "static", "landing-client.js"),
    path.join(process.cwd(), "static", "landing-client.js"),
    path.join(process.cwd(), "dist", "static", "landing-client.js"),
    path.join(process.cwd(), "dist", "landing-client.js"),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf-8");
      }
    } catch {
      continue;
    }
  }
  throw new Error(
    `landing-client.js not found. Searched: ${possiblePaths.join(", ")}`,
  );
}

const LANDING_CLIENT_JS = findLandingClientJS();

export interface LandingConfig {
  version: string;
  teeType: string;
  paymentWallet: string;
  paymentWalletBase?: string;
  heliusRpcUrl?: string;
  baseRpcUrl?: string;
  facilitatorUrl: string;
  supportedNetworks: string[];
  arweaveEnabled: boolean;
  appId: string;
  composeHash: string;
  nodeUrl: string;
  environment: string;
}

export function renderLandingPage(config: LandingConfig): string {
  const {
    version,
    appId,
    composeHash,
    nodeUrl,
    paymentWallet,
    paymentWalletBase,
    heliusRpcUrl,
    baseRpcUrl,
    facilitatorUrl,
    supportedNetworks,
    arweaveEnabled,
    environment,
  } = config;

  const envBadgeClass =
    environment === "production" ? "production" : "development";
  const envBadgeText = environment === "production" ? "PROD" : "DEV";
  const networksJson = JSON.stringify(supportedNetworks);

  const hasBase = supportedNetworks.includes("base");
  const solanaWallet = paymentWallet;
  const baseWallet = paymentWalletBase || paymentWallet;
  const heliusRpc = heliusRpcUrl || "";
  const baseRpc = baseRpcUrl || "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>MYSTERY GIFT | TEE NODE v${version}</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sometype+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">

  <script src="https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js"></script>
  <script src="https://unpkg.com/@solana/web3.js@1.95.8/lib/index.iife.min.js"></script>
  <script src="https://unpkg.com/ethers@5.7.2/dist/ethers.umd.min.js"></script>

  <style>
    :root {
      --bg: #09090b;
      --panel-bg: rgba(20, 20, 23, 0.75);
      --panel-border: rgba(255, 255, 255, 0.08);
      --text-main: #FAFAFA;
      --text-muted: #A1A1AA;
      --accent: #FF4D00;
      --accent-glow: rgba(255, 77, 0, 0.2);
      --success: #ffffff;
      --font: 'Sometype Mono', monospace;

      --clip-cyber: polygon(
        10px 0, 100% 0,
        100% calc(100% - 10px), calc(100% - 10px) 100%,
        0 100%, 0 10px
      );
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font);
      background-color: var(--bg);
      color: var(--text-main);
      height: 100vh;
      width: 100vw;
      overflow: hidden;
    }

    /* Layout */
    .layout {
      display: grid;
      grid-template-columns: 1fr 480px;
      height: 100vh;
      width: 100%;
      overflow: hidden;
    }

    /* Left Hero */
    .hero {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      overflow: hidden;
      background-color: var(--bg);
      background-image: url("data:image/svg+xml,%3Csvg width='400' height='400' viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cstyle%3Etext { font-family: monospace; fill: %23ffffff; opacity: 0.02; font-weight: bold; user-select: none; }%3C/style%3E%3Ctext x='50' y='80' font-size='120' transform='rotate(15 50,80)'%3E?%3C/text%3E%3Ctext x='300' y='150' font-size='80' transform='rotate(-20 300,150)'%3E?%3C/text%3E%3Ctext x='150' y='300' font-size='160' transform='rotate(10 150,300)'%3E?%3C/text%3E%3Ctext x='350' y='350' font-size='60' transform='rotate(30 350,350)'%3E?%3C/text%3E%3Ctext x='100' y='200' font-size='40' opacity='0.04' transform='rotate(-45 100,200)'%3E?%3C/text%3E%3Ctext x='250' y='50' font-size='90' transform='rotate(5 250,50)'%3E?%3C/text%3E%3Ctext x='20' y='380' font-size='70' transform='rotate(-15 20,380)'%3E?%3C/text%3E%3C/svg%3E");
      transition: background-position 0.1s linear;
    }

    .wallet-container-hero {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
      z-index: 100;
    }

    .miss-container {
      position: absolute;
      bottom: -80px;
      left: 0;
      right: 0;
      z-index: 10;
      height: 90vh;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      transition: transform 0.1s linear;
    }

    .miss-img {
      height: 100%;
      max-height: 900px;
      object-fit: contain;
      object-position: bottom center;
      filter: drop-shadow(0 0 60px rgba(0,0,0,0.6));
      transform: scaleX(-1);
    }

    .hero-info {
      position: absolute;
      bottom: 3rem;
      left: 3.5rem;
      z-index: 20;
      max-width: 600px;
    }

    h1 {
      font-size: 3.5rem;
      font-weight: 700;
      line-height: 0.9;
      letter-spacing: -0.04em;
      text-transform: uppercase;
      color: var(--text-main);
      margin-bottom: 0.8rem;
      text-shadow: 0 10px 30px rgba(0,0,0,0.8);
    }

    .subtitle {
      font-size: 1rem;
      color: var(--accent);
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .subtitle::before {
      content: '';
      display: block;
      width: 40px;
      height: 2px;
      background: var(--accent);
    }

    .version-tag-container {
      position: absolute;
      bottom: 2rem;
      right: 2rem;
      z-index: 20;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.25rem;
    }

    .version-tag {
      font-size: 0.75rem;
      color: var(--text-muted);
      opacity: 0.5;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      text-decoration: none;
    }

    .version-tag:hover {
      opacity: 0.7;
    }

    .env-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 1;
    }
    .env-badge.production { background: rgba(52, 211, 153, 0.2); color: #34D399; }
    .env-badge.development { background: rgba(255, 149, 0, 0.2); color: #FF9500; }

    .panel {
      background: var(--panel-bg);
      border-left: 1px solid var(--panel-border);
      backdrop-filter: blur(30px);
      -webkit-backdrop-filter: blur(30px);
      display: flex;
      flex-direction: column;
      position: relative;
      z-index: 50;
      height: 100vh;
    }

    .wallet-btn {
      background: rgba(0,0,0,0.4);
      color: var(--text-main);
      border: 1px solid var(--panel-border);
      padding: 0.7rem 1.2rem;
      border-radius: 8px;
      font-family: var(--font);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      transition: all 0.2s;
    }
    .wallet-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); }
    .wallet-btn.connected { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.3); color: #ffffff; }

    .tabs {
      display: flex;
      gap: 0.2rem;
      padding: 0.5rem 2rem 0;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--panel-border);
      flex-shrink: 0;
    }

    .tab-btn {
      padding: 0.8rem 1.2rem;
      background: transparent;
      color: var(--text-muted);
      border: none;
      font-family: var(--font);
      font-weight: 500;
      font-size: 0.85rem;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }
    .tab-btn.active { color: var(--text-main); border-bottom-color: var(--accent); }
    .tab-btn:hover:not(.active) { color: var(--text-main); }

    .content-wrapper {
      flex: 1;
      overflow-y: auto;
      padding: 0 1.5rem 1.5rem;
      display: flex;
      flex-direction: column;
    }

    .content-wrapper::-webkit-scrollbar { width: 4px; }
    .content-wrapper::-webkit-scrollbar-track { background: transparent; }
    .content-wrapper::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
    .content-wrapper::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }

    .tab-view { display: none; width: 100%; }
    .tab-view.active { display: block; animation: fadeIn 0.3s ease; }

    .card {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 1.2rem;
      margin-bottom: 1.5rem;
    }

    .card-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 0.8rem;
      display: block;
      font-weight: 600;
      letter-spacing: 0.05em;
    }

    .sleek-input {
      width: 100%;
      padding: 0.9rem;
      background: rgba(0,0,0,0.4);
      color: var(--text-main);
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      font-family: var(--font);
      font-size: 0.9rem;
      margin-bottom: 1rem;
      outline: none;
      transition: all 0.2s;
    }

    .sleek-select { display: none; }

    .custom-dropdown {
      position: relative;
      width: 100%;
      margin-bottom: 1rem;
      font-family: var(--font);
    }
    .dropdown-selected {
      width: 100%;
      padding: 0.9rem 2.5rem 0.9rem 0.9rem;
      background-color: rgba(0,0,0,0.5);
      color: var(--text-main);
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      font-family: var(--font);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }
    .dropdown-selected::after {
      content: '';
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%23FF4D00' d='M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z'/%3E%3C/svg%3E");
      background-size: contain;
      transition: transform 0.2s ease;
    }
    .custom-dropdown.open .dropdown-selected::after { transform: translateY(-50%) rotate(180deg); }
    .dropdown-selected:hover { border-color: rgba(255, 255, 255, 0.2); background-color: rgba(0,0,0,0.6); }
    .custom-dropdown.open .dropdown-selected { border-color: var(--accent); background-color: rgba(0,0,0,0.7); box-shadow: 0 0 0 2px var(--accent-glow); border-radius: 8px 8px 0 0; }
    .dropdown-options {
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background-color: #141417;
      border: 1px solid var(--accent);
      border-top: none;
      border-radius: 0 0 8px 8px;
      overflow: hidden;
      z-index: 100;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .custom-dropdown.open .dropdown-options { display: block; animation: dropdownFadeIn 0.2s ease; }
    .dropdown-option {
      padding: 0.9rem;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 0.9rem;
    }
    .dropdown-option:last-child { border-bottom: none; }
    .dropdown-option:hover { background-color: rgba(255, 77, 0, 0.15); color: var(--text-main); padding-left: 1.2rem; }
    .dropdown-option.selected { background-color: var(--accent); color: white; }
    @keyframes dropdownFadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }

    .sleek-input:focus { border-color: var(--accent); background-color: rgba(0,0,0,0.6); }

    .cyber-btn {
      width: 100%;
      padding: 1.4rem;
      background: var(--text-main);
      color: #000;
      border: none;
      font-family: var(--font);
      font-weight: 700;
      text-transform: uppercase;
      cursor: pointer;
      clip-path: var(--clip-cyber);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      font-size: 1rem;
      margin-top: 1rem;
      position: relative;
      overflow: hidden;
    }
    .cyber-btn:hover { background: var(--accent); color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.2); transform: translateY(-1px); }
    .cyber-btn:disabled { opacity: 0.5; cursor: not-allowed; background: var(--text-muted); transform: none; }
    .cyber-btn::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); transition: 0.5s; }
    .cyber-btn:hover::before { left: 100%; }

    .std-btn {
      width: 100%;
      padding: 0.9rem;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      color: var(--text-main);
      font-family: var(--font);
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .std-btn:hover { background: rgba(255,255,255,0.1); border-color: var(--text-main); }

    .toggle-group {
      display: flex;
      background: rgba(0,0,0,0.4);
      padding: 4px;
      border-radius: 8px;
      margin-bottom: 1.5rem;
    }
    .toggle-opt {
      flex: 1;
      padding: 0.6rem;
      border: none;
      background: transparent;
      color: var(--text-muted);
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: var(--font);
    }
    .toggle-opt.active { background: rgba(255,255,255,0.1); color: var(--text-main); box-shadow: 0 1px 3px rgba(0,0,0,0.2); }

    .console-bar {
      background: #050505;
      border-top: 1px solid var(--panel-border);
      color: var(--text-muted);
      font-family: monospace;
      font-size: 0.75rem;
      cursor: pointer;
      transition: height 0.3s ease;
      height: 34px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .console-header { padding: 0.6rem 2rem; display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.02); }
    .console-indicator { width: 6px; height: 6px; border-radius: 50%; background: #ffffff; }
    .console-content { padding: 0 2rem 1rem; overflow-y: auto; height: 160px; }
    .console-bar.expanded { height: 200px; }

    .legal-footer {
      padding: 1rem 2rem;
      font-size: 0.7rem;
      color: var(--text-muted);
      text-align: center;
      border-top: 1px solid var(--panel-border);
      background: var(--panel-bg);
      flex-shrink: 0;
    }

    .log-line { margin-bottom: 4px; }
    .log-success { color: #ffffff; }
    .log-error { color: #F87171; }
    .log-info { color: #A5B4FC; }

    .hash-display {
      font-family: monospace;
      font-size: 0.75rem;
      color: var(--text-muted);
      word-break: break-all;
      background: rgba(0,0,0,0.4);
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid var(--panel-border);
      width: 100%;
      box-sizing: border-box;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .layout { grid-template-columns: 1fr; grid-template-rows: auto 1fr; height: auto; overflow-y: auto; }
      .hero { height: 50vh; min-height: 400px; border-bottom: 1px solid var(--panel-border); justify-content: flex-end; }
      .miss-img { max-height: 450px; }
      .hero-info { top: auto; bottom: 2rem; left: 1.5rem; max-width: 80%; }
      .wallet-container-hero { top: 1.5rem; right: 1.5rem; }
      h1 { font-size: 2rem; }
      .panel { min-height: 60vh; height: auto; overflow: visible; }
      .content-wrapper { padding: 0 1.5rem 2rem; }
      .console-bar { display: none; }
    }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

    .receipt-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: none; justify-content: center; align-items: center; z-index: 1000; padding: 1rem; }
    .receipt-overlay.visible { display: flex; animation: fadeIn 0.3s ease; }
    .receipt-modal { background: var(--panel-bg); border: 1px solid var(--panel-border); border-radius: 16px; max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5); }
    .receipt-header { padding: 1.5rem 2rem; background: rgba(0, 0, 0, 0.4); border-bottom: 1px solid var(--panel-border); display: flex; align-items: center; justify-content: space-between; }
    .receipt-header h3 { display: flex; align-items: center; gap: 0.6rem; font-size: 1rem; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; }
    .receipt-close { background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.5rem; line-height: 1; padding: 0.25rem; transition: color 0.2s; }
    .receipt-close:hover { color: var(--text-main); }
    .receipt-section { padding: 1.25rem 2rem; border-bottom: 1px solid var(--panel-border); }
    .receipt-section:last-child { border-bottom: none; }
    .receipt-section-title { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.8rem; }
    .receipt-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; gap: 1rem; }
    .receipt-row:last-child { margin-bottom: 0; }
    .receipt-label { font-size: 0.8rem; color: var(--text-muted); flex-shrink: 0; }
    .receipt-value { font-size: 0.8rem; color: var(--text-main); text-align: right; word-break: break-all; font-family: monospace; }
    .receipt-value.highlight { color: var(--accent); font-weight: 600; }
    .receipt-value.success { color: #ffffff; }
    .receipt-link { color: var(--accent); text-decoration: none; display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; }
    .receipt-link:hover { text-decoration: underline; }
    .receipt-result { font-size: 1.5rem; font-weight: 700; color: var(--accent); text-align: center; padding: 1rem 0; font-family: var(--font); }
    .receipt-seed-input { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--panel-border); border-radius: 8px; padding: 0.75rem 3rem 0.75rem 1rem; font-family: monospace; font-size: 0.75rem; color: var(--accent); text-align: center; cursor: text; }
    .receipt-copy-btn { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); background: var(--accent); border: none; border-radius: 6px; padding: 0.5rem; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center; }
    .receipt-copy-btn:hover { background: #ff6a33; }
    .receipt-actions { display: flex; gap: 0.75rem; padding: 1.5rem 2rem; background: rgba(0, 0, 0, 0.2); }
    .receipt-btn { flex: 1; padding: 0.75rem 1rem; border-radius: 8px; font-family: var(--font); font-size: 0.75rem; font-weight: 500; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.4rem; }
    .receipt-btn-primary { background: var(--accent); color: white; border: none; }
    .receipt-btn-primary:hover { background: #ff6a33; }
    .receipt-btn-secondary { background: transparent; color: var(--text-main); border: 1px solid var(--panel-border); }
    .receipt-btn-secondary:hover { background: rgba(255, 255, 255, 0.05); }
    .toast { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%) translateY(100px); background: #ffffff; color: #000; padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600; z-index: 2000; opacity: 0; transition: all 0.3s ease; }
    .toast.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
    .verification-badge { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.8rem; background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 6px; font-size: 0.75rem; color: #ffffff; font-weight: 500; }
  </style>
</head>
<body>
  <div class="layout">
    <!-- Hero -->
    <div class="hero" id="hero-section">

      <div class="wallet-container-hero">
        <button class="wallet-btn" id="connect-btn" onclick="toggleWallet()">
          <iconify-icon icon="ph:wallet-fill"></iconify-icon> CONNECT WALLET
        </button>
      </div>

      <div class="hero-info">
        <h1>VERIFIABLE<br>RANDOMNESS<br>SERVICE</h1>
        <div class="subtitle">POWERED BY MYSTERY GIFT</div>
      </div>

      <div class="miss-container" id="miss-container">
        <img src="/assets/miss.png" class="miss-img" alt="Miss">
      </div>

      <div class="version-tag-container">
        <a href="/changelog" class="version-tag" style="cursor:pointer;">
          v${version} &bull; <span id="version-hash">${composeHash.slice(0, 8)}</span>
          <span class="env-badge ${envBadgeClass}">${envBadgeText}</span>
        </a>
        <div style="font-size:0.65rem; color:var(--text-muted); opacity:0.6;">
          EXPERIMENTAL SOFTWARE — Use at your own risk
        </div>
      </div>
    </div>

    <!-- Panel -->
    <div class="panel">
      <!-- Tabs -->
      <div class="tabs">
        <button class="tab-btn active" onclick="nav('run')" id="t-run">EXECUTE</button>
        <button class="tab-btn" onclick="nav('verify')" id="t-verify">AUDIT</button>
        <button class="tab-btn" onclick="nav('guide')" id="t-guide">GUIDE</button>
        <button class="tab-btn" onclick="nav('api')" id="t-api">API</button>
        <button class="tab-btn" onclick="nav('info')" id="t-info">INFO</button>
      </div>

      <!-- Content -->
      <div class="content-wrapper">

        <!-- RUN -->
        <div id="v-run" class="tab-view active">
          <div class="card">
            <span class="card-label">Operation Type</span>
            <div class="custom-dropdown" id="op-dropdown">
              <div class="dropdown-selected" onclick="toggleDropdown()">Raw Randomness (Seed)</div>
              <div class="dropdown-options">
                <div class="dropdown-option selected" data-value="randomness">Raw Randomness (Seed)</div>
                <div class="dropdown-option" data-value="number">Random Number</div>
                <div class="dropdown-option" data-value="dice">Roll Dice</div>
                <div class="dropdown-option" data-value="pick">Pick Item</div>
                <div class="dropdown-option" data-value="shuffle">Shuffle List</div>
                <div class="dropdown-option" data-value="uuid">Generate UUID</div>
                <div class="dropdown-option" data-value="winners">Pick Winners</div>
              </div>
            </div>
            <input type="hidden" id="op-type" value="randomness">

            <div id="inputs-number" style="display:none">
              <input type="number" class="sleek-input" id="in-min" placeholder="Min Value (Default: 1)">
              <input type="number" class="sleek-input" id="in-max" placeholder="Max Value (Default: 100)">
            </div>

            <div id="inputs-dice" style="display:none">
              <input type="text" class="sleek-input" id="in-dice" placeholder="Format: 2d6, 1d20">
            </div>

            <div id="inputs-pick" style="display:none">
              <input type="text" class="sleek-input" id="in-items" placeholder="Items (Comma separated)">
            </div>

            <div id="inputs-shuffle" style="display:none">
              <input type="text" class="sleek-input" id="in-shuffle-items" placeholder="Items to Shuffle (Comma separated)">
            </div>

            <div id="inputs-winners" style="display:none">
              <input type="text" class="sleek-input" id="in-winners-items" placeholder="Candidates (Comma separated)">
              <input type="number" class="sleek-input" id="in-count" placeholder="Number of Winners (Default: 1)">
            </div>
          </div>

          <div class="card" style="border-color: var(--accent-glow);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="card-label" style="color:var(--accent); margin-bottom:0;">Pricing</span>
              <div style="font-size:1.5rem; font-weight:700; color:var(--text-main);">$0.01 <span style="font-size:0.75rem; color:var(--text-muted);">/ req</span></div>
            </div>
            <div style="margin-top:0.5rem; font-size:0.7rem; color:var(--text-muted);">
              Pay via x402 (SOLANA / BASE)
            </div>
          </div>

          <div class="card">
            <span class="card-label">Configuration</span>

            <div style="margin-bottom:0.5rem; font-size:0.75rem; color:var(--text-muted);">Network</div>
            <div class="toggle-group" id="network-toggle">
              ${supportedNetworks.map((n, i) => `<button class="toggle-opt${i === 0 ? " active" : ""}" id="net-${n}" onclick="setNetwork('${n}')"><iconify-icon icon="${n === "solana" ? "token:sol" : "token:eth"}" style="vertical-align:middle; margin-right:4px;"></iconify-icon>${n.toUpperCase()}</button>`).join("\n              ")}
            </div>
          </div>

          <div class="card">
            <span class="card-label">Privacy Options</span>
            <input type="text" class="sleek-input" id="in-passphrase" 
                   placeholder="Optional: Passphrase to encrypt proof (leave empty for public)">
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.25rem;">
              If provided, the Arweave proof will be encrypted with AES-256-GCM. Share the passphrase with authorized parties.
            </div>
          </div>

          <!-- CYBERPUNK BUTTON -->
          <button class="cyber-btn" id="gen-btn" onclick="generate()" disabled>
            <iconify-icon icon="ph:lightning-fill"></iconify-icon> INITIALIZE RANDOMNESS
          </button>
        </div>

        <!-- VERIFY -->
        <div id="v-verify" class="tab-view">
          <div class="card">
            <span class="card-label">What Can You Verify?</span>
            <p style="font-size:0.8rem; color:var(--text-muted); line-height:1.6; margin-bottom:0;">
              This service runs inside an <strong style="color:var(--text-main);">Intel TDX enclave</strong> — a hardware-isolated environment that even we cannot tamper with. You can independently verify:
            </p>
            <ul style="font-size:0.8rem; color:var(--text-muted); margin:0.5rem 0 0 1rem; padding:0;">
              <li>The hardware attestation quote is signed by Intel</li>
              <li>The compose hash matches our open source code</li>
              <li>The enclave is running untampered code</li>
            </ul>
          </div>

          <div class="card">
            <span class="card-label">System Identity</span>
            <div class="hash-display" style="margin-bottom: 1rem; font-size:0.7rem;">APP_ID: ${appId}</div>

            <span class="card-label">Compose Hash (Code Fingerprint)</span>
            <div class="hash-display" id="compose-hash" style="font-size:0.7rem;">${composeHash}</div>
            <p style="font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">
              Compare this hash with <a href="https://github.com/mysterygiftdotfun/verifiable-randomness-service" target="_blank" style="color:var(--accent);">our source code</a> to verify we're running the exact code you expect.
            </p>
          </div>

          <div class="card" style="margin-top:1rem; border-color:var(--accent-glow);">
            <span class="card-label" style="color:var(--accent);">Independent Verification</span>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.8rem;">
              Don't trust us — verify the attestation yourself using third-party tools:
            </p>

            <a href="https://proof.t16z.com/" target="_blank" style="text-decoration:none; display:block; margin-bottom:0.5rem;">
              <button class="std-btn" style="width:100%; background:rgba(255, 255, 255, 0.05); border-color:rgba(255, 255, 255, 0.2); color:#ffffff;">
                <iconify-icon icon="ph:seal-check-fill" style="vertical-align:text-bottom; margin-right:4px;"></iconify-icon>
                TEE Attestation Explorer
              </button>
            </a>

            <a href="https://trust.phala.com/" target="_blank" style="text-decoration:none; display:block; margin-bottom:0.5rem;">
              <button class="std-btn" style="width:100%;">
                <iconify-icon icon="ph:shield-check-fill" style="vertical-align:text-bottom; margin-right:4px;"></iconify-icon>
                Phala Trust Center
              </button>
            </a>

            <button class="std-btn" style="width:100%;" onclick="downloadAttestation()">
              <iconify-icon icon="ph:download-simple-bold" style="vertical-align:text-bottom; margin-right:4px;"></iconify-icon>
              Download Attestation Quote
            </button>
          </div>

          <div class="card" style="margin-top:1rem; border-color:rgba(255, 77, 0, 0.3);">
            <span class="card-label" style="color:var(--accent);">
              <iconify-icon icon="ph:archive-box-fill" style="vertical-align:text-bottom; margin-right:0.3rem;"></iconify-icon>
              Arweave Verification
            </span>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.8rem; line-height:1.5;">
              Each response includes a <code style="color:var(--accent);">commitment_hash</code> stored on Arweave. Verify by computing:
            </p>
            <div style="background:rgba(0,0,0,0.4); border:1px solid var(--panel-border); border-radius:8px; padding:0.75rem;">
              <code style="font-size:0.75rem; color:var(--text-main);">SHA256(seed + request_hash) == commitment_hash</code>
            </div>
          </div>
        </div>

        <!-- INFO -->
        <div id="v-info" class="tab-view">
          <div class="card">
            <span class="card-label">Overview</span>
            <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">
              Intel TDX powered verifiable randomness. Secure, hardware-enforced generation with remote attestation proofs.
            </p>
          </div>

          <div class="card" style="border-color: var(--accent-glow);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="card-label" style="color:var(--accent); margin-bottom:0;">Pricing</span>
              <div style="font-size:2rem; font-weight:700; color:var(--text-main);">$0.01 <span style="font-size:0.9rem; color:var(--text-muted);">/ req</span></div>
            </div>
            <div style="margin-top:0.8rem; font-size:0.8rem; color:var(--text-muted);">
              Pay via x402 (SOLANA / BASE) &bull; 90% cheaper than Chainlink and Switchboard VRF
            </div>
          </div>

          <div class="card">
            <span class="card-label">Use Cases</span>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.75rem;">
              <div class="hash-display" style="padding:0.5rem; margin:0;">NFT Mints</div>
              <div class="hash-display" style="padding:0.5rem; margin:0;">Gacha / Loot</div>
              <div class="hash-display" style="padding:0.5rem; margin:0;">Casino Games</div>
              <div class="hash-display" style="padding:0.5rem; margin:0;">Tournaments</div>
              <div class="hash-display" style="padding:0.5rem; margin:0;">PvP Selection</div>
            </div>
          </div>

          <div class="card">
            <span class="card-label">Service Info</span>
            <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.7;">
              <div>Arweave Proofs: <strong style="color:var(--text-main);">${arweaveEnabled ? "Enabled" : "Disabled"}</strong></div>
              <div>Networks: <strong style="color:var(--text-main);">${supportedNetworks.join(", ")}</strong></div>
              <div>Facilitator: <strong style="color:var(--text-main);">PayAI</strong></div>
            </div>
          </div>
        </div>

        <!-- GUIDE -->
        <div id="v-guide" class="tab-view">
          <div class="card">
            <span class="card-label">Quick Start</span>
            <div style="font-size:0.85rem; color:var(--text-muted); line-height:1.8;">
              <div style="margin-bottom:0.6rem; display:flex; gap:10px;">
                <span style="color:var(--accent); font-weight:700;">1.</span>
                <span>Connect wallet & select network</span>
              </div>
              <div style="margin-bottom:0.6rem; display:flex; gap:10px;">
                <span style="color:var(--accent); font-weight:700;">2.</span>
                <span>Choose operation type (see below)</span>
              </div>
              <div style="display:flex; gap:10px;">
                <span style="color:var(--accent); font-weight:700;">3.</span>
                <span>Pay $0.01 via x402 & get result</span>
              </div>
            </div>
          </div>

          <div class="card">
            <span class="card-label">Operations</span>
            <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.6;">
              <div style="margin-bottom:0.4rem;"><strong style="color:var(--text-main);">Randomness</strong> - 256-bit seed</div>
              <div style="margin-bottom:0.4rem;"><strong style="color:var(--text-main);">Number</strong> - Integer in range [min, max]</div>
              <div style="margin-bottom:0.4rem;"><strong style="color:var(--text-main);">Dice</strong> - Roll NdM (e.g., 2d6)</div>
              <div style="margin-bottom:0.4rem;"><strong style="color:var(--text-main);">Pick</strong> - Select one item from list</div>
              <div style="margin-bottom:0.4rem;"><strong style="color:var(--text-main);">Shuffle</strong> - Randomize list order</div>
              <div style="margin-bottom:0.4rem;"><strong style="color:var(--text-main);">Winners</strong> - Select N winners from list</div>
              <div><strong style="color:var(--text-main);">UUID</strong> - Generate v4 UUID</div>
            </div>
          </div>

          <div class="card">
            <span class="card-label">What is x402?</span>
            <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5; margin:0;">
              Pay-per-request via <a href="https://www.x402.org" target="_blank" style="color:var(--accent);">HTTP 402 headers</a>.
            </p>
          </div>

          <div class="card">
            <span class="card-label">Verification</span>
            <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">
              Every response includes a TEE attestation. Use <strong style="color:var(--text-main);">AUDIT</strong> tab to verify hardware signature.
            </p>
          </div>
        </div>

        <!-- API -->
        <div id="v-api" class="tab-view">
          <div class="card">
            <span class="card-label">POST Endpoints</span>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.75rem;">
              <div class="hash-display" style="padding:0.5rem; margin:0;">/v1/randomness</div>
              <div class="hash-display" style="padding:0.5rem; margin:0;">/v1/random/number</div>
              <div class="hash-display" style="padding:0.5rem; margin:0;">/v1/random/dice</div>
              <div class="hash-display" style="padding:0.5rem; margin:0;">/v1/random/pick</div>
              <div class="hash-display" style="padding:0.5rem; margin:0;">/v1/random/shuffle</div>
              <div class="hash-display" style="padding:0.5rem; margin:0;">/v1/random/winners</div>
              <div class="hash-display" style="padding:0.5rem; margin:0;">/v1/random/uuid</div>
            </div>
          </div>

          <div class="card">
            <span class="card-label">Developer Resources</span>
            <a href="https://github.com/mysterygiftdotfun/verifiable-randomness-service" target="_blank" style="text-decoration:none">
              <button class="std-btn" style="margin-bottom:0.8rem;">
                <iconify-icon icon="ph:github-logo-fill" style="vertical-align:text-bottom; margin-right:4px;"></iconify-icon> View Source Code
              </button>
            </a>

            <a href="${nodeUrl}" target="_blank" style="text-decoration:none; display:block;">
              <button class="std-btn" style="background:rgba(52, 211, 153, 0.05); border-color:rgba(52, 211, 153, 0.2); color:var(--success);">
                <iconify-icon icon="ph:activity-bold" style="vertical-align:text-bottom; margin-right:4px;"></iconify-icon>
                View Node Status
              </button>
            </a>
          </div>
        </div>

      </div>

      <!-- Console Footer -->
      <div class="console-bar" id="console-bar" onclick="toggleConsole()">
        <div class="console-header">
          <div class="console-indicator" id="status-dot"></div>
          <span id="status-text">System Ready</span>
          <div style="flex:1"></div>
          <iconify-icon icon="ph:caret-up-bold" id="console-chevron"></iconify-icon>
        </div>
        <div class="console-content" id="console">
          <div class="log-line">> Initializing TEE environment...</div>
          <div class="log-line">> Secure Enclave: Intel TDX</div>
          <div class="log-line">> Remote Attestation: Enabled</div>
        </div>
      </div>

      <div class="legal-footer">
        &copy; 2026 MYSTERY GIFT &bull; <a href="/terms" style="color:var(--text-muted)">Terms</a> &bull; <a href="/privacy" style="color:var(--text-muted)">Privacy</a> &bull; <a href="https://x.com/mysterygift_fun" target="_blank" style="color:var(--text-muted)">X</a>
      </div>
    </div>
  </div>

  <script>
    // Config - MUST be defined first
    var PAYMENT_WALLET = '${paymentWallet}';
    var PAYMENT_WALLET_BASE = '${baseWallet}';
    var HELIUS_RPC_URL = '${heliusRpc}';
    var BASE_RPC_URL = '${baseRpc}';
    var FACILITATOR_URL = '${facilitatorUrl}';
    var SUPPORTED_NETWORKS = ${networksJson};
    var HAS_BASE = ${hasBase ? "true" : "false"};
  </script>
  
  <!-- Inlined landing-client.js to avoid Cloudflare Access blocking -->
  <script>
${LANDING_CLIENT_JS}
  </script>

  <!-- Receipt Modal -->
  <div id="receipt-overlay" class="receipt-overlay">
    <div class="receipt-modal" id="receipt-content">
      <!-- Populated by showReceipt() -->
    </div>
  </div>

  <!-- Toast Notification -->
  <div id="toast" class="toast"></div>
</body>
</html>
  `;
}
