function setAttestationClass(el, status) {
  if (!el) return;
  el.classList.remove("verified", "failed", "unknown");
  if (status) el.classList.add(status);
}

function checkLabel(value) {
  if (value === "verified") return "Verified";
  if (value === "failed") return "Failed";
  if (value === "unavailable") return "Unavailable";
  return "Unknown";
}

function checkClass(value) {
  if (value === "verified") return "verified";
  if (value === "failed" || value === "unavailable") return "failed";
  return "unknown";
}

function updateCheckState(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerText = checkLabel(value);
  setAttestationClass(el, checkClass(value));
}

function updateAttestationDisplay(data) {
  if (typeof updateTeeIdentity === "function") {
    updateTeeIdentity(data || {});
  }

  const verified = data && data.verified === true;
  const failed =
    data &&
    (data.status === "failed" || data.error || data.verified === false);
  const pill = document.getElementById("attestation-pill");
  const pillText = document.getElementById("attestation-pill-text");
  const summaryTitle = document.getElementById("attestation-summary-title");
  const summaryDetail = document.getElementById("attestation-summary-detail");
  const summaryBadge = document.getElementById("attestation-summary-badge");
  const lastChecked = document.getElementById("attestation-last-checked");
  const verifyRes = document.getElementById("verify-res");

  setAttestationClass(pill, verified ? "verified" : failed ? "failed" : "");
  setAttestationClass(
    summaryBadge,
    verified ? "verified" : failed ? "failed" : "",
  );

  if (pillText) {
    pillText.innerText = verified
      ? "TEE VERIFIED"
      : failed
        ? "TEE UNVERIFIED"
        : "VERIFYING TEE";
  }

  if (summaryBadge) {
    summaryBadge.innerText = verified
      ? "Verified"
      : failed
        ? "Unverified"
        : "Checking";
  }

  if (summaryTitle) {
    summaryTitle.innerText = verified
      ? "TEE verified"
      : failed
        ? "TEE not fully verified"
        : "Verifying confidential compute";
  }

  if (summaryDetail) {
    if (verified) {
      const compose = data.compose_hash
        ? data.compose_hash.slice(0, 12)
        : "unknown";
      summaryDetail.innerText =
        "Intel TDX hardware, service identity, and nonce-bound quote verified. Compose " +
        compose +
        ".";
    } else if (failed) {
      summaryDetail.innerText =
        data.error ||
        "One of the hardware, software identity, or freshness checks did not pass.";
    } else {
      summaryDetail.innerText =
        "Fetching a fresh TDX quote and checking it against Phala Cloud attestation.";
    }
  }

  const checks = (data && data.checks) || {};
  updateCheckState("attestation-hardware-state", checks.confidential_hardware);
  updateCheckState("attestation-software-state", checks.verified_software);
  updateCheckState("attestation-freshness-state", checks.fresh_quote);

  if (lastChecked) {
    lastChecked.innerText =
      data && data.checked_at
        ? new Date(data.checked_at).toLocaleTimeString()
        : "Pending";
  }

  if (verifyRes) {
    if (verified) {
      verifyRes.innerText =
        "Verified by Phala Cloud Attestation API at " +
        new Date(data.checked_at).toLocaleString() +
        ". Report data: " +
        (data.report_data_hex || "").slice(0, 16) +
        "...";
    } else if (failed) {
      verifyRes.innerText =
        "Verification failed: " +
        (data.error || "quote, software identity, or freshness check failed");
    } else {
      verifyRes.innerText = "Verification is running automatically.";
    }
  }
}

async function loadAttestationStatus(options = {}) {
  if (options.manual && typeof log === "function") {
    log("Verifying live TEE attestation...", "info");
  }
  try {
    const nonce =
      (window.crypto &&
        window.crypto.randomUUID &&
        window.crypto.randomUUID()) ||
      String(Date.now()) + "-" + Math.random().toString(16).slice(2);
    const response = await fetch(
      "/v1/attestation/status?nonce=" + encodeURIComponent(nonce),
      { cache: "no-store" },
    );
    const data = await response.json();
    updateAttestationDisplay(data);

    if (!response.ok) {
      throw new Error(data.error || "TEE attestation did not verify");
    }

    if (options.manual && typeof log === "function") {
      if (data.verified === true) {
        log("TEE attestation verified", "success");
      } else {
        log("TEE attestation is not fully verified", "error");
      }
    }
    return data;
  } catch (e) {
    updateAttestationDisplay({
      status: "failed",
      verified: false,
      error: e.message,
      checked_at: new Date().toISOString(),
      checks: {
        confidential_hardware: "failed",
        verified_software: "unknown",
        fresh_quote: "failed",
      },
    });
    if (options.manual && typeof log === "function") {
      log("Verification failed: " + e.message, "error");
    }
    throw e;
  }
}

async function verify() {
  try {
    await loadAttestationStatus({ manual: true });
  } catch {
    // loadAttestationStatus already updates UI and logs the error.
  }
}

async function downloadAttestation() {
  if (typeof log === "function") log("Fetching attestation...", "info");
  try {
    const response = await fetch("/v1/attestation/status", {
      cache: "no-store",
    });
    const data = await response.json();

    const attestationData = {
      tee_type: data.tee_type,
      verified: data.verified,
      status: data.status,
      app_id: data.app_id,
      compose_hash: data.compose_hash,
      instance_id: data.instance_id,
      quote_hex: data.quote_hex,
      event_log: data.event_log,
      nonce: data.nonce,
      report_data_hex: data.report_data_hex,
      checks: data.checks,
      verification: data.verification,
      verification_result: data.verification_result,
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
      if (typeof log === "function") log("Attestation downloaded!", "success");
    } else {
      throw new Error("No attestation available");
    }
  } catch (e) {
    if (typeof log === "function") log("Download failed: " + e.message, "error");
  }
}

window.TeeAttestation = {
  update: updateAttestationDisplay,
  refresh: loadAttestationStatus,
  verify,
  download: downloadAttestation,
};

window.verify = verify;
window.downloadAttestation = downloadAttestation;

document.addEventListener("DOMContentLoaded", () => {
  loadAttestationStatus().catch(() => {});
});
