/**
 * Landing page for the Verifiable Randomness Service.
 * Extracted from index.ts for maintainability.
 *
 * Payment flow uses facilitator-based x402 (chain-agnostic).
 */

export interface LandingConfig {
  version: string;
  teeType: string;
  paymentWallet: string;
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
    facilitatorUrl,
    supportedNetworks,
    arweaveEnabled,
    environment,
  } = config;

  const envBadgeClass = environment === 'production' ? 'production' : 'development';
  const envBadgeText = environment === 'production' ? 'PROD' : 'DEV';
  const networksJson = JSON.stringify(supportedNetworks);

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
  <script>
    // Inline SPL Token helpers (spl-token IIFE not available in v0.4.x)
    const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

    const splToken = {
      async getAssociatedTokenAddress(mint, owner) {
        const { PublicKey } = solanaWeb3;
        const [address] = await PublicKey.findProgramAddress(
          [owner.toBuffer(), new PublicKey(SPL_TOKEN_PROGRAM_ID).toBuffer(), mint.toBuffer()],
          new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID)
        );
        return address;
      },

      async getAccount(connection, address) {
        const info = await connection.getAccountInfo(address);
        if (!info) throw new Error('Account not found');
        return info;
      },

      createAssociatedTokenAccountInstruction(payer, ata, owner, mint) {
        const { PublicKey, TransactionInstruction } = solanaWeb3;
        return new TransactionInstruction({
          keys: [
            { pubkey: payer, isSigner: true, isWritable: true },
            { pubkey: ata, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
            { pubkey: new PublicKey(SPL_TOKEN_PROGRAM_ID), isSigner: false, isWritable: false },
          ],
          programId: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
          data: new Uint8Array(0),
        });
      },

      createTransferInstruction(source, destination, owner, amount) {
        const { PublicKey, TransactionInstruction } = solanaWeb3;
        // Build 9-byte transfer instruction data: [3, amount_le_u64]
        const data = new Uint8Array(9);
        data[0] = 3; // Transfer instruction
        const amountBig = BigInt(amount);
        for (let i = 0; i < 8; i++) {
          data[1 + i] = Number((amountBig >> BigInt(i * 8)) & BigInt(0xff));
        }
        return new TransactionInstruction({
          keys: [
            { pubkey: source, isSigner: false, isWritable: true },
            { pubkey: destination, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: false },
          ],
          programId: new PublicKey(SPL_TOKEN_PROGRAM_ID),
          data,
        });
      }
    };
  </script>

  <style>
    :root {
      --bg: #09090b;
      --panel-bg: rgba(20, 20, 23, 0.75);
      --panel-border: rgba(255, 255, 255, 0.08);
      --text-main: #FAFAFA;
      --text-muted: #A1A1AA;
      --accent: #FF4D00;
      --accent-glow: rgba(255, 77, 0, 0.2);
      --success: #34D399;
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
      grid-template-columns: 1fr 450px;
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

    .version-tag {
      position: absolute;
      bottom: 2rem;
      right: 2rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      opacity: 0.5;
      font-weight: 600;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 0.5rem;
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
    .wallet-btn.connected { background: rgba(52, 211, 153, 0.1); border-color: rgba(52, 211, 153, 0.3); color: var(--success); }

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
    .console-indicator { width: 6px; height: 6px; border-radius: 50%; background: var(--success); box-shadow: 0 0 5px var(--success); }
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
    .log-success { color: var(--success); }
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
    .receipt-header { padding: 1.5rem 2rem; background: linear-gradient(135deg, rgba(52, 211, 153, 0.15) 0%, rgba(52, 211, 153, 0.05) 100%); border-bottom: 1px solid rgba(52, 211, 153, 0.2); display: flex; align-items: center; justify-content: space-between; }
    .receipt-header h3 { display: flex; align-items: center; gap: 0.6rem; font-size: 1rem; font-weight: 600; color: var(--success); text-transform: uppercase; letter-spacing: 0.05em; }
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
    .receipt-value.success { color: var(--success); }
    .receipt-link { color: var(--accent); text-decoration: none; display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; }
    .receipt-link:hover { text-decoration: underline; }
    .receipt-result { font-size: 1.5rem; font-weight: 700; color: var(--accent); text-align: center; padding: 1rem 0; font-family: var(--font); }
    .receipt-actions { display: flex; gap: 0.75rem; padding: 1.5rem 2rem; background: rgba(0, 0, 0, 0.2); }
    .receipt-btn { flex: 1; padding: 0.75rem 1rem; border-radius: 8px; font-family: var(--font); font-size: 0.75rem; font-weight: 500; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.4rem; }
    .receipt-btn-primary { background: var(--accent); color: white; border: none; }
    .receipt-btn-primary:hover { background: #ff6a33; }
    .receipt-btn-secondary { background: transparent; color: var(--text-main); border: 1px solid var(--panel-border); }
    .receipt-btn-secondary:hover { background: rgba(255, 255, 255, 0.05); }
    .toast { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%) translateY(100px); background: var(--success); color: #000; padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600; z-index: 2000; opacity: 0; transition: all 0.3s ease; }
    .toast.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
    .verification-badge { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.8rem; background: rgba(52, 211, 153, 0.15); border: 1px solid rgba(52, 211, 153, 0.3); border-radius: 6px; font-size: 0.75rem; color: var(--success); font-weight: 500; }
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
        <div class="subtitle">POWERED BY INTEL TDX</div>
      </div>

      <div class="miss-container" id="miss-container">
        <img src="/assets/miss.png" class="miss-img" alt="Miss">
      </div>

      <a href="/changelog" class="version-tag" style="text-decoration:none; cursor:pointer;">
        v${version} &bull; ${composeHash.slice(0, 8)}
        <span class="env-badge ${envBadgeClass}">${envBadgeText}</span>
      </a>
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
                <div class="dropdown-option" data-value="pick">Pick Winner</div>
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
          </div>

          <div class="card">
            <span class="card-label">Configuration</span>

            <div style="margin-bottom:0.5rem; font-size:0.75rem; color:var(--text-muted);">Network</div>
            <div class="toggle-group" id="network-toggle">
              ${supportedNetworks.map((n, i) => `<button class="toggle-opt${i === 0 ? ' active' : ''}" id="net-${n}" onclick="setNetwork('${n}')"><iconify-icon icon="${n === 'solana' ? 'token:sol' : 'token:eth'}" style="vertical-align:middle; margin-right:4px;"></iconify-icon>${n.toUpperCase()}</button>`).join('\n              ')}
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
            <span class="card-label">System Identity</span>
            <div class="hash-display" style="margin-bottom: 1rem;">APP_ID: ${appId}</div>

            <span class="card-label">Integrity Hash</span>
            <div class="hash-display" id="compose-hash">${composeHash}</div>
          </div>

          <button class="std-btn" onclick="verify()" id="verify-btn">
            Verify Attestation Signature
          </button>

          <div id="verify-res" style="margin-top:1rem; display:none;"></div>
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
              <div style="font-size:1.2rem; font-weight:700; color:var(--text-main);">$0.01 <span style="font-size:0.8rem; color:var(--text-muted);">/ req</span></div>
            </div>
            <div style="margin-top:0.8rem; font-size:0.8rem; color:var(--text-muted);">
              Pay via x402 (${supportedNetworks.join(' / ').toUpperCase()}) &bull; 90% cheaper than Chainlink VRF
            </div>
          </div>

          <div class="card">
            <span class="card-label">Use Cases</span>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:0;">
              NFT Mints &bull; Gacha / Loot &bull; Casino Games &bull; Tournaments &bull; PvP Selection
            </p>
          </div>

          <div class="card">
            <span class="card-label">Service Info</span>
            <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.7;">
              <div>Arweave Proofs: <strong style="color:var(--text-main);">${arweaveEnabled ? 'Enabled' : 'Disabled'}</strong></div>
              <div>Networks: <strong style="color:var(--text-main);">${supportedNetworks.join(', ')}</strong></div>
              <div>Facilitator: <strong style="color:var(--text-main);">PayAI</strong></div>
            </div>
          </div>
        </div>

        <!-- GUIDE -->
        <div id="v-guide" class="tab-view">
          <div class="card">
            <span class="card-label">Quick Start</span>
            <div style="font-size:0.85rem; color:var(--text-muted); line-height:1.8;">
              <div style="margin-bottom:0.8rem; display:flex; gap:10px;">
                <span style="color:var(--accent); font-weight:700;">1.</span>
                <span>Connect your wallet (Phantom, Solflare, or any supported wallet)</span>
              </div>
              <div style="margin-bottom:0.8rem; display:flex; gap:10px;">
                <span style="color:var(--accent); font-weight:700;">2.</span>
                <span>Select operation type and configure parameters</span>
              </div>
              <div style="margin-bottom:0.8rem; display:flex; gap:10px;">
                <span style="color:var(--accent); font-weight:700;">3.</span>
                <span>Choose network (${supportedNetworks.join(' / ')})</span>
              </div>
              <div style="display:flex; gap:10px;">
                <span style="color:var(--accent); font-weight:700;">4.</span>
                <span>Click "Initialize Randomness" and complete payment via facilitator</span>
              </div>
            </div>
          </div>

          <div class="card">
            <span class="card-label">Operations</span>
            <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.7;">
              <div style="margin-bottom:0.6rem;">
                <strong style="color:var(--text-main);">Raw Randomness</strong> - 256-bit cryptographic seed
              </div>
              <div style="margin-bottom:0.6rem;">
                <strong style="color:var(--text-main);">Random Number</strong> - Integer within min/max range
              </div>
              <div style="margin-bottom:0.6rem;">
                <strong style="color:var(--text-main);">Roll Dice</strong> - Simulate dice rolls (e.g., 2d6, 1d20)
              </div>
              <div>
                <strong style="color:var(--text-main);">Pick Winner</strong> - Select from comma-separated list
              </div>
            </div>
          </div>

          <div class="card">
            <span class="card-label">What is x402?</span>
            <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.6; margin-bottom:0.5rem;">
              Open standard for machine-to-machine payments via HTTP 402 headers. Enables instant, permissionless payments across multiple chains.
            </p>
            <a href="https://www.x402.org" target="_blank" style="font-size:0.8rem; color:var(--accent);">Learn more &rarr;</a>
          </div>

          <div class="card">
            <span class="card-label">Verification</span>
            <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.6;">
              Each response includes a TEE attestation. Use the <strong style="color:var(--text-main);">AUDIT</strong> tab to verify the hardware signature and confirm the randomness was generated in a genuine Intel TDX enclave.
            </p>
          </div>
        </div>

        <!-- API -->
        <div id="v-api" class="tab-view">
          <div class="card">
            <span class="card-label">API Endpoints (POST)</span>
            <div class="hash-display" style="margin-bottom:0.5rem">/v1/randomness</div>
            <div class="hash-display" style="margin-bottom:0.5rem">/v1/random/pick</div>
            <div class="hash-display" style="margin-bottom:0.5rem">/v1/random/dice</div>
            <div class="hash-display" style="margin-bottom:0.5rem">/v1/random/uuid</div>
            <div class="hash-display">/v1/random/shuffle</div>
          </div>

          <div class="card">
            <span class="card-label">Developer Resources</span>
            <a href="https://github.com/mysterygift/mystery-gift" target="_blank" style="text-decoration:none">
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
    // Config
    const PAYMENT_WALLET = '${paymentWallet}';
    const FACILITATOR_URL = '${facilitatorUrl}';
    const SUPPORTED_NETWORKS = ${networksJson};

    // State
    let selectedNetwork = SUPPORTED_NETWORKS[0] || 'solana';
    let wallet = null;
    let consoleExpanded = false;

    function toggleDropdown() {
      document.getElementById('op-dropdown').classList.toggle('open');
    }

    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('op-dropdown');
      if (dropdown && !dropdown.contains(e.target)) dropdown.classList.remove('open');
    });

    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.dropdown-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          const dropdown = e.target.closest('.custom-dropdown');
          const selected = dropdown.querySelector('.dropdown-selected');
          dropdown.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
          e.target.classList.add('selected');
          selected.textContent = e.target.textContent;
          document.getElementById('op-type').value = e.target.dataset.value;
          dropdown.classList.remove('open');
          updateInputs();
        });
      });
    });

    function nav(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      document.getElementById('t-'+tab).classList.add('active');
      document.getElementById('v-'+tab).classList.add('active');
    }

    function setNetwork(n) {
      selectedNetwork = n;
      SUPPORTED_NETWORKS.forEach(net => {
        const el = document.getElementById('net-' + net);
        if (el) el.classList.toggle('active', net === n);
      });
    }

    function updateInputs() {
      const type = document.getElementById('op-type').value;
      document.getElementById('inputs-number').style.display = type === 'number' ? 'block' : 'none';
      document.getElementById('inputs-dice').style.display = type === 'dice' ? 'block' : 'none';
      document.getElementById('inputs-pick').style.display = type === 'pick' ? 'block' : 'none';
    }

    function log(msg, type='info') {
      const t = document.getElementById('console');
      const d = document.createElement('div');
      d.className = 'log-line ' + (type==='success'?'log-success':type==='error'?'log-error':'log-info');
      d.innerText = '> ' + msg;
      t.appendChild(d);
      t.scrollTop = t.scrollHeight;
      document.getElementById('status-text').innerText = msg;
      const dot = document.getElementById('status-dot');
      dot.style.background = type==='success' ? 'var(--success)' : type==='error' ? '#F87171' : 'var(--text-muted)';
      dot.style.boxShadow = type==='success' ? '0 0 5px var(--success)' : 'none';
    }

    function toggleConsole() {
      consoleExpanded = !consoleExpanded;
      const bar = document.getElementById('console-bar');
      const chevron = document.getElementById('console-chevron');
      bar.classList.toggle('expanded', consoleExpanded);
      chevron.setAttribute('icon', consoleExpanded ? 'ph:caret-down-bold' : 'ph:caret-up-bold');
    }

    // Parallax
    const hero = document.getElementById('hero-section');
    const miss = document.getElementById('miss-container');
    if(hero && window.innerWidth > 1024) {
      hero.addEventListener('mousemove', (e) => {
        const { width, height } = hero.getBoundingClientRect();
        const x = (e.clientX / width - 0.5) * 20;
        const y = (e.clientY / height - 0.5) * 20;
        hero.style.backgroundPosition = 'calc(50% - ' + x + 'px) calc(50% - ' + y + 'px)';
        miss.style.transform = 'translate(' + (x*0.5) + 'px, ' + (y*0.5) + 'px)';
      });
    }

    async function toggleWallet() {
      if (wallet) {
        try { if (window.solana?.disconnect) await window.solana.disconnect(); } catch(e) {}
        wallet = null;
        document.getElementById('connect-btn').innerHTML = '<iconify-icon icon="ph:wallet-fill"></iconify-icon> CONNECT WALLET';
        document.getElementById('connect-btn').classList.remove('connected');
        document.getElementById('gen-btn').disabled = true;
        log('Wallet disconnected');
      } else {
        if (!window.solana) return log('No Solana wallet found. Install Phantom or Solflare.', 'error');
        try {
          try { await window.solana.disconnect(); } catch(e) {}
          const r = await window.solana.connect();
          wallet = r.publicKey.toString();
          document.getElementById('connect-btn').innerText = wallet.slice(0,4)+'..'+wallet.slice(-4);
          document.getElementById('connect-btn').classList.add('connected');
          document.getElementById('gen-btn').disabled = false;
          log('Connected: '+wallet, 'success');
        } catch(e) { log(e.message || 'Connection rejected', 'error'); }
      }
    }

    async function generate() {
      if(!wallet) return;
      const type = document.getElementById('op-type').value;
      log('Initializing ' + type.toUpperCase() + '...');

      let receiptData = {
        request_id: 'req-' + Date.now(),
        timestamp: new Date().toISOString(),
        type: type.toUpperCase(),
        wallet: wallet,
        network: selectedNetwork,
      };

      try {
        // 1. Build request body and endpoint
        let body = { request_hash: receiptData.request_id };
        let endpoint = '/v1/randomness';

        if (type === 'number') {
          endpoint = '/v1/random/number';
          body.min = parseInt(document.getElementById('in-min').value) || 1;
          body.max = parseInt(document.getElementById('in-max').value) || 100;
          receiptData.params = { min: body.min, max: body.max };
        } else if (type === 'dice') {
          endpoint = '/v1/random/dice';
          body.dice = document.getElementById('in-dice').value || '2d6';
          receiptData.params = { dice: body.dice };
        } else if (type === 'pick') {
          endpoint = '/v1/random/pick';
          body.items = (document.getElementById('in-items').value || 'A,B,C').split(',').map(s=>s.trim());
          receiptData.params = { items: body.items };
        }

        // 2. Make initial request to get PaymentRequirements (402)
        log('Fetching payment requirements...');
        const initialRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (initialRes.status !== 402) {
          // If not 402, endpoint may be free or errored
          const data = await initialRes.json();
          if (data.error) throw new Error(data.error);
          receiptData.result = { random_seed: data.random_seed, tee_type: data.tee_type, attestation: data.attestation };
          if (data.number !== undefined) receiptData.result.value = data.number;
          if (data.total !== undefined) receiptData.result.value = data.total + ' (' + data.rolls.join(', ') + ')';
          if (data.picked !== undefined) receiptData.result.value = data.picked;
          receiptData.payment = { method: 'Free (whitelisted)', amount: '$0.00' };
          log('Complete! (no payment required)', 'success');
          showReceipt(receiptData);
          return;
        }

        const paymentInfo = await initialRes.json();
        const accepts = paymentInfo.accepts || [];
        const requirements = accepts.find(r => r.network === selectedNetwork) || accepts[0];
        if (!requirements) throw new Error('No payment requirements for ' + selectedNetwork);

        log('Building USDC transfer transaction...');
        receiptData.payment = {
          method: 'x402 (' + selectedNetwork + ')',
          amount: '$0.01',
        };

        // 3. Build and sign USDC transfer transaction
        if (selectedNetwork === 'solana') {
          const { Connection, PublicKey, Transaction, SystemProgram } = solanaWeb3;

          // Try multiple RPC endpoints for reliability
          const RPC_ENDPOINTS = [
            'https://rpc.ankr.com/solana',
            'https://solana-mainnet.g.alchemy.com/v2/demo',
            'https://api.mainnet-beta.solana.com'
          ];

          let connection;
          let lastError;
          for (const rpc of RPC_ENDPOINTS) {
            try {
              connection = new Connection(rpc, 'confirmed');
              await connection.getLatestBlockhash('confirmed'); // Test connection
              log('Connected to Solana RPC');
              break;
            } catch (e) {
              lastError = e;
              continue;
            }
          }
          if (!connection) {
            throw new Error('All Solana RPC endpoints failed: ' + (lastError?.message || 'unknown error'));
          }

          const fromPubkey = new PublicKey(wallet);
          const toPubkey = new PublicKey(requirements.payTo);
          const usdcMint = new PublicKey(requirements.asset);
          const amount = parseInt(requirements.maxAmountRequired);

          // Get associated token accounts
          const fromAta = await splToken.getAssociatedTokenAddress(usdcMint, fromPubkey);
          const toAta = await splToken.getAssociatedTokenAddress(usdcMint, toPubkey);

          log('Preparing SPL token transfer...');

          // Check if destination ATA exists
          let instructions = [];
          try {
            await splToken.getAccount(connection, toAta);
          } catch (e) {
            // Create ATA if it doesn't exist
            instructions.push(
              splToken.createAssociatedTokenAccountInstruction(fromPubkey, toAta, toPubkey, usdcMint)
            );
          }

          // Add SPL transfer instruction
          instructions.push(
            splToken.createTransferInstruction(fromAta, toAta, fromPubkey, amount)
          );

          const transaction = new Transaction().add(...instructions);
          transaction.feePayer = fromPubkey;

          // Use fee payer from extra if provided
          if (requirements.extra && requirements.extra.feePayer) {
            transaction.feePayer = new PublicKey(requirements.extra.feePayer);
          }

          const { blockhash } = await connection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = blockhash;

          log('Please approve the transaction in your wallet...');
          const signedTx = await window.solana.signTransaction(transaction);
          const serializedTx = signedTx.serialize().toString('base64');

          // 4. Build X-PAYMENT header
          const paymentPayload = {
            x402Version: 1,
            scheme: requirements.scheme || 'exact',
            network: 'solana',
            payload: { transaction: serializedTx },
          };

          const xPaymentHeader = btoa(JSON.stringify(paymentPayload));
          log('Transaction signed, sending payment...');

          // 5. Re-send request with X-PAYMENT header
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Payment': xPaymentHeader,
            },
            body: JSON.stringify(body),
          });

          // Get settlement info from response header
          const paymentResponse = res.headers.get('X-PAYMENT-RESPONSE');
          if (paymentResponse) {
            try {
              const settlement = JSON.parse(atob(paymentResponse));
              receiptData.payment.settlement = settlement;
            } catch(e) {}
          }

          const data = await res.json();
          if (data.error) throw new Error(data.error);

          receiptData.result = {
            random_seed: data.random_seed,
            tee_type: data.tee_type,
            attestation: data.attestation,
          };

          if (data.number !== undefined) receiptData.result.value = data.number;
          if (data.total !== undefined) receiptData.result.value = data.total + ' (' + data.rolls.join(', ') + ')';
          if (data.picked !== undefined) receiptData.result.value = data.picked;

        } else {
          throw new Error('EVM payment not yet supported in the landing page. Use API with X-PAYMENT header directly.');
        }

        // 6. Auto-verify attestation
        log('Verifying attestation...');
        try {
          const attRes = await fetch('/v1/attestation');
          const attData = await attRes.json();
          receiptData.attestation = {
            app_id: attData.app_id,
            compose_hash: attData.compose_hash || 'Simulation Mode',
            tee_type: attData.tee_type,
          };

          if (attData.quote_hex) {
            const verifyRes = await fetch('/v1/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ quote_hex: attData.quote_hex }),
            });
            const verifyData = await verifyRes.json();
            receiptData.verification = {
              valid: verifyData.valid,
              verified_by: 'Phala Cloud Attestation API',
              verified_at: new Date().toISOString(),
            };
          } else {
            receiptData.verification = { valid: false, note: 'Simulation mode - no hardware attestation' };
          }
        } catch(e) {
          receiptData.verification = { valid: false, error: e.message };
        }

        log('Complete!', 'success');
        showReceipt(receiptData);

      } catch(e) {
        log(e.message, 'error');
      }
    }

    // Receipt Modal Functions
    function showReceipt(data) {
      const overlay = document.getElementById('receipt-overlay');
      const content = document.getElementById('receipt-content');

      let resultDisplay = data.result.random_seed || 'N/A';
      if (data.result.value !== undefined) {
        resultDisplay = String(data.result.value);
      }

      const settleTx = data.payment.settlement?.transaction;
      const txLink = settleTx
        ? (data.network === 'base'
          ? 'https://basescan.org/tx/' + settleTx
          : 'https://solscan.io/tx/' + settleTx)
        : null;

      content.innerHTML = \`
        <div class="receipt-header">
          <h3><iconify-icon icon="ph:check-circle-fill"></iconify-icon> TEE Randomness Receipt</h3>
          <button class="receipt-close" onclick="closeReceipt()">&times;</button>
        </div>

        <div class="receipt-section">
          <div class="receipt-section-title">Request</div>
          <div class="receipt-row">
            <span class="receipt-label">ID</span>
            <span class="receipt-value">\${data.request_id}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Time</span>
            <span class="receipt-value">\${new Date(data.timestamp).toLocaleString()}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Type</span>
            <span class="receipt-value highlight">\${data.type}</span>
          </div>
        </div>

        <div class="receipt-section" style="text-align: center; padding: 1.5rem 2rem;">
          <div class="receipt-section-title">Result</div>
          <div class="receipt-result">\${resultDisplay}</div>
        </div>

        <div class="receipt-section">
          <div class="receipt-section-title">Payment</div>
          <div class="receipt-row">
            <span class="receipt-label">Method</span>
            <span class="receipt-value">\${data.payment.method}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Amount</span>
            <span class="receipt-value">\${data.payment.amount}</span>
          </div>
          \${txLink ? \`<div class="receipt-row">
            <span class="receipt-label">TX</span>
            <a class="receipt-link" href="\${txLink}" target="_blank">
              \${settleTx.slice(0,8)}...\${settleTx.slice(-6)}
              <iconify-icon icon="ph:arrow-square-out"></iconify-icon>
            </a>
          </div>\` : \`<div class="receipt-row">
            <span class="receipt-label">Protocol</span>
            <span class="receipt-value">x402 v1</span>
          </div>\`}
        </div>

        <div class="receipt-section">
          <div class="receipt-section-title">Attestation</div>
          <div class="receipt-row">
            <span class="receipt-label">TEE Type</span>
            <span class="receipt-value">\${data.attestation?.tee_type || 'simulation'}</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">App ID</span>
            <span class="receipt-value">\${(data.attestation?.app_id || 'N/A').slice(0, 16)}...</span>
          </div>
          <div class="receipt-row">
            <span class="receipt-label">Compose Hash</span>
            <span class="receipt-value">\${(data.attestation?.compose_hash || 'N/A').slice(0, 12)}...</span>
          </div>
          <div class="receipt-row" style="margin-top: 0.75rem;">
            <span class="receipt-label">Status</span>
            \${data.verification?.valid
              ? '<span class="verification-badge"><iconify-icon icon="ph:seal-check-fill"></iconify-icon> Hardware Verified</span>'
              : '<span class="receipt-value" style="color: var(--text-muted);">Simulation Mode</span>'
            }
          </div>
        </div>

        <div class="receipt-actions">
          <button class="receipt-btn receipt-btn-secondary" onclick="copyReceipt()">
            <iconify-icon icon="ph:copy"></iconify-icon> Copy
          </button>
          <button class="receipt-btn receipt-btn-secondary" onclick="downloadReceipt()">
            <iconify-icon icon="ph:download-simple"></iconify-icon> Download
          </button>
          <button class="receipt-btn receipt-btn-primary" onclick="closeReceipt()">
            Done
          </button>
        </div>
      \`;

      window.currentReceipt = data;
      overlay.classList.add('visible');
    }

    function closeReceipt() {
      document.getElementById('receipt-overlay').classList.remove('visible');
    }

    function copyReceipt() {
      if (!window.currentReceipt) return;
      const text = JSON.stringify(window.currentReceipt, null, 2);
      navigator.clipboard.writeText(text).then(() => {
        showToast('Receipt copied to clipboard!');
      });
    }

    function downloadReceipt() {
      if (!window.currentReceipt) return;
      const data = JSON.stringify(window.currentReceipt, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tee-receipt-' + window.currentReceipt.request_id + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Receipt downloaded!');
    }

    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.innerText = message;
      toast.classList.add('visible');
      setTimeout(() => toast.classList.remove('visible'), 2500);
    }

    async function verify() {
      const btn = document.getElementById('verify-btn');
      btn.innerText = 'Verifying...';
      try {
        const att = await fetch('/v1/attestation').then(r=>r.json());
        const res = await fetch('/v1/verify', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({quote_hex:att.quote_hex})
        }).then(r=>r.json());

        const box = document.getElementById('verify-res');
        box.style.display = 'block';
        if(res.valid) box.innerHTML = '<div class="log-success">>> HARDWARE SIGNATURE VALIDATED<br>Intel TDX Enclave Confirmed</div>';
        else throw new Error('Invalid');
      } catch(e) {
        document.getElementById('verify-res').innerHTML = '<div class="log-error">>> VERIFICATION FAILED</div>';
      }
      btn.innerText = 'Verify Attestation Signature';
    }

    // Fetch compose hash on load
    (async function loadComposeHash() {
      try {
        const res = await fetch('/v1/attestation');
        const data = await res.json();
        const hashEl = document.getElementById('compose-hash');
        if (data.compose_hash) {
          hashEl.innerText = data.compose_hash;
        } else if (data.error) {
          hashEl.innerText = 'TEE: ' + (data.tee_type || 'simulation');
        } else {
          hashEl.innerText = 'Simulation Mode (No TEE)';
        }
      } catch(e) {
        document.getElementById('compose-hash').innerText = 'Failed to load';
      }
    })();
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
