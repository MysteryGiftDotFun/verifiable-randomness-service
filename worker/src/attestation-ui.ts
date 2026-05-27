export function renderTeeAttestationStyles(): string {
  return `
    .tee-status-card { border-color:var(--accent-glow); background:linear-gradient(135deg, rgba(255,77,0,0.1), rgba(0,0,0,0.2)); }
    .tee-status-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:0.9rem; }
    .tee-status-title { font-size:0.95rem; color:var(--text-main); font-weight:700; margin-bottom:0.25rem; }
    .tee-status-detail { font-size:0.75rem; color:var(--text-muted); line-height:1.45; }
    .tee-status-badge { flex-shrink:0; display:inline-flex; align-items:center; gap:0.4rem; padding:0.35rem 0.55rem; border-radius:6px; border:1px solid var(--panel-border); color:var(--text-muted); font-size:0.68rem; font-weight:700; text-transform:uppercase; }
    .tee-status-badge.verified { color:var(--accent); border-color:var(--accent-glow); background:rgba(255,77,0,0.1); }
    .tee-status-badge.failed { color:#F87171; border-color:rgba(248,113,113,0.35); background:rgba(248,113,113,0.08); }
    .tee-check-grid { display:grid; grid-template-columns:1fr; gap:0.45rem; }
    .tee-check-row { display:flex; justify-content:space-between; align-items:center; gap:0.75rem; font-size:0.76rem; color:var(--text-muted); }
    .tee-check-value { color:var(--text-muted); font-weight:700; text-align:right; }
    .tee-check-value.verified { color:var(--accent); }
    .tee-check-value.failed { color:#F87171; }
    .tee-check-value.unknown { color:#FBBF24; }
    .tee-status-actions { display:flex; gap:0.6rem; margin-top:0.9rem; flex-wrap:wrap; }
    .tee-status-actions .std-btn { flex:1 1 9rem; min-width:0; }
    .tee-quote-actions { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:0.6rem; margin-top:0.6rem; }
    .tee-quote-actions .std-btn { width:100%; min-width:0; }
    .tee-quote-head { display:flex; align-items:center; justify-content:space-between; gap:0.75rem; margin:0.95rem 0 0.4rem; }
    .tee-quote-label { color:var(--text-muted); font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; }
    .tee-quote-meta { color:var(--text-muted); font-size:0.68rem; text-align:right; }
    .tee-quote-snippet { max-height:180px; overflow:auto; margin:0; padding:0.75rem; border:1px solid var(--panel-border); border-radius:8px; background:rgba(0,0,0,0.42); color:var(--text-main); font-size:0.68rem; line-height:1.45; white-space:pre-wrap; word-break:break-all; }
    .tee-quote-code { font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
    @media (max-width:420px) { .tee-quote-actions { grid-template-columns:1fr; } }
    .tee-link { color:var(--accent); text-decoration:none; font-size:0.75rem; }
    .tee-link:hover { text-decoration:underline; }
  `;
}

export function renderTeeAttestationPill(): string {
  return "";
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
            <div class="tee-status-actions">
              <button class="std-btn" onclick="window.TeeAttestation.verify()">
                <iconify-icon icon="ph:seal-check-fill" style="vertical-align:text-bottom; margin-right:4px;"></iconify-icon>
                Verify Again
              </button>
            </div>
            <div class="tee-quote-actions">
              <button class="std-btn" onclick="window.TeeAttestation.download()">
                <iconify-icon icon="ph:download-simple-bold" style="vertical-align:text-bottom; margin-right:4px;"></iconify-icon>
                Download Attestation Quote
              </button>
              <button class="std-btn" onclick="window.TeeAttestation.copyQuote()">
                <iconify-icon icon="ph:copy-simple-bold" style="vertical-align:text-bottom; margin-right:4px;"></iconify-icon>
                Copy Quote
              </button>
            </div>
            <div class="tee-quote-head">
              <span class="tee-quote-label">TDX Quote Hex</span>
              <span class="tee-quote-meta" id="attestation-quote-meta">Waiting for live quote</span>
            </div>
            <pre class="tee-quote-snippet"><code class="tee-quote-code" id="attestation-quote-code">Waiting for live attestation quote...</code></pre>
          </div>`;
}
