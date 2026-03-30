#!/usr/bin/env node
import "dotenv/config";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

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
  redirectUri: string,
  clientAssertion: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
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

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function saveRefreshToken(refreshToken: string): void {
  const envPath = ".env";
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf8");
    if (envContent.includes("REVOLUT_REFRESH_TOKEN")) {
      const updated = envContent.replace(
        /REVOLUT_REFRESH_TOKEN=.*/,
        `REVOLUT_REFRESH_TOKEN=${refreshToken}`
      );
      writeFileSync(envPath, updated);
      console.log("Updated REVOLUT_REFRESH_TOKEN in .env\n");
    } else {
      writeFileSync(
        envPath,
        envContent.trimEnd() +
          `\nREVOLUT_REFRESH_TOKEN=${refreshToken}\n`
      );
      console.log("Added REVOLUT_REFRESH_TOKEN to .env\n");
    }
  } else {
    console.log("Add this to your .env or MCP config:");
    console.log(`  REVOLUT_REFRESH_TOKEN=${refreshToken}\n`);
  }
}

async function handleTokens(
  code: string,
  clientId: string,
  redirectUri: string,
  issuer: string,
  audience: string,
  privateKey: string
): Promise<void> {
  console.log("\nExchanging authorization code for tokens...");
  const clientAssertion = await signJwt(clientId, issuer, audience, privateKey);
  const tokens = await exchangeCode(code, clientId, redirectUri, clientAssertion);

  console.log("\n=== OAuth setup complete ===\n");
  console.log(`Access token:  ${tokens.access_token.slice(0, 20)}...`);
  console.log(`Refresh token: ${tokens.refresh_token}`);
  console.log(`Expires in:    ${tokens.expires_in}s\n`);

  saveRefreshToken(tokens.refresh_token);
}

async function main(): Promise<void> {
  const clientId = process.env.REVOLUT_CLIENT_ID;
  const privateKey = process.env.REVOLUT_PRIVATE_KEY;
  const issuer = process.env.REVOLUT_ISS;
  const audience = process.env.REVOLUT_AUD || "https://revolut.com";
  const redirectUri = process.env.REVOLUT_REDIRECT_URI;

  const missing = [
    !clientId && "REVOLUT_CLIENT_ID",
    !privateKey && "REVOLUT_PRIVATE_KEY",
    !issuer && "REVOLUT_ISS",
    !redirectUri && "REVOLUT_REDIRECT_URI",
  ].filter(Boolean);

  if (missing.length > 0) {
    console.error(
      `\nMissing required environment variables: ${missing.join(", ")}\n`
    );
    console.error("Create a .env file with these values:");
    console.error("  REVOLUT_CLIENT_ID=your_client_id");
    console.error(
      '  REVOLUT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"'
    );
    console.error("  REVOLUT_ISS=https://your-domain.com");
    console.error(
      "  REVOLUT_REDIRECT_URI=https://your-domain.com/callback  (must match Revolut app settings)\n"
    );
    process.exit(1);
  }

  const consentUrl =
    `https://business.revolut.com/app-confirm` +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri!)}` +
    `&response_type=code`;

  const isLocalhost = redirectUri!.startsWith("http://localhost");

  console.log("\n=== Revolut OAuth Setup ===\n");

  if (isLocalhost) {
    // Auto-capture mode: start local server to catch the redirect
    const url = new URL(redirectUri!);
    const port = parseInt(url.port || "3000");
    const callbackPath = url.pathname;

    const server = createServer(async (req, res) => {
      const reqUrl = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (reqUrl.pathname !== callbackPath) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = reqUrl.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("Missing authorization code");
        return;
      }

      try {
        await handleTokens(
          code,
          clientId!,
          redirectUri!,
          issuer!,
          audience,
          privateKey!
        );
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Done!</h1><p>You can close this tab and return to the terminal.</p></body></html>"
        );
        server.close();
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h1>Error</h1><pre>${message}</pre></body></html>`
        );
        console.error(`\nFailed: ${message}\n`);
        server.close();
        process.exit(1);
      }
    });

    server.listen(port, () => {
      console.log(`Callback server listening on http://localhost:${port}`);
      console.log("\nOpening Revolut authorization page...\n");
      console.log(`If it doesn't open, visit:\n${consentUrl}\n`);
      console.log("Waiting for authorization...");
      openBrowser(consentUrl);
    });
  } else {
    // Manual mode: user pastes the code from the redirect URL
    console.log("Opening Revolut authorization page...\n");
    console.log(`If it doesn't open, visit:\n${consentUrl}\n`);
    openBrowser(consentUrl);

    console.log(
      "After authorizing, you'll be redirected to your redirect URI."
    );
    console.log(
      "Copy the 'code' parameter from the URL and paste it below.\n"
    );
    console.log(`  Example: ${redirectUri}?code=THE_CODE_YOU_NEED\n`);

    const code = await prompt("Paste the authorization code: ");
    if (!code) {
      console.error("No code provided. Exiting.");
      process.exit(1);
    }

    try {
      await handleTokens(
        code,
        clientId!,
        redirectUri!,
        issuer!,
        audience,
        privateKey!
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nFailed: ${message}\n`);
      process.exit(1);
    }
  }
}

main();
