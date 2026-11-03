export type Rarity = "common" | "rare" | "epic" | "legendary";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  banner_url: string | null;
  accent: string;
  nft_username_id: string | null;
  created_at: string;
  nft?: NftUsername | null;
};

export type NftUsername = {
  id: string;
  handle: string;
  rarity: Rarity;
  gradient: string;
  owner_id: string | null;
};

export type Gift = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  description: string;
};

export type GiftSkin = {
  id: string;
  slug: string;
  name: string;
  palette: string;
};

export type GiftBackground = {
  id: string;
  slug: string;
  name: string;
  css: string;
};

export type UserGift = {
  id: string;
  owner_id: string;
  gift_id: string;
  skin_id: string | null;
  background_id: string | null;
  from_id: string | null;
  note: string;
  pinned: boolean;
  created_at: string;
  gift?: Gift;
  skin?: GiftSkin | null;
  background?: GiftBackground | null;
  from?: Profile | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  gift_instance_id: string | null;
  created_at: string;
  gift?: UserGift | null;
};

export type ConversationPreview = {
  id: string;
  other: Profile;
  last?: Message | null;
};
