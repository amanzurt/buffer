export interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

export interface MetaPagesResponse {
  data: MetaPage[];
}

export interface IgAccountDetails {
  id: string;
  username: string;
  account_type: "BUSINESS" | "CREATOR" | "PERSONAL";
  profile_picture_url?: string;
  name?: string;
}

export interface ConnectableIgAccount {
  igUserId: string;
  username: string;
  accountType: "BUSINESS" | "CREATOR";
  profilePictureUrl?: string;
  facebookPageId: string;
  facebookPageName: string;
  pageAccessToken: string;
}
