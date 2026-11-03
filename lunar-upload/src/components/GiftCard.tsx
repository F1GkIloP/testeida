import type { Gift, GiftBackground, GiftSkin } from "../lib/types";

export function GiftCard({
  gift,
  skin,
  background,
  selected,
  onClick,
  note,
}: {
  gift: Gift;
  skin?: GiftSkin | null;
  background?: GiftBackground | null;
  selected?: boolean;
  onClick?: () => void;
  note?: string;
}) {
  const [c1, c2] = (skin?.palette || "#e2e8f0,#94a3b8").split(",");
  return (
    <button
      type="button"
      className={`gift ${selected ? "selected" : ""}`}
      onClick={onClick}
      style={{ background: background?.css || "radial-gradient(circle at 30% 20%, #1e293b, #020617 70%)" }}
    >
      <div className="spark" />
      <div>
        <div
          className="emoji"
          style={{
            textShadow: `0 0 22px ${c1}`,
            filter: `drop-shadow(0 0 10px ${c2})`,
          }}
        >
          {gift.emoji}
        </div>
        <div className="gname">{gift.name}</div>
        {skin ? <div className="hint">{skin.name}</div> : null}
        {note ? <div className="hint">{note}</div> : null}
      </div>
    </button>
  );
}
