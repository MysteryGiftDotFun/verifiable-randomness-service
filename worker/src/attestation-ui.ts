export function renderTeeAttestationStyles(): string {
  return `
    .attestation-pill { position:absolute; top:1.5rem; left:1.5rem; z-index:100; display:inline-flex; align-items:center; gap:0.45rem; padding:0.55rem 0.75rem; border-radius:999px; border:1px solid var(--panel-border); background:rgba(9,9,11,0.72); color:var(--text-muted); font-size:0.72rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; backdrop-filter: blur(12px); }
    .attestation-pill.verified { color:#34D399; border-color:rgba(52,211,153,0.35); background:rgba(5,46,22,0.42); }
    .attestation-pill.failed { color:#F87171; border-color:rgba(248,113,113,0.35); background:rgba(69,10,10,0.42); }
    .attestation-dot { width:8px; height:8px; border-radius:999px; background:var(--text-muted); box-shadow:0 0 14px currentColor; }
    .attestation-pill.verified .attestation-dot { background:#34D399; }
    .attestation-pill.failed .attestation-dot { background:#F87171; }
    .tee-status-card { border-color:rgba(52,211,153,0.24); background:linear-gradient(135deg, rgba(52,211,153,0.08), rgba(0,0,0,0.2)); }
    .tee-status-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:0.9rem; }
    .tee-status-title { font-size:0.95rem; color:var(--text-main); font-weight:700; margin-bottom:0.25rem; }
    .tee-status-detail { font-size:0.75rem; color:var(--text-muted); line-height:1.45; }
    .tee-status-badge { flex-shrink:0; display:inline-flex; align-items:center; gap:0.4rem; padding:0.35rem 0.55rem; border-radius:6px; border:1px solid var(--panel-border); color:var(--text-muted); font-size:0.68rem; font-weight:700; text-transform:uppercase; }
    .tee-status-badge.verified { color:#34D399; border-color:rgba(52,211,153,0.35); background:rgba(52,211,153,0.08); }
    .tee-status-badge.failed { color:#F87171; border-color:rgba(248,113,113,0.35); background:rgba(248,113,113,0.08); }
    .tee-check-grid { display:grid; grid-template-columns:1fr; gap:0.45rem; }
    .tee-check-row { display:flex; justify-content:space-between; align-items:center; gap:0.75rem; font-size:0.76rem; color:var(--text-muted); }
    .tee-check-value { color:var(--text-muted); font-weight:700; text-align:right; }
    .tee-check-value.verified { color:#34D399; }
    .tee-check-value.failed { color:#F87171; }
    .tee-check-value.unknown { color:#FBBF24; }
    .tee-status-actions { display:flex; gap:0.6rem; margin-top:0.9rem; flex-wrap:wrap; }
    .tee-link { color:var(--accent); text-decoration:none; font-size:0.75rem; }
    .tee-link:hover { text-decoration:underline; }
  `;
}

export function renderTeeAttestationPill(): string {
  return `
      <div class="attestation-pill" id="attestation-pill">
        <span class="attestation-dot"></span>
        <span id="attestation-pill-text">VERIFYING TEE</span>
      </div>`;
}

export function renderTeeAttestationStatusCard(): string {
  return `
          <div class="card tee-status-card">
            <div class="tee-status-head">
              <div>
                <div class="tee-status-title" id="attestation-summary-title">Verifying confidential compute</div>
                <div class="tee-status-detail" id="attestation-summary-detail">
                  Fetching a fresh TDX quote and checking it against Phala Cloud attestation.
                </div>
              </div>
              <div class="tee-status-badge" id="attestation-summary-badge">Checking</div>
            </div>
            <div class="tee-check-grid">
              <div class="tee-check-row">
                <span>Confidential Hardware</span>
                <span class="tee-check-value" id="attestation-hardware-state">Checking</span>
              </div>
              <div class="tee-check-row">
                <span>Verified Software</span>
                <span class="tee-check-value" id="attestation-software-state">Checking</span>
              </div>
              <div class="tee-check-row">
                <span>Fresh Quote</span>
                <span class="tee-check-value" id="attestation-freshness-state">Checking</span>
              </div>
              <div class="tee-check-row">
                <span>Last Checked</span>
                <span class="tee-check-value" id="attestation-last-checked">Pending</span>
              </div>
            </div>
          </div>`;
}

export function renderTeeAttestationAuditCard(): string {
  return `
          <div class="card tee-status-card">
            <span class="card-label" style="color:var(--accent);">Live Verification</span>
            <p style="font-size:0.8rem; color:var(--text-muted); line-height:1.6; margin-bottom:0.8rem;">
              This check generates a fresh TDX quote, verifies the hardware signature, confirms the running service identity, and binds the quote to a nonce.
            </p>
            <div id="verify-res" class="hash-display" style="font-size:0.72rem; margin-bottom:0.8rem;">Verification is running automatically.</div>
            <button class="std-btn" style="width:100%;" onclick="verify()">
              <iconify-icon icon="ph:seal-check-fill" style="vertical-align:text-bottom; margin-right:4px;"></iconify-icon>
              Verify Again
            </button>
          </div>`;
}
