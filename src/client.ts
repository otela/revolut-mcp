import { createPrivateKey, type KeyObject } from "node:crypto";
import { SignJWT } from "jose";

const BASE_URL = "https://b2b.revolut.com/api/1.0";
const TOKEN_ENDPOINT = `${BASE_URL}/auth/token`;
const JWT_TTL_SECONDS = 300;

interface RevolutError {
  message?: string;
  code?: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

function normalizePrivateKey(rawValue: string): string {
  let value = rawValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  value = value.replace(/\\n/g, "\n");

  if (value.includes("-----BEGIN")) {
    return value;
  }

  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    if (decoded.includes("-----BEGIN")) {
      return decoded;
    }
  } catch {
    // fall through
  }

  return value;
}

export class RevolutClient {
  private clientId: string;
  private privateKey: KeyObject;
  private issuer: string;
  private audience: string;
  private refreshToken: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor() {
    const clientId = process.env.REVOLUT_CLIENT_ID;
    const privateKeyRaw = process.env.REVOLUT_PRIVATE_KEY;
    const issuer = process.env.REVOLUT_ISS;
    const refreshToken = process.env.REVOLUT_REFRESH_TOKEN;

    if (!clientId || !privateKeyRaw || !issuer || !refreshToken) {
      const missing = [
        !clientId && "REVOLUT_CLIENT_ID",
        !privateKeyRaw && "REVOLUT_PRIVATE_KEY",
        !issuer && "REVOLUT_ISS",
        !refreshToken && "REVOLUT_REFRESH_TOKEN",
      ].filter(Boolean);
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`
      );
    }

    this.clientId = clientId;
    this.privateKey = createPrivateKey({
      key: normalizePrivateKey(privateKeyRaw),
    });
    this.issuer = issuer;
    this.audience = process.env.REVOLUT_AUD || "https://revolut.com";
    this.refreshToken = refreshToken;
  }

  private async signJwt(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      iss: this.issuer,
      sub: this.clientId,
      aud: this.audience,
      iat: now,
      exp: now + JWT_TTL_SECONDS,
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .sign(this.privateKey);
  }

  private async ensureAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const clientAssertion = await this.signJwt();

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
      client_id: this.clientId,
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const err = (await response.json()) as RevolutError;
        if (err.message) detail = `${detail} — ${err.message}`;
      } catch {
        // ignore
      }
      throw new Error(`Token refresh failed: ${detail}`);
    }

    const data = (await response.json()) as TokenResponse;
    this.accessToken = data.access_token;
    // Refresh 60s before actual expiry
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  private async get<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    const token = await this.ensureAccessToken();

    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const body = (await response.json()) as RevolutError;
        if (body.message) {
          detail = `${detail} — ${body.message}`;
        }
        if (body.code) {
          detail = `${detail} (code ${body.code})`;
        }
      } catch {
        // ignore JSON parse failure
      }
      throw new Error(`Revolut API error: ${detail}`);
    }

    return (await response.json()) as T;
  }

  async listAccounts(): Promise<unknown[]> {
    return this.get<unknown[]>("/accounts");
  }

  async getAccount(accountId: string): Promise<unknown> {
    return this.get<unknown>(`/accounts/${accountId}`);
  }

  async listTransactions(params: {
    from?: string;
    to?: string;
    count?: number;
    account?: string;
    type?: string;
  }): Promise<unknown[]> {
    const query: Record<string, string> = {};
    if (params.from) query.from = params.from;
    if (params.to) query.to = params.to;
    if (params.count !== undefined) query.count = String(params.count);
    if (params.account) query.account = params.account;
    if (params.type) query.type = params.type;
    return this.get<unknown[]>("/transactions", query);
  }

  async listExpenses(params: {
    from?: string;
    to?: string;
    count?: number;
  }): Promise<unknown[]> {
    const query: Record<string, string> = {};
    if (params.from) query.from = params.from;
    if (params.to) query.to = params.to;
    if (params.count !== undefined) query.count = String(params.count);
    return this.get<unknown[]>("/expenses", query);
  }
}

let _client: RevolutClient | null = null;
export function getClient(): RevolutClient {
  if (!_client) _client = new RevolutClient();
  return _client;
}
