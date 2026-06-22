import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

export function useApi() {
  const { serverUrl, token } = useAuth();

  const get = useCallback(
    async (path: string) => {
      const res = await fetch(`${serverUrl}/api${path}`, {
        headers: {
          "x-nezora-admin-token": token,
          "Content-Type": "application/json",
        },
      });
      return res.json();
    },
    [serverUrl, token]
  );

  const post = useCallback(
    async (path: string, body?: unknown) => {
      const res = await fetch(`${serverUrl}/api${path}`, {
        method: "POST",
        headers: {
          "x-nezora-admin-token": token,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.json();
    },
    [serverUrl, token]
  );

  const postForm = useCallback(
    async (path: string, form: FormData) => {
      const res = await fetch(`${serverUrl}/api${path}`, {
        method: "POST",
        headers: { "x-nezora-admin-token": token },
        body: form,
      });
      return res.json();
    },
    [serverUrl, token]
  );

  const del = useCallback(
    async (path: string) => {
      const res = await fetch(`${serverUrl}/api${path}`, {
        method: "DELETE",
        headers: {
          "x-nezora-admin-token": token,
          "Content-Type": "application/json",
        },
      });
      return res.json();
    },
    [serverUrl, token]
  );

  return { get, post, postForm, del };
}
