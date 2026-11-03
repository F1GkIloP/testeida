import { useState } from "react";
import { getClient } from "../lib/supabase";

function emailFromUsername(username: string) {
  return `${username.toLowerCase()}@lunar.app`;
}

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = getClient();
    if (!sb) return;
    setErr("");
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(u)) {
      setErr("Юзернейм: 3–24 символа, латиница, цифры и _");
      return;
    }
    if (password.length < 6) {
      setErr("Пароль минимум 6 символов");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        const nick = nickname.trim() || u;
        const { error } = await sb.auth.signUp({
          email: emailFromUsername(u),
          password,
          options: { data: { username: u, display_name: nick } },
        });
        if (error) throw error;
      } else {
        const { error } = await sb.auth.signInWithPassword({
          email: emailFromUsername(u),
          password,
        });
        if (error) throw error;
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Не вышло");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-boot">
      <form className="card" onSubmit={submit}>
        <div className="logo">
          <div className="moon" />
          Lunar
        </div>
        <p className="sub">Мессенджер для своих: подарки, скины, NFT-юзы и кастом профиля.</p>
        {err ? <div className="err">{err}</div> : null}
        <label className="field">
          <span>Юзернейм</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="mihail"
            autoComplete="username"
          />
        </label>
        {mode === "register" ? (
          <label className="field">
            <span>Ник (имя)</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Михаил"
              autoComplete="nickname"
            />
          </label>
        ) : null}
        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
          />
        </label>
        <button className="btn accent wide" disabled={busy}>
          {mode === "register" ? "Создать аккаунт" : "Войти"}
        </button>
        <p className="sub" style={{ margin: "16px 0 0", textAlign: "center" }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setMode(mode === "register" ? "login" : "register")}
          >
            {mode === "register" ? "Уже есть аккаунт" : "Регистрация"}
          </button>
        </p>
      </form>
    </div>
  );
}
