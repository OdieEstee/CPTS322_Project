/*
 * api.ts — talking to the Express backend with the login token
 *
 * apiFetch() adds "Authorization: Bearer <token>" to every request, so the
 * server knows which user is asking (see server/auth.js), and turns error
 * responses into an ApiError with the server's message.
 */

export const API_BASE = "http://localhost:3001";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined && { "Content-Type": "application/json" })
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new ApiError(0, "Could not connect to the server.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.message ?? "Request failed.");
  }
  return data as T;
}

/* Shapes returned by the messaging API (server/messaging.js). */

export interface ChatMessage {
  id: number;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface Match {
  id: string;
  createdAt: string;
  otherUser: { id: string; name: string };
  lastMessage: ChatMessage | null;
}
