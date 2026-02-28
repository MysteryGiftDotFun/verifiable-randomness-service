/**
 * Landing Page Client-Side JavaScript
 * Extracted from landing.ts for easier maintenance and validation
 *
 * This file is served as static and should be valid JavaScript.
 * Use ESLint or similar to validate syntax before deployment.
 */

// ============================================================================
// Buffer Polyfill for Browser (required by @solana/web3.js internal usage)
// ============================================================================
(function () {
  if (typeof window !== "undefined" && typeof window.Buffer === "undefined") {
    // Helper function to add Buffer methods to a Uint8Array
    function addBufferMethods(arr) {
      arr.writeUInt8 = function (value, offset) {
        this[offset] = value;
      };
      arr.writeUInt16LE = function (value, offset) {
        this[offset] = value & 0xff;
        this[offset + 1] = (value >> 8) & 0xff;
      };
      arr.writeUInt32LE = function (value, offset) {
        this[offset] = value & 0xff;
        this[offset + 1] = (value >> 8) & 0xff;
        this[offset + 2] = (value >> 16) & 0xff;
        this[offset + 3] = (value >> 24) & 0xff;
      };
      arr.writeBigUInt64LE = function (value, offset) {
        const bigValue = BigInt(value);
        for (let i = 0; i < 8; i++) {
          this[offset + i] = Number((bigValue >> BigInt(i * 8)) & BigInt(0xff));
        }
      };
      arr.writeBigInt64LE = function (value, offset) {
        const bigValue = BigInt(value);
        for (let i = 0; i < 8; i++) {
          this[offset + i] = Number((bigValue >> BigInt(i * 8)) & BigInt(0xff));
        }
      };
      arr.readUInt8 = function (offset) {
        return this[offset];
      };
      arr.readUInt16LE = function (offset) {
        return this[offset] | (this[offset + 1] << 8);
      };
      arr.readUInt32LE = function (offset) {
        return (
          this[offset] |
          (this[offset + 1] << 8) |
          (this[offset + 2] << 16) |
          (this[offset + 3] << 24)
        );
      };
      arr.readBigUInt64LE = function (offset) {
        let result = BigInt(0);
        for (let i = 0; i < 8; i++) {
          result |= BigInt(this[offset + i]) << BigInt(i * 8);
        }
        return result;
      };
      arr.readBigInt64LE = function (offset) {
        let result = BigInt(0);
        for (let i = 0; i < 8; i++) {
          result |= BigInt(this[offset + i]) << BigInt(i * 8);
        }
        return result;
      };
      arr.fill = function (value, start, end) {
        for (let i = start || 0; i < (end || this.length); i++) {
          this[i] = value;
        }
        return this;
      };
      return arr;
    }

    const _Buffer = function Buffer(arg, encoding) {
      if (typeof arg === "number") {
        return addBufferMethods(new Uint8Array(arg));
      }
      if (typeof arg === "string") {
        if (encoding === "base64") {
          const binary = atob(arg);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          return addBufferMethods(bytes);
        }
        return addBufferMethods(new TextEncoder().encode(arg));
      }
      if (arg instanceof Uint8Array) {
        const result = addBufferMethods(new Uint8Array(arg.length));
        result.set(arg);
        return result;
      }
      if (Array.isArray(arg)) {
        const result = addBufferMethods(new Uint8Array(arg.length));
        for (let i = 0; i < arg.length; i++) {
          result[i] = arg[i];
        }
        return result;
      }
      return addBufferMethods(new Uint8Array(arg.length || 0));
    };

    _Buffer.from = function (arg, encoding) {
      return _Buffer(arg, encoding);
    };

    _Buffer.alloc = function (size) {
      return _Buffer(size);
    };

    _Buffer.allocUnsafe = function (size) {
      return _Buffer(size);
    };

    _Buffer.concat = function (list, totalLength) {
      if (!Array.isArray(list)) {
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      if (list.length === 0) {
        return _Buffer(0);
      }
      const len = totalLength || list.reduce((acc, buf) => acc + buf.length, 0);
      const result = _Buffer(len);
      let offset = 0;
      for (const buf of list) {
        result.set(buf, offset);
        offset += buf.length;
      }
      return result;
    };

    _Buffer.isBuffer = function (obj) {
      return obj instanceof Uint8Array && obj.writeBigUInt64LE !== undefined;
    };

    // Add toString, equals, compare, slice, copy to Uint8Array prototype
    if (!Uint8Array.prototype.toString) {
      Uint8Array.prototype.toString = function (encoding) {
        if (encoding === "base64") {
          let binary = "";
          for (let i = 0; i < this.length; i++) {
            binary += String.fromCharCode(this[i]);
          }
          return btoa(binary);
        }
        if (encoding === "hex") {
          return Array.from(this)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        }
        return new TextDecoder().decode(this);
      };
    }

    if (!Uint8Array.prototype.equals) {
      Uint8Array.prototype.equals = function (other) {
        if (this.length !== other.length) return false;
        for (let i = 0; i < this.length; i++) {
          if (this[i] !== other[i]) return false;
        }
        return true;
      };
    }

    if (!Uint8Array.prototype.compare) {
      Uint8Array.prototype.compare = function (
        other,
        targetStart,
        targetEnd,
        sourceStart,
        sourceEnd,
      ) {
        const a = this.slice(sourceStart || 0, sourceEnd || this.length);
        const b = other.slice(targetStart || 0, targetEnd || other.length);
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          if (a[i] < b[i]) return -1;
          if (a[i] > b[i]) return 1;
        }
        return a.length - b.length;
      };
    }

    if (!Uint8Array.prototype.copy) {
      Uint8Array.prototype.copy = function (
        target,
        targetStart,
        sourceStart,
        sourceEnd,
      ) {
        target.set(
          this.slice(sourceStart || 0, sourceEnd || this.length),
          targetStart || 0,
        );
        return Math.min(
          target.length - (targetStart || 0),
          (sourceEnd || this.length) - (sourceStart || 0),
        );
      };
    }

    window.Buffer = _Buffer;
  }
})();

// ============================================================================
// SPL Token Helpers (from lines 67-145 of original landing.ts)
// ============================================================================

const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOCIATED_TOKEN_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

const splToken = {
  async getAssociatedTokenAddress(mint, owner) {
    const { PublicKey } = solanaWeb3;
    // Handle both string and PublicKey inputs
    const ownerKey = typeof owner === "string" ? new PublicKey(owner) : owner;
    const mintKey = typeof mint === "string" ? new PublicKey(mint) : mint;
    // Use toBytes() for browser compatibility (toBuffer() requires Node.js Buffer)
    const [address] = await PublicKey.findProgramAddress(
      [
        ownerKey.toBytes ? ownerKey.toBytes() : ownerKey.toBuffer(),
        new PublicKey(SPL_TOKEN_PROGRAM_ID).toBytes
          ? new PublicKey(SPL_TOKEN_PROGRAM_ID).toBytes()
          : new PublicKey(SPL_TOKEN_PROGRAM_ID).toBuffer(),
        mintKey.toBytes ? mintKey.toBytes() : mintKey.toBuffer(),
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
    // Handle both string and PublicKey inputs
    const sourceKey =
      typeof source === "string" ? new PublicKey(source) : source;
    const mintKey = typeof mint === "string" ? new PublicKey(mint) : mint;
    const destKey =
      typeof destination === "string"
        ? new PublicKey(destination)
        : destination;
    const ownerKey = typeof owner === "string" ? new PublicKey(owner) : owner;
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
        { pubkey: sourceKey, isSigner: false, isWritable: true },
        { pubkey: mintKey, isSigner: false, isWritable: false },
        { pubkey: destKey, isSigner: false, isWritable: true },
        { pubkey: ownerKey, isSigner: true, isWritable: false },
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
    // Note: x402 v2 response uses 'amount' not 'maxAmountRequired'
    // CRITICAL: Use ALL fields from server's payment requirements
    const { amount, asset, payTo, maxTimeoutSeconds, extra } =
      paymentRequirements;
    const maxAmountRequired = amount; // For backward compatibility

    // Use the already-connected wallet address from global wallet variable
    // This avoids calling eth_requestAccounts again which can fail
    const from = wallet;
    if (!from) {
      throw new Error("No wallet connected. Please connect your wallet first.");
    }

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

    // Sign with MetaMask - use eth_signTypedData_v4
    let signature;
    try {
      signature = await provider.request({
        method: "eth_signTypedData_v4",
        params: [from, JSON.stringify(typedData)],
      });
    } catch (signError) {
      console.error("Signing error:", signError);
      throw new Error(
        "Failed to sign payment: " + (signError.message || signError),
      );
    }

    // Get the current page URL for the resource
    const resourceUrl = window.location.origin + "/v1/randomness";

    // Return x402 v2 payment payload format
    // CRITICAL: Must include ALL required fields per x402 spec
    return {
      x402Version: 2,
      resource: {
        url: resourceUrl,
        description: "TEE Randomness Request",
        mimeType: "application/json",
      },
      accepted: {
        scheme: "exact",
        network: network,
        amount: maxAmountRequired,
        asset: asset,
        payTo: payTo,
        maxTimeoutSeconds: maxTimeoutSeconds,
        extra: extra,
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

// Handle dropdown option selection
document.addEventListener("DOMContentLoaded", () => {
  const dropdownOptions = document.querySelectorAll(".dropdown-option");
  dropdownOptions.forEach((option) => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      const value = option.getAttribute("data-value");
      const text = option.textContent;

      // Update hidden input
      const hiddenInput = document.getElementById("op-type");
      if (hiddenInput) hiddenInput.value = value;

      // Update displayed text
      const selectedDiv = document.querySelector(".dropdown-selected");
      if (selectedDiv) selectedDiv.textContent = text;

      // Update selected class
      dropdownOptions.forEach((opt) => opt.classList.remove("selected"));
      option.classList.add("selected");

      // Close dropdown
      const dropdown = document.getElementById("op-dropdown");
      if (dropdown) dropdown.classList.remove("open");

      // Show/hide input fields based on operation type
      const inputsNumber = document.getElementById("inputs-number");
      const inputsDice = document.getElementById("inputs-dice");
      const inputsPick = document.getElementById("inputs-pick");
      const inputsShuffle = document.getElementById("inputs-shuffle");
      const inputsWinners = document.getElementById("inputs-winners");

      if (inputsNumber) inputsNumber.style.display = "none";
      if (inputsDice) inputsDice.style.display = "none";
      if (inputsPick) inputsPick.style.display = "none";
      if (inputsShuffle) inputsShuffle.style.display = "none";
      if (inputsWinners) inputsWinners.style.display = "none";

      if (value === "number" && inputsNumber) {
        inputsNumber.style.display = "block";
      } else if (value === "dice" && inputsDice) {
        inputsDice.style.display = "block";
      } else if (value === "pick" && inputsPick) {
        inputsPick.style.display = "block";
      } else if (value === "shuffle" && inputsShuffle) {
        inputsShuffle.style.display = "block";
      } else if (value === "winners" && inputsWinners) {
        inputsWinners.style.display = "block";
      }
    });
  });
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
    const opType = document.getElementById("op-type")?.value || "randomness";
    const passphrase =
      document.getElementById("in-passphrase")?.value || undefined;

    let endpoint = "/v1/randomness";
    let body = {};

    if (opType === "number") {
      endpoint = "/v1/random/number";
      const min = parseInt(document.getElementById("in-min")?.value) || 1;
      const max = parseInt(document.getElementById("in-max")?.value) || 100;
      body = { min, max };
    } else if (opType === "dice") {
      endpoint = "/v1/random/dice";
      const dice = document.getElementById("in-dice")?.value || "2d6";
      body = { dice };
    } else if (opType === "pick") {
      endpoint = "/v1/random/pick";
      const itemsStr = document.getElementById("in-items")?.value || "";
      const items = itemsStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      body = { items };
    } else if (opType === "shuffle") {
      endpoint = "/v1/random/shuffle";
      const itemsStr =
        document.getElementById("in-shuffle-items")?.value ||
        document.getElementById("in-items")?.value ||
        "";
      const items = itemsStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      body = { items };
    } else if (opType === "uuid") {
      endpoint = "/v1/random/uuid";
      body = {};
    } else if (opType === "winners") {
      endpoint = "/v1/random/winners";
      const itemsStr =
        document.getElementById("in-winners-items")?.value ||
        document.getElementById("in-items")?.value ||
        "";
      const items = itemsStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      const count = parseInt(document.getElementById("in-count")?.value) || 1;
      body = { items, count };
    }

    // Add passphrase if provided
    if (passphrase) {
      body.passphrase = passphrase;
    }

    const opLabels = {
      randomness: "randomness",
      number: "random number",
      dice: "dice roll",
      pick: "winner selection",
      shuffle: "shuffle",
      uuid: "UUID",
      winners: "winners selection",
    };
    log("Requesting " + (opLabels[opType] || opType) + "...");

    let response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Handle x402 payment required
    if (response.status === 402) {
      // Try both header name variations (x402 spec uses different cases)
      let paymentHeader = null;
      paymentHeader =
        paymentHeader ||
        response.headers.get("PAYMENT-REQUIRED") ||
        response.headers.get("payment-required");
      if (!paymentHeader) {
        // Also check lowercase
        for (const key of response.headers.keys()) {
          if (key.toLowerCase() === "payment-required") {
            paymentHeader = response.headers.get(key);
            break;
          }
        }
      }

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

        // Retry with payment - use PAYMENT-SIGNATURE header with base64 encoding
        const paymentPayload = btoa(JSON.stringify(payment));

        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "PAYMENT-SIGNATURE": paymentPayload,
          },
          body: JSON.stringify(body),
        });
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = "Request failed";

      // If 402, decode the payment-required header for more details
      if (response.status === 402) {
        const paymentErrHeader =
          response.headers.get("PAYMENT-REQUIRED") ||
          response.headers.get("payment-required");
        if (paymentErrHeader) {
          try {
            const paymentErr = JSON.parse(atob(paymentErrHeader));
            console.error("Payment error details:", paymentErr);
            errMsg = paymentErr.error || errMsg;
          } catch (e) {
            console.error("Could not decode payment error header");
          }
        }
      }

      try {
        const err = JSON.parse(errText);
        errMsg = err.error || err.message || errMsg;
      } catch {
        errMsg = errText.substring(0, 200) || errMsg;
      }
      console.error("Server error response:", errText);
      throw new Error(errMsg);
    }

    const data = await response.json();
    const successLabels = {
      randomness: "Randomness generated!",
      number: "Number generated!",
      dice: "Dice rolled!",
      pick: "Winner selected!",
      shuffle: "List shuffled!",
      uuid: "UUID generated!",
      winners: "Winners selected!",
    };
    log(successLabels[opType] || "Operation complete!", "success");

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
  const { Connection, PublicKey, Transaction, TransactionInstruction } =
    solanaWeb3;

  // Convert wallet string to PublicKey
  const walletPublicKey = new PublicKey(wallet);

  // Get the payment asset (USDC)
  const usdcMint = new PublicKey(paymentReq.asset);
  const paymentWallet = new PublicKey(paymentReq.payTo);

  // Get sender's token account - pass PublicKey, not string
  const senderATA = await splToken.getAssociatedTokenAddress(
    usdcMint,
    walletPublicKey,
  );

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

  // Get recipient's ATA (destination token account)
  // CRITICAL: Must send to the ATA, not the wallet address directly
  const destATA = await splToken.getAssociatedTokenAddress(
    usdcMint,
    paymentWallet,
  );

  // Create transfer instruction with correct destination ATA
  const amount = BigInt(paymentReq.amount);
  const transferIx = splToken.createTransferCheckedInstruction(
    senderATA,
    usdcMint,
    destATA, // Recipient's token account (NOT wallet address)
    walletPublicKey,
    amount,
    6, // USDC has 6 decimals
  );

  // Build and sign transaction - use FACILITATOR's feePayer (not user's wallet!)
  // The facilitator pays transaction fees, so it must be the feePayer
  const facilitatorFeePayer = paymentReq.extra?.feePayer;
  if (!facilitatorFeePayer) {
    throw new Error("No feePayer provided in payment requirements");
  }

  // CRITICAL: x402-svm requires compute budget instructions as first two instructions
  // Must be manually created for browser compatibility (ComputeBudgetProgram uses Node.js Buffer)
  // SetComputeUnitLimit: discriminator 0x02, 4-byte LE units (max 60000)
  // SetComputeUnitPrice: discriminator 0x03, 8-byte LE microLamports (max 5)
  const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey(
    "ComputeBudget111111111111111111111111111111",
  );

  // SetComputeUnitLimit: [0x02][4-byte LE units]
  const computeUnits = 20000; // Must be <= 60000 (MAX_COMPUTE_UNIT_LIMIT)
  const computeLimitData = new Uint8Array(5);
  computeLimitData[0] = 0x02; // SetComputeUnitLimit discriminator
  computeLimitData[1] = computeUnits & 0xff;
  computeLimitData[2] = (computeUnits >> 8) & 0xff;
  computeLimitData[3] = (computeUnits >> 16) & 0xff;
  computeLimitData[4] = (computeUnits >> 24) & 0xff;

  // SetComputeUnitPrice: [0x03][8-byte LE microLamports]
  const microLamports = BigInt(1); // Must be <= 5 (MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS)
  const computePriceData = new Uint8Array(9);
  computePriceData[0] = 0x03; // SetComputeUnitPrice discriminator
  for (let i = 0; i < 8; i++) {
    computePriceData[1 + i] = Number(
      (microLamports >> BigInt(i * 8)) & BigInt(0xff),
    );
  }

  const transaction = new Transaction()
    .add(
      new TransactionInstruction({
        keys: [],
        programId: COMPUTE_BUDGET_PROGRAM_ID,
        data: computeLimitData,
      }),
    )
    .add(
      new TransactionInstruction({
        keys: [],
        programId: COMPUTE_BUDGET_PROGRAM_ID,
        data: computePriceData,
      }),
    )
    .add(transferIx);

  transaction.feePayer = new PublicKey(facilitatorFeePayer);
  transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  // Sign with Phantom/Solflare - only signs the transfer instruction
  // The feePayer signature will be added by the facilitator
  const signedTx = await window.solana.signTransaction(transaction);

  // Serialize as PARTIALLY-signed transaction
  // The facilitator will add the feePayer signature
  // CRITICAL: requireAllSignatures: false allows missing feePayer signature
  const serialized = signedTx.serialize({
    requireAllSignatures: false,
  });
  const base64 = btoa(String.fromCharCode(...new Uint8Array(serialized)));

  // Get the current page URL for the resource
  const resourceUrl = window.location.origin + "/v1/randomness";

  return {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description: "TEE Randomness Request",
      mimeType: "application/json",
    },
    accepted: {
      scheme: "exact",
      network: paymentReq.network,
      amount: paymentReq.amount,
      asset: paymentReq.asset,
      payTo: paymentReq.payTo,
      maxTimeoutSeconds: paymentReq.maxTimeoutSeconds,
      extra: paymentReq.extra,
    },
    payload: {
      transaction: base64,
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

    // Check for valid attestation data (quote_hex or verified flag)
    if (data.quote_hex || data.verified === true) {
      log("Attestation verified!", "success");
      if (verifyRes) {
        verifyRes.style.display = "block";
        verifyRes.innerHTML =
          '<span style="color:var(--success)">✓ Hardware attestation is valid</span>';
      }
    } else if (data.tee_type === "simulation") {
      log("Running in simulation mode", "info");
      if (verifyRes) {
        verifyRes.style.display = "block";
        verifyRes.innerHTML =
          '<span style="color:var(--text-muted)">⚠ Simulation mode - no hardware attestation</span>';
      }
    } else {
      throw new Error("No attestation data available");
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

    const attestationData = {
      tee_type: data.tee_type,
      verified: data.verified,
      app_id: data.app_id,
      compose_hash: data.compose_hash,
      instance_id: data.instance_id,
      quote_hex: data.quote_hex,
      event_log: data.event_log,
      verification: data.verification,
      timestamp: new Date().toISOString(),
    };

    if (data.quote_hex || data.verified) {
      const blob = new Blob([JSON.stringify(attestationData, null, 2)], {
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

// Download Arweave proof (called from receipt modal)
async function downloadArweaveProof(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "arweave-proof.json";
    a.click();
    URL.revokeObjectURL(blobUrl);
    log("Proof downloaded!", "success");
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
  const opType = data.operation || "randomness";

  if (opType === "number" && data.number !== undefined) {
    resultHtml = `
      <div class="receipt-result">${data.number}</div>
      <div style="text-align:center; font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">
        Range: ${data.min} - ${data.max}
      </div>`;
  } else if (opType === "dice" && data.rolls) {
    resultHtml = `
      <div class="receipt-result">${data.total}</div>
      <div style="text-align:center; font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">
        ${data.dice}: [${data.rolls.join(", ")}] (min: ${data.min_possible}, max: ${data.max_possible})
      </div>`;
  } else if (opType === "pick" && data.picked !== undefined) {
    resultHtml = `
      <div class="receipt-result" style="font-size:1.2rem;">${data.picked}</div>
      <div style="text-align:center; font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">
        Index ${data.index} of ${data.total_items} items
      </div>`;
  } else if (opType === "shuffle" && data.shuffled) {
    const display =
      data.shuffled.length > 10
        ? data.shuffled.slice(0, 10).join(", ") + "..."
        : data.shuffled.join(", ");
    resultHtml = `
      <div style="background:rgba(0,0,0,0.3); border:1px solid var(--panel-border); border-radius:8px; padding:1rem; margin:0.5rem 0;">
        <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.5rem;">SHUFFLED ORDER</div>
        <div style="font-size:0.85rem; color:var(--text-main); word-break:break-all;">${display}</div>
        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.5rem;">${data.shuffled.length} items</div>
      </div>`;
  } else if (opType === "uuid" && data.uuid) {
    resultHtml = `
      <div style="background:rgba(0,0,0,0.3); border:1px solid var(--panel-border); border-radius:8px; padding:1rem; margin:0.5rem 0; position:relative;">
        <input type="text" class="receipt-seed-input" value="${data.uuid}" readonly style="font-size:0.85rem;">
        <button class="receipt-copy-btn" onclick="navigator.clipboard.writeText('${data.uuid}')">
          <iconify-icon icon="ph:copy-bold"></iconify-icon>
        </button>
      </div>`;
  } else if (opType === "winners" && data.winners) {
    const winnerList = data.winners
      .map(
        (w) =>
          `<div style="display:flex; justify-content:space-between; padding:0.4rem 0; border-bottom:1px solid var(--panel-border);">
        <span style="color:var(--accent);">#${w.position}</span>
        <span style="color:var(--text-main);">${w.item}</span>
      </div>`,
      )
      .join("");
    resultHtml = `
      <div style="margin:0.5rem 0;">
        <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.5rem;">WINNERS (${data.count} of ${data.total_items})</div>
        ${winnerList}
      </div>`;
  } else if (data.random_seed) {
    resultHtml = `
      <div style="text-align:center; margin: 1rem 0;">
        <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.5rem;">RANDOM SEED (256-bit)</div>
        <div style="position:relative;">
          <input type="text" class="receipt-seed-input" value="${data.random_seed}" readonly>
          <button class="receipt-copy-btn" onclick="navigator.clipboard.writeText('${data.random_seed}')">
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
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <a href="${data.commitment.arweave_url}" target="_blank" class="receipt-link">
            ${(data.commitment.arweave_tx || data.commitment.arweave_tx_id)?.slice(0, 8) || "View"}...<iconify-icon icon="ph:arrow-square-out-bold"></iconify-icon>
          </a>
          <button onclick="downloadArweaveProof('${data.commitment.arweave_url}')"
                  style="background:none; border:none; cursor:pointer; color:var(--text-muted); padding:0.25rem;"
                  title="Download proof">
            <iconify-icon icon="ph:download-simple-bold"></iconify-icon>
          </button>
        </div>
      </div>
      <div class="receipt-row">
        <span class="receipt-label">Encrypted</span>
        <span class="receipt-value">${data.commitment.encrypted ? "Yes" : "No"}</span>
      </div>
      <div class="receipt-row">
        <span class="receipt-label">Commitment Hash</span>
        <span class="receipt-value">${(data.commitment.commitment_hash || data.commitment.hash || "")?.slice(0, 16)}...</span>
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
        <span class="receipt-value highlight">${opType.toUpperCase()}</span>
      </div>
      <div class="receipt-row">
        <span class="receipt-label">Network</span>
        <span class="receipt-value">${selectedNetwork.toUpperCase()}</span>
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
        hashEl.innerText = data.compose_hash
          ? data.compose_hash.slice(0, 8)
          : data.app_id
            ? data.app_id.slice(0, 8)
            : "N/A";
      }
    })
    .catch(() => {
      const hashEl = document.getElementById("compose-hash");
      if (hashEl) hashEl.innerText = "Failed to load";
    });
})();
