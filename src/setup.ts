#!/usr/bin/env node
import "dotenv/config";
import { createServer } from "node:http";
import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const PORT = 3000;
const CALLBACK_PATH = "/callback";
const REDIRECT_URI = `http://localhost:${PORT}${CALLBACK_PATH}`;
const TOKEN_ENDPOINT = "https://b2b.revolut.com/api/1.0/auth/token";
const JWT_TTL_SECONDS = 300;

function normalizePrivateKey(rawValue: string): string {
  let value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  value = value.replace(/\\n/g, "\n");
  if (value.includes("-----BEGIN")) return value;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    if (decoded.includes("-----BEGIN")) return decoded;
  } catch {
    // fall through
  }
  return value;
}

async function signJwt(
  clientId: string,
  issuer: string,
  audience: string,
  privateKeyRaw: string
): Promise<string> {
  const key = createPrivateKey({ key: normalizePrivateKey(privateKeyRaw) });
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: issuer,
    sub: clientId,
    aud: audience,
    iat: now,
    exp: now + JWT_TTL_SECONDS,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .sign(key);
}

async function exchangeCode(
  code: string,
  clientId: string,
  clientAssertion: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return response.json();
}

function openBrowser(url: string): void {
  try {
    if (process.platform === "darwin") {
      execSync(`open "${url}"`);
    } else if (process.platform === "linux") {
      execSync(`xdg-open "${url}"`);
    } else {
      execSync(`start "${url}"`);
    }
  } catch {
    // If open fails, user can copy the URL manually
  }
}

async function main(): Promise<void> {
  const clientId = process.env.REVOLUT_CLIENT_ID;
  const privateKey = process.env.REVOLUT_PRIVATE_KEY;
  const issuer = process.env.REVOLUT_ISS;
  const audience = process.env.REVOLUT_AUD || "https://revolut.com";

  const missing = [
    !clientId && "REVOLUT_CLIENT_ID",
    !privateKey && "REVOLUT_PRIVATE_KEY",
    !issuer && "REVOLUT_ISS",
  ].filter(Boolean);

  if (missing.length > 0) {
    console.error(
      `\nMissing required environment variables: ${missing.join(", ")}\n`
    );
    console.error("Create a .env file with these values first:");
    console.error("  REVOLUT_CLIENT_ID=your_client_id");
    console.error(
      '  REVOLUT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"'
    );
    console.error("  REVOLUT_ISS=https://your-domain.com\n");
    process.exit(1);
  }

  const consentUrl =
    `https://business.revolut.com/app-confirm` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code`;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("Missing authorization code");
      return;
    }

    try {
      console.log("\nReceived authorization code. Exchanging for tokens...");

      const clientAssertion = await signJwt(
        clientId!,
        issuer!,
        audience,
        privateKey!
      );
      const tokens = await exchangeCode(code, clientId!, clientAssertion);

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body><h1>Done!</h1><p>You can close this tab and return to the terminal.</p></body></html>"
      );

      console.log("\n=== OAuth setup complete ===\n");
      console.log(`Access token:  ${tokens.access_token.slice(0, 20)}...`);
      console.log(`Refresh token: ${tokens.refresh_token}`);
      console.log(`Expires in:    ${tokens.expires_in}s\n`);

      // Auto-append to .env if it exists
      const envPath = ".env";
      if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, "utf8");
        if (envContent.includes("REVOLUT_REFRESH_TOKEN")) {
          const updated = envContent.replace(
            /REVOLUT_REFRESH_TOKEN=.*/,
            `REVOLUT_REFRESH_TOKEN=${tokens.refresh_token}`
          );
          writeFileSync(envPath, updated);
          console.log("Updated REVOLUT_REFRESH_TOKEN in .env\n");
        } else {
          writeFileSync(
            envPath,
            envContent.trimEnd() +
              `\nREVOLUT_REFRESH_TOKEN=${tokens.refresh_token}\n`
          );
          console.log("Added REVOLUT_REFRESH_TOKEN to .env\n");
        }
      } else {
        console.log("Add this to your .env or MCP config:");
        console.log(`  REVOLUT_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      }

      server.close();
      process.exit(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(`<html><body><h1>Error</h1><pre>${message}</pre></body></html>`);
      console.error(`\nToken exchange failed: ${message}\n`);
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log("\n=== Revolut OAuth Setup ===\n");
    console.log(`Callback server listening on http://localhost:${PORT}`);
    console.log("\nOpening Revolut authorization page...\n");
    console.log(`If it doesn't open, visit:\n${consentUrl}\n`);
    console.log("Waiting for authorization...");
    openBrowser(consentUrl);
  });
}

main();
