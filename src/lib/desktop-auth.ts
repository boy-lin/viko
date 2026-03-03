import { isTauri } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { baseApiUrl } from "./env";
import { bridge } from "./bridge";

const OAUTH_STATE_KEY = "auth:desktop:oauth:state";
const OAUTH_PKCE_KEY = "auth:desktop:oauth:pkce_verifier";
const ACCESS_TOKEN_KEY = "auth:desktop:access_token";
const REFRESH_TOKEN_KEY = "auth:desktop:refresh_token";
const EXPIRES_AT_KEY = "auth:desktop:expires_at";
const ID_TOKEN_KEY = "auth:desktop:id_token";

type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  token_type?: string | null;
  id_token?: string | null;
};

type DesktopAuthErrorCode =
  | "state_mismatch"
  | "session_expired"
  | "code_invalid"
  | "network_error"
  | "token_exchange_failed"
  | "unknown_error";

type DesktopAuthErrorDetail = {
  code: DesktopAuthErrorCode;
  message: string;
};

type JwtPayload = {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  [key: string]: unknown;
};

const authorizeEndpoint = `${baseApiUrl}/api/auth/authorize`;
const tokenEndpoint = `${baseApiUrl}/api/auth/token`;
const clientId = import.meta.env.VITE_DESKTOP_AUTH_CLIENT_ID || "viko-desktop";
const redirectUri = import.meta.env.VITE_DESKTOP_AUTH_REDIRECT_URI || "viko://auth/callback";

function randomString(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64Url(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input);
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createPkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(digest);
}

function saveToken(token: OAuthTokenResponse) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token.access_token);
  if (token.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token.refresh_token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  if (typeof token.expires_in === "number" && token.expires_in > 0) {
    const expiresAt = Date.now() + token.expires_in * 1000;
    localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt));
  } else {
    localStorage.removeItem(EXPIRES_AT_KEY);
  }

  if (token.id_token) {
    localStorage.setItem(ID_TOKEN_KEY, token.id_token);
  } else {
    localStorage.removeItem(ID_TOKEN_KEY);
  }
}

export function getDesktopAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function hasDesktopAccessToken(): boolean {
  return Boolean(getDesktopAccessToken());
}

export function clearDesktopToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  localStorage.removeItem(ID_TOKEN_KEY);
  localStorage.removeItem(OAUTH_STATE_KEY);
  localStorage.removeItem(OAUTH_PKCE_KEY);
}

export function clearDesktopOAuthSession() {
  localStorage.removeItem(OAUTH_STATE_KEY);
  localStorage.removeItem(OAUTH_PKCE_KEY);
}

function parseJwtPayload(token: string | null): JwtPayload | null {
  if (!token || token.split(".").length < 2) {
    return null;
  }
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function getDesktopUserFromToken() {
  const idTokenPayload = parseJwtPayload(localStorage.getItem(ID_TOKEN_KEY));
  const accessTokenPayload = parseJwtPayload(localStorage.getItem(ACCESS_TOKEN_KEY));
  const payload = idTokenPayload || accessTokenPayload;
  if (!payload?.sub) {
    return null;
  }
  const email = typeof payload.email === "string" ? payload.email : undefined;
  const name =
    typeof payload.name === "string"
      ? payload.name
      : typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : email || "User";

  return {
    id: payload.sub,
    name,
    email: email || "",
  };
}

export function isDesktopOAuthAvailable(): boolean {
  const hasHttpAuthorize = /^https?:\/\//i.test(authorizeEndpoint);
  const hasHttpToken = /^https?:\/\//i.test(tokenEndpoint);
  return isTauri() && hasHttpAuthorize && hasHttpToken;
}

export async function startDesktopOAuthLogin() {
  if (!isDesktopOAuthAvailable()) {
    throw new Error("Desktop OAuth is not available");
  }

  const state = randomString(16);
  const verifier = randomString(32);
  const challenge = await createPkceChallenge(verifier);

  localStorage.setItem(OAUTH_STATE_KEY, state);
  localStorage.setItem(OAUTH_PKCE_KEY, verifier);

  const url = new URL(authorizeEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);

  await openUrl(url.toString());
  return { state };
}

function extractCodeAndState(input: string, depth = 0): { code?: string; state?: string } {
  const rawInput = input.trim();
  if (!rawInput || depth > 2) {
    return {};
  }

  if (
    !rawInput.includes("://") &&
    !rawInput.includes("?") &&
    !rawInput.includes("&") &&
    !rawInput.includes("=")
  ) {
    return { code: rawInput };
  }

  const fromParams = (params: URLSearchParams): { code?: string; state?: string } => {
    const code = params.get("code") || params.get("code_challenge") || undefined;
    const state = params.get("state") || undefined;
    return { code, state };
  };

  try {
    const url = new URL(rawInput);
    const direct = fromParams(url.searchParams);
    if (direct.code) {
      return direct;
    }

    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (hash) {
      const hashParams = fromParams(new URLSearchParams(hash.startsWith("?") ? hash.slice(1) : hash));
      if (hashParams.code) {
        return hashParams;
      }
    }

    for (const [, value] of url.searchParams) {
      const nested = extractCodeAndState(value, depth + 1);
      if (nested.code) {
        return nested;
      }
      try {
        const decoded = decodeURIComponent(value);
        if (decoded !== value) {
          const decodedNested = extractCodeAndState(decoded, depth + 1);
          if (decodedNested.code) {
            return decodedNested;
          }
        }
      } catch {
        // Ignore invalid decode inputs.
      }
    }
  } catch {
    // Not a full URL, continue with query-string parsing.
  }

  const normalizedQuery = rawInput
    .replace(/^[^?#]*[?#]/, "")
    .replace(/^\?/, "")
    .replace(/^#/, "");
  const fallback = fromParams(new URLSearchParams(normalizedQuery || rawInput));
  return fallback;
}

export async function finishDesktopOAuthLogin(codeOrUrl: string, state?: string) {
  if (!codeOrUrl) {
    throw new Error("OAuth code is required");
  }

  const extracted = extractCodeAndState(codeOrUrl);

  const normalizedCode = extracted.code?.trim();
  const normalizedState = state?.trim() || extracted.state?.trim();

  if (!normalizedCode) {
    throw new Error("OAuth code not found in input URL");
  }

  const savedState = localStorage.getItem(OAUTH_STATE_KEY);
  const verifier = localStorage.getItem(OAUTH_PKCE_KEY);
  if (!savedState || !verifier) {
    throw new Error("OAuth session expired, please retry");
  }

  if (normalizedState && normalizedState !== savedState) {
    throw new Error("Invalid OAuth state");
  }

  const token = await bridge.invoke<OAuthTokenResponse>("auth_exchange_code", {
    input: {
      tokenEndpoint,
      clientId,
      code: normalizedCode,
      codeVerifier: verifier,
      redirectUri,
    },
  });

  saveToken(token);
  localStorage.removeItem(OAUTH_STATE_KEY);
  localStorage.removeItem(OAUTH_PKCE_KEY);
  return token;
}

function classifyDesktopAuthError(error: unknown): DesktopAuthErrorDetail {
  const message = (error as Error)?.message || "Desktop OAuth failed";
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("invalid oauth state")) {
    return { code: "state_mismatch", message: "登录状态校验失败，请重试登录" };
  }
  if (lowerMessage.includes("session expired")) {
    return { code: "session_expired", message: "登录会话已过期，请重新发起登录" };
  }
  if (lowerMessage.includes("oauth code is required")) {
    return { code: "code_invalid", message: "未获取到授权 code，请重新登录" };
  }
  if (lowerMessage.includes("oauth code not found")) {
    return { code: "code_invalid", message: "输入的 URL 不包含授权 code，请使用登录完成后的回调地址" };
  }
  if (lowerMessage.includes("token exchange request failed")) {
    return { code: "network_error", message: "网络异常，换取 token 失败" };
  }
  if (lowerMessage.includes("token exchange failed")) {
    return { code: "token_exchange_failed", message: "授权码无效或已过期，请重新登录" };
  }
  return { code: "unknown_error", message };
}

function parseCallbackUrl(input: string): { code: string; state?: string } | null {
  const extracted = extractCodeAndState(input);
  if (!extracted.code) {
    return null;
  }
  return {
    code: extracted.code,
    state: extracted.state,
  };
}

export async function handleDesktopOAuthCallbackUrl(input: string): Promise<boolean> {
  const parsed = parseCallbackUrl(input);
  if (!parsed) {
    return false;
  }
  window.dispatchEvent(new CustomEvent("desktop-auth:exchanging"));
  await finishDesktopOAuthLogin(parsed.code, parsed.state);
  window.dispatchEvent(new CustomEvent("desktop-auth:success"));
  return true;
}

export async function initDesktopOAuthDeepLinkListener() {
  if (!isTauri()) {
    return;
  }

  try {
    const current = await getCurrent();
    if (Array.isArray(current)) {
      for (const url of current) {
        await handleDesktopOAuthCallbackUrl(url);
      }
    }
  } catch {
    // Ignore startup deep-link errors to avoid blocking app launch.
  }

  await onOpenUrl(async (urls) => {
    for (const url of urls) {
      try {
        await handleDesktopOAuthCallbackUrl(url);
      } catch (error) {
        const detail = classifyDesktopAuthError(error);
        window.dispatchEvent(
          new CustomEvent<DesktopAuthErrorDetail>("desktop-auth:error", { detail })
        );
      }
    }
  });

  await bridge.on("single-instance", async (payload) => {
    const args = payload?.args ?? [];
    const callbackUrl = args.find((arg) => typeof arg === "string" && arg.startsWith("viko://"));
    if (!callbackUrl) return;
    try {
      await handleDesktopOAuthCallbackUrl(callbackUrl);
    } catch (error) {
      const detail = classifyDesktopAuthError(error);
      window.dispatchEvent(
        new CustomEvent<DesktopAuthErrorDetail>("desktop-auth:error", { detail })
      );
    }
  });
}
