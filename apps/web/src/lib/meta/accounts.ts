import type {
  ConnectableIgAccount,
  IgAccountDetails,
  MetaPagesResponse,
} from "./types";
import { parseMetaError } from "./errors";

const GRAPH_BASE = "https://graph.facebook.com/v22.0";

async function graphGet<T>(path: string, token: string): Promise<T> {
  const url = `${GRAPH_BASE}${path}${path.includes("?") ? "&" : "?"}access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw await parseMetaError(res);
  return res.json() as Promise<T>;
}

/** Obtiene las Pages del usuario y sus cuentas IG Business/Creator asociadas. */
export async function getConnectableIgAccounts(
  userAccessToken: string
): Promise<ConnectableIgAccount[]> {
  const pages = await graphGet<MetaPagesResponse>(
    "/me/accounts?fields=id,name,access_token,instagram_business_account",
    userAccessToken
  );

  const connectable: ConnectableIgAccount[] = [];

  for (const page of pages.data) {
    if (!page.instagram_business_account?.id) continue;

    const igUserId = page.instagram_business_account.id;
    try {
      const details = await graphGet<IgAccountDetails>(
        `/${igUserId}?fields=id,username,account_type,profile_picture_url,name`,
        page.access_token
      );

      if (
        details.account_type !== "BUSINESS" &&
        details.account_type !== "CREATOR"
      ) {
        continue;
      }

      connectable.push({
        igUserId: details.id,
        username: details.username,
        accountType: details.account_type,
        profilePictureUrl: details.profile_picture_url,
        facebookPageId: page.id,
        facebookPageName: page.name,
        pageAccessToken: page.access_token,
      });
    } catch {
      // Si una cuenta falla, continuar con las demás
    }
  }

  return connectable;
}

/** Verifica el access token consultando el propio perfil IG. */
export async function verifyIgToken(
  igUserId: string,
  token: string
): Promise<boolean> {
  try {
    await graphGet<{ id: string }>(
      `/${igUserId}?fields=id`,
      token
    );
    return true;
  } catch {
    return false;
  }
}

/** Publica un primer comentario en un media recién publicado. */
export async function postFirstComment(
  mediaId: string,
  message: string,
  token: string
): Promise<string> {
  const url = `${GRAPH_BASE}/${mediaId}/comments`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: token }),
  });
  if (!res.ok) throw await parseMetaError(res);
  const data = (await res.json()) as { id: string };
  return data.id;
}
