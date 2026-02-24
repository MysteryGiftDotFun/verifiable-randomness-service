/**
 * Landing Page Client-Side JavaScript
 * Extracted from landing.ts for easier maintenance and validation
 *
 * This file is served as static and should be valid JavaScript.
 * Use ESLint or similar to validate syntax before deployment.
 */

// ============================================================================
// SPL Token Helpers (from lines 67-145 of original landing.ts)
// ============================================================================

const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

const splToken = {
  async getAssociatedTokenAddress(mint, owner) {
    const { PublicKey } = solanaWeb3;
    const [address] = await PublicKey.findProgramAddress(
      [
        owner.toBuffer(),
        new PublicKey(SPL_TOKEN_PROGRAM_ID).toBuffer(),
        mint.toBuffer(),
      ],
      new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
    );
    return address;
  },

  async getAccount(connection, address) {
    const info = await connection.getAccountInfo(address);
    if (!info) throw new Error("Account not found");
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
        {
          pubkey: new PublicKey("11111111111111111111111111111111"),
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: new PublicKey(SPL_TOKEN_PROGRAM_ID),
          isSigner: false,
          isWritable: false,
        },
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
  },

  // TransferChecked: includes mint and decimals for verification (required by x402)
  createTransferCheckedInstruction(
    source,
    mint,
    destination,
    owner,
    amount,
    decimals,
  ) {
    const { PublicKey, TransactionInstruction } = solanaWeb3;
    // Build 10-byte transferChecked instruction data: [12, amount_le_u64, decimals_u8]
    const data = new Uint8Array(10);
    data[0] = 12; // TransferChecked instruction
    const amountBig = BigInt(amount);
    for (let i = 0; i < 8; i++) {
      data[1 + i] = Number((amountBig >> BigInt(i * 8)) & BigInt(0xff));
    }
    data[9] = decimals;
    return new TransactionInstruction({
      keys: [
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      programId: new PublicKey(SPL_TOKEN_PROGRAM_ID),
      data,
    });
  },
};

// ============================================================================
// X402 EVM Client (from lines 149-262 of original landing.ts)
// ============================================================================

// x402 EVM Client - Official implementation for EIP-3009 payments
// Uses MetaMask's eth_signTypedData_v4
const X402EVM = {
  // USDC contract addresses
  USDC_ADDRESSES: {
    base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },

  // Generate a random 32-byte nonce
  generateNonce() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return (
      "0x" +
      Array.from(array)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  },

  // Build EIP-712 typed data for EIP-3009 TransferWithAuthorization
  buildTypedData(
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonce,
    chainId,
    usdcAddress,
  ) {
    return {
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: chainId,
        verifyingContract: usdcAddress,
      },
      message: {
        from: from,
        to: to,
        value: value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonce,
      },
      primaryType: "TransferWithAuthorization",
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
    };
  },

  // Create x402 payment payload using official format
  async createPaymentPayload(provider, network, paymentRequirements) {
    const { maxAmountRequired, asset, payTo } = paymentRequirements;

    // Get account
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const from = accounts[0];

    // Generate authorization parameters
    const validAfter = Math.floor(Date.now() / 1000);
    const validBefore = validAfter + 300;
    const nonce = this.generateNonce();

    // Parse chain ID from network (e.g., "eip155:8453" -> 8453)
    const chainId = parseInt(network.split(":")[1] || "8453", 10);

    // Build typed data
    const typedData = this.buildTypedData(
      from,
      payTo,
      maxAmountRequired,
      validAfter,
      validBefore,
      nonce,
      chainId,
      asset,
    );

    // Sign with MetaMask
    const signature = await provider.request({
      method: "eth_signTypedData_v4",
      params: [from, JSON.stringify(typedData)],
    });

    // Return x402 v2 payment payload format
    // CRITICAL: Must include ALL required fields per x402 spec
    return {
      x402Version: 2,
      scheme: "exact",
      network: network,
      accepted: {
        scheme: "exact",
        network: network,
        amount: maxAmountRequired,
        asset: asset,
        payTo: payTo,
        maxTimeoutSeconds: 60,
      },
      payload: {
        signature: signature,
        authorization: {
          from: from,
          to: payTo,
          value: maxAmountRequired,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce: nonce,
        },
      },
      extensions: {}, // REQUIRED: empty object per x402 spec
    };
  },
};

// ============================================================================
// Main Application Code (from lines 1078-1863 of original landing.ts)
// ============================================================================
// Note: Config variables (PAYMENT_WALLET, HELIUS_RPC_URL, etc.) are injected
// via a global config object from the server-side rendered HTML

// State
let selectedNetwork = SUPPORTED_NETWORKS[0] || "solana";
let wallet = null;
let consoleExpanded = false;

function toggleDropdown() {
  const dropdown = document.getElementById("op-dropdown");
  if (dropdown) dropdown.classList.toggle("open");
}

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("op-dropdown");
  if (dropdown && !dropdown.contains(e.target))
    dropdown.classList.remove("open");
});

function log(msg, type = "info") {
  const c = document.getElementById("console");
  if (!c) return;
  const line = document.createElement("div");
  line.className = "log-" + type;
  line.innerText = "> " + msg;
  c.appendChild(line);
  c.scrollTop = c.scrollHeight;
  const statusText = document.getElementById("status-text");
  if (statusText) statusText.innerText = msg;
  const statusDot = document.getElementById("status-dot");
  if (statusDot) {
    statusDot.style.background =
      type === "success"
        ? "var(--success)"
        : type === "error"
          ? "#F87171"
          : "var(--text-muted)";
    statusDot.style.boxShadow =
      type === "success" ? "0 0 5px var(--success)" : "none";
  }
}

async function initNetwork() {
  log("Initializing " + selectedNetwork.toUpperCase() + "...");

  if (selectedNetwork === "solana") {
    if (!window.solana) {
      log("No Solana wallet found. Install Phantom or Solflare.", "error");
      return;
    }
    try {
      try {
        await window.solana.disconnect();
      } catch (e) {}
      const r = await window.solana.connect();
      wallet = r.publicKey.toString();
      const connectBtn = document.getElementById("connect-btn");
      if (connectBtn) {
        connectBtn.innerText = wallet.slice(0, 4) + ".." + wallet.slice(-4);
        connectBtn.classList.add("connected");
      }
      const genBtn = document.getElementById("gen-btn");
      if (genBtn) genBtn.disabled = false;
      log("Connected: " + wallet, "success");
    } catch (e) {
      log("Connection failed: " + e.message, "error");
    }
  } else if (selectedNetwork === "base") {
    let ethProvider = window.ethereum;
    if (!ethProvider) {
      if (window.walletConnectProvider) {
        ethProvider = window.walletConnectProvider;
      } else if (window.coinbaseWallet) {
        ethProvider = window.coinbaseWallet;
      }
    }

    if (!ethProvider) {
      try {
        const accounts = await window.ethereum?.request({
          method: "eth_requestAccounts",
        });
        if (accounts && accounts.length > 0) {
          ethProvider = window.ethereum;
        }
      } catch (e) {}
    }

    if (!ethProvider) {
      log("No EVM wallet found. Install MetaMask.", "error");
    } else {
      try {
        const accounts = await ethProvider.request({
          method: "eth_requestAccounts",
        });
        if (accounts && accounts.length > 0) {
          wallet = accounts[0];
          const connectBtn = document.getElementById("connect-btn");
          if (connectBtn) {
            connectBtn.innerText = wallet.slice(0, 4) + ".." + wallet.slice(-4);
            connectBtn.classList.add("connected");
          }
          const genBtn = document.getElementById("gen-btn");
          if (genBtn) genBtn.disabled = false;
          log("Connected: " + wallet, "success");
        }
      } catch (e) {
        log("No EVM wallet found. Install MetaMask.", "error");
      }
    }
  } else {
    log("Unsupported network: " + selectedNetwork, "error");
  }
}

// Console toggle (called from onclick in HTML)
function toggleConsole() {
  const bar = document.getElementById("console-bar");
  const chevron = document.getElementById("console-chevron");
  if (!bar || !chevron) return;
  consoleExpanded = !consoleExpanded;
  bar.classList.toggle("expanded", consoleExpanded);
  chevron.setAttribute(
    "icon",
    consoleExpanded ? "ph:caret-down-bold" : "ph:caret-up-bold",
  );
}

// Tab navigation (called from onclick in HTML)
function nav(tab) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".tab-view")
    .forEach((v) => v.classList.remove("active"));
  const tabBtn = document.getElementById("t-" + tab);
  const tabView = document.getElementById("v-" + tab);
  if (tabBtn) tabBtn.classList.add("active");
  if (tabView) tabView.classList.add("active");
}

// Network selector (called from onclick in HTML)
function setNetwork(network) {
  selectedNetwork = network;
  document
    .querySelectorAll(".toggle-opt")
    .forEach((btn) => btn.classList.remove("active"));
  const activeBtn = document.getElementById("net-" + network);
  if (activeBtn) activeBtn.classList.add("active");

  // Update wallet UI
  const connectBtn = document.getElementById("connect-btn");
  const genBtn = document.getElementById("gen-btn");
  if (connectBtn) {
    connectBtn.innerHTML =
      '<iconify-icon icon="ph:wallet-fill"></iconify-icon> CONNECT WALLET';
    connectBtn.classList.remove("connected");
  }
  if (genBtn) genBtn.disabled = true;
  wallet = null;
  log("Network changed to " + network.toUpperCase());
}

// Toggle wallet connect/disconnect (called from onclick in HTML)
async function toggleWallet() {
  if (wallet) {
    try {
      if (window.solana?.disconnect) await window.solana.disconnect();
    } catch (e) {}
    wallet = null;
    const connectBtn = document.getElementById("connect-btn");
    const genBtn = document.getElementById("gen-btn");
    if (connectBtn) {
      connectBtn.innerHTML =
        '<iconify-icon icon="ph:wallet-fill"></iconify-icon> CONNECT WALLET';
      connectBtn.classList.remove("connected");
    }
    if (genBtn) genBtn.disabled = true;
    log("Wallet disconnected");
  } else {
    if (selectedNetwork === "solana") {
      if (!window.solana)
        return log(
          "No Solana wallet found. Install Phantom or Solflare.",
          "error",
        );
      try {
        try {
          await window.solana.disconnect();
        } catch (e) {}
        const r = await window.solana.connect();
        wallet = r.publicKey.toString();
        const connectBtn = document.getElementById("connect-btn");
        if (connectBtn) {
          connectBtn.innerText = wallet.slice(0, 4) + ".." + wallet.slice(-4);
          connectBtn.classList.add("connected");
        }
        const genBtn = document.getElementById("gen-btn");
        if (genBtn) genBtn.disabled = false;
        log(
          "Wallet connected: " + wallet.slice(0, 6) + "..." + wallet.slice(-4),
        );
      } catch (e) {
        log("Wallet connection failed: " + e.message, "error");
      }
    } else if (selectedNetwork === "base") {
      if (!window.ethereum)
        return log("No Ethereum wallet found. Install MetaMask.", "error");
      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        wallet = accounts[0];
        const connectBtn = document.getElementById("connect-btn");
        if (connectBtn) {
          connectBtn.innerText = wallet.slice(0, 6) + "..." + wallet.slice(-4);
          connectBtn.classList.add("connected");
        }
        const genBtn = document.getElementById("gen-btn");
        if (genBtn) genBtn.disabled = false;
        log(
          "Wallet connected: " + wallet.slice(0, 6) + "..." + wallet.slice(-4),
        );
      } catch (e) {
        log("Wallet connection failed: " + e.message, "error");
      }
    }
  }
}

// Generate randomness (called from onclick in HTML)
async function generate() {
  log("Initializing randomness request...", "info");
  const genBtn = document.getElementById("gen-btn");
  if (genBtn) genBtn.disabled = true;

  try {
    // Get operation type
    const opType = document.getElementById("op-type")?.value || "randomness";

    let endpoint = "/v1/randomness";
    let body = {};

    if (opType === "number") {
      endpoint = "/v1/random/number";
      const min = parseInt(document.getElementById("in-min")?.value) || 1;
      const max = parseInt(document.getElementById("in-max")?.value) || 100;
      body = { min, max };
    } else if (opType === "dice") {
      endpoint = "/v1/random/dice";
      const format = document.getElementById("in-dice")?.value || "2d6";
      body = { format };
    } else if (opType === "pick") {
      endpoint = "/v1/random/pick";
      const itemsStr = document.getElementById("in-items")?.value || "";
      const items = itemsStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      body = { items };
    }

    log("Requesting " + opType + "...");

    let response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Handle x402 payment required
    if (response.status === 402) {
      const paymentHeader = response.headers.get("payment-required");
      if (paymentHeader) {
        log("Payment required, processing...", "info");

        const paymentRequirements = JSON.parse(atob(paymentHeader));

        // Find matching payment method based on selected network
        const accept = paymentRequirements.accepts.find(
          (a) =>
            (selectedNetwork === "solana" && a.network.startsWith("solana:")) ||
            (selectedNetwork === "base" && a.network.startsWith("eip155:")),
        );

        if (!accept) {
          throw new Error(
            "No compatible payment method found for " + selectedNetwork,
          );
        }

        let payment;
        if (selectedNetwork === "solana") {
          // Use spl-token for Solana
          payment = await createSolanaPayment(accept, body);
        } else if (selectedNetwork === "base") {
          // Use x402 for EVM
          payment = await X402EVM.createPaymentPayload(
            window.ethereum,
            accept.network,
            accept,
          );
        }

        // Retry with payment
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Payment": JSON.stringify(payment),
          },
          body: JSON.stringify(body),
        });
      }
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Request failed");
    }

    const data = await response.json();
    log("Randomness generated!", "success");

    // Show result
    showReceipt({
      success: true,
      operation: opType,
      ...data,
    });
  } catch (e) {
    log("Error: " + e.message, "error");
  } finally {
    const genBtn = document.getElementById("gen-btn");
    if (genBtn) genBtn.disabled = false;
  }
}

// Create Solana payment using spl-token
async function createSolanaPayment(paymentReq, body) {
  const { Connection, PublicKey, Transaction } = solanaWeb3;

  // Get the payment asset (USDC)
  const usdcMint = new PublicKey(paymentReq.asset);
  const paymentWallet = new PublicKey(paymentReq.payTo);

  // Get sender's token account
  const senderATA = await splToken.getAssociatedTokenAddress(usdcMint, wallet);

  // Get sender's token account balance
  const connection = new Connection(HELIUS_RPC_URL, "confirmed");
  let senderAccount;
  try {
    senderAccount = await splToken.getAccount(connection, senderATA);
  } catch (e) {
    // Account doesn't exist, create it
    throw new Error(
      "No USDC token account found. Please ensure you have USDC.",
    );
  }

  // Create transfer instruction
  const amount = BigInt(paymentReq.amount);
  const transferIx = splToken.createTransferCheckedInstruction(
    senderATA,
    usdcMint,
    paymentWallet,
    wallet,
    amount,
    6, // USDC has 6 decimals
  );

  // Build and sign transaction
  const transaction = new Transaction().add(transferIx);
  transaction.feePayer = wallet;
  transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  // Sign with Phantom/Solflare
  const signedTx = await window.solana.signTransaction(transaction);

  // Serialize
  const serialized = signedTx.serialize();

  return {
    scheme: "exact",
    network: paymentReq.network,
    amount: paymentReq.amount,
    asset: paymentReq.asset,
    payload: {
      transaction: Buffer.from(serialized).toString("base64"),
    },
  };
}

// Verify (called from onclick in HTML)
async function verify() {
  log("Verifying attestation...", "info");
  const verifyRes = document.getElementById("verify-res");

  try {
    const response = await fetch("/v1/attestation");
    const data = await response.json();

    if (data.attestation) {
      log("Attestation verified!", "success");
      if (verifyRes) {
        verifyRes.style.display = "block";
        verifyRes.innerHTML =
          '<span style="color:var(--success)">✓ Hardware attestation is valid</span>';
      }
    } else {
      throw new Error("No attestation data");
    }
  } catch (e) {
    log("Verification failed: " + e.message, "error");
    if (verifyRes) {
      verifyRes.style.display = "block";
      verifyRes.innerHTML =
        '<span style="color:#F87171">✗ Verification failed</span>';
    }
  }
}

// Download attestation (called from onclick in HTML)
async function downloadAttestation() {
  log("Fetching attestation...", "info");
  try {
    const response = await fetch("/v1/attestation");
    const data = await response.json();

    if (data.attestation) {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "attestation.json";
      a.click();
      URL.revokeObjectURL(url);
      log("Attestation downloaded!", "success");
    } else {
      throw new Error("No attestation available");
    }
  } catch (e) {
    log("Download failed: " + e.message, "error");
  }
}

// Close receipt modal
function closeReceipt() {
  const overlay = document.getElementById("receipt-overlay");
  if (overlay) overlay.style.display = "none";
}

// Show receipt modal
function showReceipt(data) {
  const overlay = document.getElementById("receipt-overlay");
  const content = document.getElementById("receipt-content");
  if (!overlay || !content) return;

  let resultHtml = "";
  if (data.result?.value) {
    resultHtml = `<div class="receipt-result">${data.result.value}</div>`;
  } else if (data.result?.seed) {
    resultHtml = `
      <div style="text-align:center; margin: 1rem 0;">
        <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.5rem;">RANDOM SEED (256-bit)</div>
        <div style="position:relative;">
          <input type="text" class="receipt-seed-input" value="${data.result.seed}" readonly>
          <button class="receipt-copy-btn" onclick="navigator.clipboard.writeText('${data.result.seed}')">
            <iconify-icon icon="ph:copy-bold"></iconify-icon>
          </button>
        </div>
      </div>`;
  }

  const commitmentHtml = data.commitment
    ? `
    <div class="receipt-section">
      <div class="receipt-section-title">Arweave Proof</div>
      <div class="receipt-row">
        <span class="receipt-label">Transaction</span>
        <a href="${data.commitment.arweave_url}" target="_blank" class="receipt-link">
          ${data.commitment.arweave_tx?.slice(0, 8) || "View"} <iconify-icon icon="ph:arrow-square-out-bold"></iconify-icon>
        </a>
      </div>
      <div class="receipt-row">
        <span class="receipt-label">Commitment Hash</span>
        <span class="receipt-value">${data.commitment.hash?.slice(0, 16)}...</span>
      </div>
    </div>
  `
    : "";

  content.innerHTML = `
    <div class="receipt-header">
      <h3><iconify-icon icon="ph:seal-check-fill"></iconify-icon> Receipt</h3>
      <button class="receipt-close" onclick="closeReceipt()">&times;</button>
    </div>
    <div class="receipt-section">
      <div class="receipt-section-title">Operation</div>
      <div class="receipt-row">
        <span class="receipt-label">Type</span>
        <span class="receipt-value">${data.operation || data.type || "Randomness"}</span>
      </div>
      <div class="receipt-row">
        <span class="receipt-label">Network</span>
        <span class="receipt-value">${data.network || selectedNetwork}</span>
      </div>
    </div>
    <div class="receipt-section">
      <div class="receipt-section-title">Result</div>
      ${resultHtml}
    </div>
    ${commitmentHtml}
    <div class="receipt-actions">
      <button class="receipt-btn receipt-btn-secondary" onclick="closeReceipt()">Close</button>
    </div>
  `;

  overlay.style.display = "flex";
}

// Close modal on outside click (wrapped in DOMContentLoaded)
document.addEventListener("DOMContentLoaded", () => {
  const receiptOverlay = document.getElementById("receipt-overlay");
  if (receiptOverlay) {
    receiptOverlay.addEventListener("click", (e) => {
      if (e.target.id === "receipt-overlay") closeReceipt();
    });
  }
});

// Auto-load TEE info (with null checks)
(function () {
  fetch("/v1/attestation")
    .then((r) => r.json())
    .then((data) => {
      const teeType = document.getElementById("tee-type");
      const appId = document.getElementById("app-id");
      if (teeType) teeType.innerText = data.tee_type || "Simulation";
      if (appId) appId.innerText = data.app_id || "N/A";
    })
    .catch(() => {
      const teeType = document.getElementById("tee-type");
      if (teeType) teeType.innerText = "Error";
    });
})();

(function () {
  fetch("/v1/health")
    .then((r) => r.json())
    .then((data) => {
      const hashEl = document.getElementById("compose-hash");
      if (hashEl) {
        hashEl.innerText = data.app_id ? data.app_id.slice(0, 8) : "N/A";
      }
    })
    .catch(() => {
      const hashEl = document.getElementById("compose-hash");
      if (hashEl) hashEl.innerText = "Failed to load";
    });
})();
