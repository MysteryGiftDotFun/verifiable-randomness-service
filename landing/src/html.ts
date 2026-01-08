
// Helper for simple static pages (Terms, Privacy)
export function renderStaticPage(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | MYSTERY GIFT</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sometype+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg: #09090b;
      --panel-bg: rgba(20, 20, 23, 0.85);
      --panel-border: rgba(255, 255, 255, 0.08);
      --text-main: #FAFAFA;
      --text-muted: #A1A1AA;
      --accent: #FF4D00;
      --font: 'Sometype Mono', monospace;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font);
      background-color: var(--bg);
      color: var(--text-main);
      min-height: 100vh;
      /* Question Mark Texture */
      background-image: url("data:image/svg+xml,%3Csvg width='400' height='400' viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cstyle%3Etext { font-family: monospace; fill: %23ffffff; opacity: 0.02; font-weight: bold; user-select: none; }%3C/style%3E%3Ctext x='50' y='80' font-size='120' transform='rotate(15 50,80)'%3E?%3C/text%3E%3Ctext x='300' y='150' font-size='80' transform='rotate(-20 300,150)'%3E?%3C/text%3E%3Ctext x='150' y='300' font-size='160' transform='rotate(10 150,300)'%3E?%3C/text%3E%3Ctext x='350' y='350' font-size='60' transform='rotate(30 350,350)'%3E?%3C/text%3E%3Ctext x='100' y='200' font-size='40' opacity='0.04' transform='rotate(-45 100,200)'%3E?%3C/text%3E%3Ctext x='250' y='50' font-size='90' transform='rotate(5 250,50)'%3E?%3C/text%3E%3Ctext x='20' y='380' font-size='70' transform='rotate(-15 20,380)'%3E?%3C/text%3E%3C/svg%3E");
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 3rem 2rem;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.85rem;
      margin-bottom: 2rem;
      transition: color 0.2s;
    }

    .back-link:hover {
      color: var(--accent);
    }

    .content-card {
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 2.5rem;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: -0.02em;
    }

    .subtitle {
      color: var(--accent);
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 2rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    h2 {
      font-size: 1.1rem;
      font-weight: 600;
      margin-top: 2rem;
      margin-bottom: 1rem;
      color: var(--text-main);
    }

    p, li {
      font-size: 0.9rem;
      line-height: 1.7;
      color: var(--text-muted);
      margin-bottom: 1rem;
    }

    ul {
      padding-left: 1.5rem;
      margin-bottom: 1rem;
    }

    li {
      margin-bottom: 0.5rem;
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .footer {
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.75rem;
    }

    .footer a {
      color: var(--text-muted);
      margin: 0 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">&larr; Back to Home</a>
    <div class="content-card">
      ${content}
    </div>
  </div>
  <div class="footer">
    &copy; 2026 MYSTERY GIFT &bull; <a href="/terms">Terms</a> &bull; <a href="/privacy">Privacy</a> &bull; <a href="https://x.com/mysterygift_fun" target="_blank">X</a>
  </div>
</body>
</html>
  `;
}

export const TERMS_CONTENT = `
    <h1>Terms of Service</h1>
    <div class="subtitle">Last Updated: January 2026</div>
    
    <h2>1. Acceptance of Terms</h2>
    <p>By accessing or using the Mystery Gift TEE Randomness Service ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.</p>
    
    <h2>2. Description of Service</h2>
    <p>Mystery Gift provides a verifiable randomness service running inside an Intel TDX Trusted Execution Environment (TEE). The Service generates cryptographically secure random numbers with remote attestation proofs.</p>
    
    <h2>3. Payment Terms</h2>
    <p>The Service operates on a pay-per-request model using the x402 protocol:</p>
    <ul>
      <li>Standard rate: $0.01 USD per request</li>
      <li>Payments accepted in USDC or SOL on Solana</li>
      <li>All payments are final and non-refundable</li>
      <li>API key holders may access the service without per-request payments</li>
    </ul>
    
    <h2>4. Permitted Use</h2>
    <p>You may use the Service for:</p>
    <ul>
      <li>NFT mints and digital collectibles</li>
      <li>Gaming and lottery applications</li>
      <li>Fair selection and raffle systems</li>
      <li>Any lawful purpose requiring verifiable randomness</li>
    </ul>
    
    <h2>5. Prohibited Use</h2>
    <p>You may not use the Service for:</p>
    <ul>
      <li>Any illegal gambling activities in your jurisdiction</li>
      <li>Fraudulent or deceptive practices</li>
      <li>Attempting to compromise or exploit the TEE environment</li>
      <li>Denial of service attacks or abuse</li>
    </ul>
    
    <h2>6. Disclaimer of Warranties</h2>
    <p>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. We do not guarantee uninterrupted service availability. While the TEE provides hardware-level security guarantees, we make no warranty regarding fitness for any particular purpose.</p>
    
    <h2>7. Limitation of Liability</h2>
    <p>IN NO EVENT SHALL MYSTERY GIFT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM USE OF THE SERVICE.</p>
    
    <h2>8. Changes to Terms</h2>
    <p>We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>
    
    <h2>9. Contact</h2>
    <p>For questions about these Terms, contact us on <a href="https://x.com/mysterygift_fun" target="_blank">X</a>.</p>
`;

export const PRIVACY_CONTENT = `
    <h1>Privacy Policy</h1>
    <div class="subtitle">Last Updated: January 2026</div>
    
    <h2>1. Information We Collect</h2>
    <p>When you use the Mystery Gift TEE Randomness Service, we may collect:</p>
    <ul>
      <li><strong>Wallet Addresses:</strong> Public Solana wallet addresses used for payments</li>
      <li><strong>Transaction Data:</strong> Payment transaction signatures for verification</li>
      <li><strong>Request Metadata:</strong> Timestamps, request types, and attestation data</li>
      <li><strong>Technical Data:</strong> IP addresses and request headers for security purposes</li>
    </ul>
    
    <h2>2. How We Use Information</h2>
    <p>We use collected information to:</p>
    <ul>
      <li>Process and verify payments</li>
      <li>Prevent fraud and replay attacks</li>
      <li>Generate usage statistics (anonymized)</li>
      <li>Improve and maintain the Service</li>
    </ul>
    
    <h2>3. TEE Security</h2>
    <p>All randomness generation occurs within an Intel TDX Trusted Execution Environment. This means:</p>
    <ul>
      <li>Random seeds are generated in hardware-isolated memory</li>
      <li>Even service operators cannot access or predict random values</li>
      <li>Remote attestation proves the integrity of the execution environment</li>
    </ul>
    
    <h2>4. Data Retention</h2>
    <p>We retain:</p>
    <ul>
      <li>Payment signatures: 1 hour (for replay attack prevention)</li>
      <li>Usage statistics: Aggregated and anonymized, retained indefinitely</li>
      <li>Error logs: 30 days for debugging purposes</li>
    </ul>
    
    <h2>5. Data Sharing</h2>
    <p>We do not sell or share your personal information with third parties, except:</p>
    <ul>
      <li>When required by law</li>
      <li>To prevent fraud or security threats</li>
      <li>Anonymized, aggregated statistics may be shared publicly</li>
    </ul>
    
    <h2>6. Blockchain Transparency</h2>
    <p>Please note that Solana blockchain transactions are public. Wallet addresses and transaction data are visible on the public blockchain regardless of our privacy practices.</p>
    
    <h2>7. Your Rights</h2>
    <p>You have the right to:</p>
    <ul>
      <li>Access information we hold about your wallet address</li>
      <li>Request deletion of non-essential data</li>
      <li>Opt out of non-essential data collection</li>
    </ul>
    
    <h2>8. Changes to Policy</h2>
    <p>We may update this Privacy Policy periodically. Changes will be posted on this page with an updated revision date.</p>
    
    <h2>9. Contact</h2>
    <p>For privacy-related inquiries, contact us on <a href="https://x.com/mysterygift_fun" target="_blank">X</a>.</p>
`;
