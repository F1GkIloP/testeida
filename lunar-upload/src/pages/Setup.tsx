import { useState } from "react";
import { getSupabaseAnon, getSupabaseUrl, saveSupabaseConfig } from "../lib/config";
import { resetClient } from "../lib/supabase";

export function Setup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState(getSupabaseUrl());
  const [anon, setAnon] = useState(getSupabaseAnon());
  const [err, setErr] = useState("");

  function save() {
    if (!url.includes("supabase.co") || !anon.startsWith("sb_publishable_")) {
      setErr("Нужен Project URL вида https://xxxx.supabase.co и publishable-ключ sb_publishable_…");
      return;
    }
    saveSupabaseConfig(url.trim(), anon.trim());
    resetClient();
    onDone();
  }

  return (
    <div className="app-boot">
      <div className="card">
        <div className="logo">
          <div className="moon" />
          Lunar
        </div>
        <p className="sub">
          Один раз вставь данные проекта из Supabase → Settings → Data API. Секретный ключ
          сюда не клади — только publishable.
        </p>
        {err ? <div className="err">{err}</div> : null}
        <label className="field">
          <span>Project URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://abcdefgh.supabase.co"
          />
        </label>
        <label className="field">
          <span>Publishable key</span>
          <input
            value={anon}
            onChange={(e) => setAnon(e.target.value)}
            placeholder="sb_publishable_…"
          />
        </label>
        <button className="btn accent wide" onClick={save}>
          Продолжить
        </button>
      </div>
    </div>
  );
}
