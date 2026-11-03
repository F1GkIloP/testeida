import type { NftUsername, Profile } from "../lib/types";

export function Handle({
  profile,
  nft,
}: {
  profile: Pick<Profile, "username">;
  nft?: NftUsername | null;
}) {
  if (nft) {
    return (
      <span className="handle nft" style={{ backgroundImage: nft.gradient }}>
        @{nft.handle}
      </span>
    );
  }
  return <span className="handle">@{profile.username}</span>;
}

export function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}
