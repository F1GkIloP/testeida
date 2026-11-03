import { useEffect, useRef, useState } from "react";
import { GiftCard } from "../components/GiftCard";
import { Handle, initials } from "../components/Handle";
import { useAuth } from "../context/AuthContext";
import { getClient } from "../lib/supabase";
import type {
  ConversationPreview,
  Gift,
  GiftBackground,
  GiftSkin,
  Message,
  NftUsername,
  Profile,
  UserGift,
} from "../lib/types";

const ACCENTS = ["#7dd3fc", "#c4b5fd", "#fde68a", "#fb7185", "#34d399", "#fb923c", "#38bdf8"];

export function Messenger() {
  const { profile, refresh, signOut } = useAuth();
  const [tab, setTab] = useState<"chats" | "people">("chats");
  const [right, setRight] = useState<"me" | "gifts" | "nft" | "user">("me");
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [chats, setChats] = useState<ConversationPreview[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [peer, setPeer] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [catalog, setCatalog] = useState<Gift[]>([]);
  const [skins, setSkins] = useState<GiftSkin[]>([]);
  const [bgs, setBgs] = useState<GiftBackground[]>([]);
  const [nfts, setNfts] = useState<NftUsername[]>([]);
  const [myGifts, setMyGifts] = useState<UserGift[]>([]);
  const [peerGifts, setPeerGifts] = useState<UserGift[]>([]);
  const [pickGift, setPickGift] = useState<string | null>(null);
  const [pickSkin, setPickSkin] = useState<string | null>(null);
  const [pickBg, setPickBg] = useState<string | null>(null);
  const [giftNote, setGiftNote] = useState("");
  const [bio, setBio] = useState(profile?.bio || "");
  const [nick, setNick] = useState(profile?.display_name || "");
  const [busy, setBusy] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const sb = getClient()!;
  const me = profile!;

  useEffect(() => {
    setBio(me.bio);
    setNick(me.display_name);
  }, [me]);

  useEffect(() => {
    Promise.all([
      sb.from("gifts").select("*").order("rarity"),
      sb.from("gift_skins").select("*"),
      sb.from("gift_backgrounds").select("*"),
      sb.from("nft_usernames").select("*").order("rarity"),
    ]).then(([g, s, b, n]) => {
      setCatalog((g.data as Gift[]) || []);
      setSkins((s.data as GiftSkin[]) || []);
      setBgs((b.data as GiftBackground[]) || []);
      setNfts((n.data as NftUsername[]) || []);
      if (g.data?.[0]) setPickGift(g.data[0].id);
      if (s.data?.[0]) setPickSkin(s.data[0].id);
      if (b.data?.[0]) setPickBg(b.data[0].id);
    });
    loadMine();
    loadChats();
  }, []);

  async function loadMine() {
    const { data } = await sb
      .from("user_gifts")
      .select("*, gift:gifts(*), skin:gift_skins(*), background:gift_backgrounds(*), from:profiles!user_gifts_from_id_fkey(*)")
      .eq("owner_id", me.id)
      .order("created_at", { ascending: false });
    setMyGifts((data as UserGift[]) || []);
  }

  async function loadChats() {
    const { data: mem } = await sb
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", me.id);
    const ids = (mem || []).map((m) => m.conversation_id);
    if (!ids.length) {
      setChats([]);
      return;
    }
    const { data: others } = await sb
      .from("conversation_members")
      .select("conversation_id, user_id, profiles(*, nft:nft_usernames!profiles_nft_username_id_fkey(*))")
      .in("conversation_id", ids)
      .neq("user_id", me.id);

    const previews: ConversationPreview[] = [];
    for (const row of others || []) {
      const { data: last } = await sb
        .from("messages")
        .select("*")
        .eq("conversation_id", row.conversation_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const other = (row as unknown as { profiles: Profile }).profiles;
      if (!other) continue;
      previews.push({
        id: row.conversation_id,
        other,
        last: (last as Message | null) || null,
      });
    }
    previews.sort((a, b) => (b.last?.created_at || "").localeCompare(a.last?.created_at || ""));
    setChats(previews);
  }

  async function searchPeople(q: string) {
    setQuery(q);
    if (q.trim().length < 1) {
      const { data } = await sb
        .from("profiles")
        .select("*, nft:nft_usernames!profiles_nft_username_id_fkey(*)")
        .neq("id", me.id)
        .limit(40);
      setPeople((data as Profile[]) || []);
      return;
    }
    const { data } = await sb
      .from("profiles")
      .select("*, nft:nft_usernames!profiles_nft_username_id_fkey(*)")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq("id", me.id)
      .limit(40);
    setPeople((data as Profile[]) || []);
  }

  useEffect(() => {
    searchPeople("");
  }, []);

  async function openChatWith(user: Profile) {
    const { data, error } = await sb.rpc("get_or_create_dm", { other: user.id });
    if (error) {
      setBusy(error.message);
      return;
    }
    setActiveId(data as string);
    setPeer(user);
    setRight("user");
    await loadMessages(data as string);
    await loadPeerGifts(user.id);
    await loadChats();
  }

  async function loadMessages(conv: string) {
    const { data } = await sb
      .from("messages")
      .select("*, gift:user_gifts(*, gift:gifts(*), skin:gift_skins(*), background:gift_backgrounds(*))")
      .eq("conversation_id", conv)
      .order("created_at");
    setMessages((data as Message[]) || []);
  }

  async function loadPeerGifts(id: string) {
    const { data } = await sb
      .from("user_gifts")
      .select("*, gift:gifts(*), skin:gift_skins(*), background:gift_backgrounds(*)")
      .eq("owner_id", id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setPeerGifts((data as UserGift[]) || []);
  }

  useEffect(() => {
    if (!activeId) return;
    const channel = sb
      .channel(`msg:${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeId}` },
        () => loadMessages(activeId)
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [activeId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    if (!activeId || !text.trim()) return;
    const body = text.trim();
    setText("");
    await sb.from("messages").insert({
      conversation_id: activeId,
      sender_id: me.id,
      body,
    });
    await loadMessages(activeId);
    await loadChats();
  }

  async function upload(kind: "avatars" | "banners", file: File) {
    const path = `${me.id}/${Date.now()}-${file.name}`;
    const { error } = await sb.storage.from(kind).upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = sb.storage.from(kind).getPublicUrl(path);
    const patch = kind === "avatars" ? { avatar_url: data.publicUrl } : { banner_url: data.publicUrl };
    const { error: upErr } = await sb.from("profiles").update(patch).eq("id", me.id);
    if (upErr) throw upErr;
    await refresh();
  }

  async function saveProfile() {
    setBusy("");
    const { error } = await sb
      .from("profiles")
      .update({ display_name: nick.trim() || me.username, bio })
      .eq("id", me.id);
    if (error) setBusy(error.message);
    else await refresh();
  }

  async function setAccent(accent: string) {
    await sb.from("profiles").update({ accent }).eq("id", me.id);
    await refresh();
  }

  async function claimNft(id: string) {
    const { error } = await sb.rpc("claim_nft_username", { uname: id });
    if (error) setBusy(error.message);
    else {
      const { data } = await sb.from("nft_usernames").select("*");
      setNfts((data as NftUsername[]) || []);
      await refresh();
    }
  }

  async function equipNft(id: string | null) {
    const { error } = await sb.rpc("equip_nft_username", { uname: id });
    if (error) setBusy(error.message);
    else await refresh();
  }

  async function sendGift() {
    if (!peer || !pickGift) return;
    setBusy("");
    const { error } = await sb.rpc("mint_and_send_gift", {
      to_user: peer.id,
      p_gift: pickGift,
      p_skin: pickSkin,
      p_bg: pickBg,
      p_note: giftNote,
    });
    if (error) {
      setBusy(error.message);
      return;
    }
    setGiftNote("");
    if (activeId) await loadMessages(activeId);
    await loadPeerGifts(peer.id);
    await loadChats();
    setRight("user");
  }

  const myNft = (me as Profile).nft || nfts.find((n) => n.id === me.nft_username_id);
  const shownGifts = right === "user" ? peerGifts : myGifts;
  const previewGift = catalog.find((g) => g.id === pickGift);
  const previewSkin = skins.find((s) => s.id === pickSkin);
  const previewBg = bgs.find((b) => b.id === pickBg);

  return (
    <div className="shell">
      <section className="col chats open">
        <div className="head">
          <div className="logo" style={{ fontSize: 20 }}>
            <div className="moon" style={{ width: 28, height: 28 }} />
            Lunar
          </div>
        </div>
        <div className="tabs">
          <button className={`tab ${tab === "chats" ? "on" : ""}`} onClick={() => setTab("chats")}>
            Чаты
          </button>
          <button className={`tab ${tab === "people" ? "on" : ""}`} onClick={() => setTab("people")}>
            Люди
          </button>
        </div>
        <div style={{ padding: "0 12px 10px" }}>
          <input
            className="search"
            placeholder={tab === "people" ? "найти друга" : "поиск"}
            value={query}
            onChange={(e) => searchPeople(e.target.value)}
          />
        </div>
        <div className="list">
          {tab === "chats"
            ? chats.map((c) => (
                <button
                  key={c.id}
                  className={`row ${activeId === c.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveId(c.id);
                    setPeer(c.other);
                    setRight("user");
                    loadMessages(c.id);
                    loadPeerGifts(c.other.id);
                  }}
                >
                  {c.other.avatar_url ? (
                    <img className="ava" src={c.other.avatar_url} alt="" />
                  ) : (
                    <div className="ava">{initials(c.other.display_name)}</div>
                  )}
                  <div className="meta">
                    <b>{c.other.display_name}</b>
                    <p>{c.last?.body || "нет сообщений"}</p>
                  </div>
                </button>
              ))
            : people.map((p) => (
                <button key={p.id} className="row" onClick={() => openChatWith(p)}>
                  {p.avatar_url ? (
                    <img className="ava" src={p.avatar_url} alt="" />
                  ) : (
                    <div className="ava">{initials(p.display_name)}</div>
                  )}
                  <div className="meta">
                    <b>{p.display_name}</b>
                    <p>
                      <Handle profile={p} nft={p.nft} />
                    </p>
                  </div>
                </button>
              ))}
        </div>
      </section>

      <section className="chat">
        {peer && activeId ? (
          <>
            <div className="head">
              <button className="row" style={{ padding: 0 }} onClick={() => setRight("user")}>
                {peer.avatar_url ? (
                  <img className="ava" src={peer.avatar_url} alt="" />
                ) : (
                  <div className="ava">{initials(peer.display_name)}</div>
                )}
                <div className="meta">
                  <b>{peer.display_name}</b>
                  <small>
                    <Handle profile={peer} nft={peer.nft} />
                  </small>
                </div>
              </button>
              <button className="btn ghost" onClick={() => setRight("gifts")}>
                Подарок
              </button>
            </div>
            <div className="msgs">
              {messages.map((m) => (
                <div key={m.id} className={`bubble ${m.sender_id === me.id ? "me" : ""}`}>
                  {m.gift?.gift ? (
                    <div style={{ width: 180, marginBottom: 8 }}>
                      <GiftCard
                        gift={m.gift.gift}
                        skin={m.gift.skin}
                        background={m.gift.background}
                        note={m.gift.note}
                      />
                    </div>
                  ) : null}
                  {m.body}
                  <time>
                    {new Date(m.created_at).toLocaleTimeString("ru", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Сообщение"
              />
              <button className="btn accent" type="submit">
                Отправить
              </button>
            </form>
          </>
        ) : (
          <div className="empty">
            <div>
              <div className="logo" style={{ justifyContent: "center" }}>
                <div className="moon" />
              </div>
              <p>Выбери друга слева — и можно писать, дарить NFT-подарки и ставить скины.</p>
            </div>
          </div>
        )}
      </section>

      <aside className="col side open">
        <div className="tabs">
          <button className={`tab ${right === "me" ? "on" : ""}`} onClick={() => setRight("me")}>
            Я
          </button>
          <button className={`tab ${right === "gifts" ? "on" : ""}`} onClick={() => setRight("gifts")}>
            Гифты
          </button>
          <button className={`tab ${right === "nft" ? "on" : ""}`} onClick={() => setRight("nft")}>
            NFT юзы
          </button>
        </div>
        {busy ? <div className="err" style={{ margin: 12 }}>{busy}</div> : null}

        {right === "me" ? (
          <div className="list">
            <div
              className="profile-cover"
              style={{
                backgroundImage: me.banner_url
                  ? `url(${me.banner_url})`
                  : `linear-gradient(135deg, ${me.accent}, #0f172a)`,
              }}
            >
              {me.avatar_url ? (
                <img className="profile-ava" src={me.avatar_url} alt="" />
              ) : (
                <div className="profile-ava ava" style={{ left: 18, bottom: -32 }}>
                  {initials(me.display_name)}
                </div>
              )}
            </div>
            <div className="profile-body">
              <b>{me.display_name}</b>
              <div>
                <Handle profile={me} nft={myNft} />
              </div>
              <p className="hint">{me.bio || "пока без био"}</p>
              <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
                <label className="file">
                  аватар
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && upload("avatars", e.target.files[0])}
                  />
                </label>
                <label className="file">
                  баннер
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && upload("banners", e.target.files[0])}
                  />
                </label>
              </div>
              <label className="field">
                <span>Ник</span>
                <input value={nick} onChange={(e) => setNick(e.target.value)} />
              </label>
              <label className="field">
                <span>Био</span>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} />
              </label>
              <div className="field">
                <span>Цвет профиля</span>
                <div className="colors">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      className={`swatch ${me.accent === c ? "on" : ""}`}
                      style={{ background: c }}
                      onClick={() => setAccent(c)}
                    />
                  ))}
                </div>
              </div>
              <button className="btn accent wide" onClick={saveProfile}>
                Сохранить
              </button>
              <button className="btn ghost wide" style={{ marginTop: 8 }} onClick={signOut}>
                Выйти
              </button>
            </div>
            <h4 style={{ padding: "0 18px" }}>Мои подарки</h4>
            <div className="grid">
              {shownGifts.map((g) =>
                g.gift ? (
                  <GiftCard key={g.id} gift={g.gift} skin={g.skin} background={g.background} note={g.note} />
                ) : null
              )}
            </div>
          </div>
        ) : null}

        {right === "gifts" ? (
          <div className="list">
            <p className="sub" style={{ padding: "0 16px" }}>
              Всё бесплатно. Выбери подарок, скин и фон — и отправь другу в открытом чате.
            </p>
            {previewGift ? (
              <div style={{ padding: 12 }}>
                <GiftCard gift={previewGift} skin={previewSkin} background={previewBg} />
              </div>
            ) : null}
            <div className="grid">
              {catalog.map((g) => (
                <GiftCard
                  key={g.id}
                  gift={g}
                  skin={previewSkin}
                  background={previewBg}
                  selected={pickGift === g.id}
                  onClick={() => setPickGift(g.id)}
                />
              ))}
            </div>
            <div className="hint" style={{ padding: "0 16px" }}>Скин</div>
            <div className="chip-row">
              {skins.map((s) => (
                <button
                  key={s.id}
                  className={`chip ${pickSkin === s.id ? "on" : ""}`}
                  onClick={() => setPickSkin(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="hint" style={{ padding: "0 16px" }}>Фон</div>
            <div className="chip-row">
              {bgs.map((s) => (
                <button
                  key={s.id}
                  className={`chip ${pickBg === s.id ? "on" : ""}`}
                  onClick={() => setPickBg(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div style={{ padding: 12 }}>
              <label className="field">
                <span>Подпись к подарку</span>
                <input value={giftNote} onChange={(e) => setGiftNote(e.target.value)} />
              </label>
              <button className="btn accent wide" disabled={!peer} onClick={sendGift}>
                {peer ? `Подарить ${peer.display_name}` : "Сначала открой чат"}
              </button>
            </div>
          </div>
        ) : null}

        {right === "nft" ? (
          <div className="list" style={{ padding: 12 }}>
            <p className="sub">Коллекционные юзернеймы как в Telegram. Забери свободный — и надень его.</p>
            {nfts.map((n) => (
              <div key={n.id} className="row" style={{ border: "1px solid var(--line)", borderRadius: 16, marginBottom: 8 }}>
                <div className="meta">
                  <span className="handle nft" style={{ backgroundImage: n.gradient }}>
                    @{n.handle}
                  </span>
                  <div className="rarity">{n.rarity}</div>
                  <small>
                    {n.owner_id === me.id ? "твоё" : n.owner_id ? "занято" : "свободно"}
                  </small>
                </div>
                {!n.owner_id ? (
                  <button className="btn" onClick={() => claimNft(n.id)}>
                    Забрать
                  </button>
                ) : n.owner_id === me.id ? (
                  <button className="btn accent" onClick={() => equipNft(n.id)}>
                    Надеть
                  </button>
                ) : null}
              </div>
            ))}
            <button className="btn ghost wide" onClick={() => equipNft(null)}>
              Снять NFT-юз, оставить @{me.username}
            </button>
          </div>
        ) : null}

        {right === "user" && peer ? (
          <div className="list">
            <div
              className="profile-cover"
              style={{
                backgroundImage: peer.banner_url
                  ? `url(${peer.banner_url})`
                  : `linear-gradient(135deg, ${peer.accent}, #0f172a)`,
              }}
            >
              {peer.avatar_url ? (
                <img className="profile-ava" src={peer.avatar_url} alt="" />
              ) : (
                <div className="profile-ava ava">{initials(peer.display_name)}</div>
              )}
            </div>
            <div className="profile-body">
              <b>{peer.display_name}</b>
              <div>
                <Handle profile={peer} nft={peer.nft} />
              </div>
              <p className="hint">{peer.bio || "нет био"}</p>
            </div>
            <h4 style={{ padding: "0 18px" }}>Подарки на профиле</h4>
            <div className="grid">
              {peerGifts.map((g) =>
                g.gift ? (
                  <GiftCard key={g.id} gift={g.gift} skin={g.skin} background={g.background} note={g.note} />
                ) : null
              )}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
