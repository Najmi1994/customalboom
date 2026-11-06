"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { KeyRound, Loader2, LogOut, Plus, Settings, Trash2, Type } from "lucide-react";
import { googleFontsStylesheet } from "../../../src/fonts/domain";
import InfoBanners from './InfoBanners';

type FontPayload = { revision: number; fonts: string[] };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "Permintaan tidak berjaya.");
  return body as T;
}

export default function KingkongSettings() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [fonts, setFonts] = useState<string[]>([]), [family, setFamily] = useState("");
  const [currentPassword, setCurrentPassword] = useState(""), [newPassword, setNewPassword] = useState(""), [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const stylesheet = useMemo(() => fonts.length ? googleFontsStylesheet(fonts) : "", [fonts]);

  useEffect(() => {
    let alive = true;
    requestJson<{ authenticated: boolean }>("/api/kingkong/session").then(async session => {
      if (!alive) return;
      setAuthenticated(session.authenticated);
      if (session.authenticated) {
        const payload = await requestJson<FontPayload>("/api/kingkong/fonts");
        if (alive) setFonts(payload.fonts);
      }
    }).catch(cause => { if (alive) { setAuthenticated(false); setError(cause instanceof Error ? cause.message : "Tidak dapat membuka settings."); } });
    return () => { alive = false; };
  }, []);

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (newPassword !== confirmPassword) { setError("Pengesahan password baharu tidak sepadan."); return; }
    setBusy("password");
    try {
      await requestJson("/api/kingkong/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setNotice("Password Kingkong berjaya ditukar. Sesi ini kekal aktif.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Password tidak dapat ditukar."); }
    finally { setBusy(""); }
  }

  async function addFont(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setBusy("font");
    try {
      const payload = await requestJson<FontPayload>("/api/kingkong/fonts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ family }) });
      setFonts(payload.fonts); setFamily(""); setNotice("Google Font ditambah dan kini tersedia dalam pilihan Typeface pengguna.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Font tidak dapat ditambah."); }
    finally { setBusy(""); }
  }

  async function removeFont(font: string) {
    if (!window.confirm(`Buang ${font} daripada pilihan Typeface? Teks sedia ada yang menggunakan font ini tidak akan diubah.`)) return;
    setError(""); setNotice(""); setBusy(`remove:${font}`);
    try {
      const payload = await requestJson<FontPayload>("/api/kingkong/fonts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ family: font }) });
      setFonts(payload.fonts); setNotice(`${font} dibuang daripada senarai Typeface.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Font tidak dapat dibuang."); }
    finally { setBusy(""); }
  }

  async function logout() {
    setBusy("logout");
    try { await requestJson("/api/kingkong/session", { method: "DELETE" }); router.replace("/kingkong"); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Logout tidak berjaya."); setBusy(""); }
  }

  if (authenticated === null) return <main className="kk-shell kk-centered"><Loader2 className="kk-spin"/> Membuka settings…</main>;
  if (!authenticated) return <main className="kk-shell kk-login-shell"><div className="kk-login-card"><div className="kk-brand-mark"><Settings/></div><p className="kk-eyebrow">KINGKONG SETTINGS</p><h1>Sesi diperlukan</h1><p>Login sebagai super admin dahulu untuk menukar password atau mengurus Google Fonts.</p>{error && <div className="kk-alert error">{error}</div>}<Link className="kk-primary kk-settings-login" href="/kingkong">Pergi ke login</Link></div></main>;

  return <main className="kk-shell">
    {stylesheet && <link rel="stylesheet" href={stylesheet}/>}
    <header className="kk-header"><div><Link href="/" className="kk-logo">CustomAlboom.com</Link><span>Super admin settings</span></div><nav className="kk-nav"><Link href="/kingkong">Kedai Cetak</Link><Link href="/kingkong/templates">Manage Templates</Link><Link className="active" href="/kingkong/settings">Settings</Link><button onClick={logout} disabled={Boolean(busy)}><LogOut size={15}/> Logout</button></nav></header>
    <section className="kk-content kk-settings-content"><div className="kk-hero"><div><p className="kk-eyebrow">SECURITY &amp; TYPEFACE</p><h1>Settings</h1><p>Urus akses Kingkong dan font yang tersedia kepada semua pengguna editor.</p></div></div>
      {error && <div className="kk-alert error" role="alert">{error}<button onClick={() => setError("")}>Tutup</button></div>}
      {notice && <div className="kk-alert success" role="status">{notice}<button onClick={() => setNotice("")}>Tutup</button></div>}
      <div className="kk-settings-grid">
        <form className="kk-settings-card" onSubmit={changePassword}><header><span className="kk-settings-icon"><KeyRound size={19}/></span><div><h2>Tukar password</h2><p>Password Kingkong untuk akses super admin.</p></div></header><label><span>Password semasa</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required/></label><label><span>Password baharu</span><input type="password" autoComplete="new-password" minLength={12} maxLength={512} value={newPassword} onChange={event => setNewPassword(event.target.value)} required/><small>Minimum 12 aksara.</small></label><label><span>Sahkan password baharu</span><input type="password" autoComplete="new-password" minLength={12} maxLength={512} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required/></label><button className="kk-primary" disabled={Boolean(busy) || newPassword.length < 12}>{busy === "password" ? <Loader2 className="kk-spin" size={15}/> : <KeyRound size={15}/>} Tukar password</button></form>
        <section className="kk-settings-card kk-font-card"><header><span className="kk-settings-icon"><Type size={19}/></span><div><h2>Google Fonts</h2><p>Masukkan nama font tepat seperti di Google Fonts.</p></div></header><form className="kk-font-add" onSubmit={addFont}><label><span>Nama font</span><input value={family} maxLength={80} placeholder="Contoh: Playfair Display" onChange={event => setFamily(event.target.value)}/></label><button className="kk-primary" disabled={Boolean(busy) || !family.trim()}>{busy === "font" ? <Loader2 className="kk-spin" size={15}/> : <Plus size={15}/>} Add font</button></form><div className="kk-font-list">{fonts.map(font => <article key={font}><div><strong style={{ fontFamily: `'${font}', sans-serif` }}>{font}</strong><small style={{ fontFamily: `'${font}', sans-serif` }}>The quick brown fox jumps over the lazy dog.</small></div><button className="kk-font-remove" aria-label={`Buang ${font}`} disabled={Boolean(busy)} onClick={() => void removeFont(font)}>{busy === `remove:${font}` ? <Loader2 className="kk-spin" size={15}/> : <Trash2 size={15}/>}</button></article>)}{!fonts.length && <div className="kk-font-empty">Belum ada Google Font tambahan. Font asal Inter, Lora dan DM Sans sentiasa tersedia.</div>}</div></section>
      </div>
      <InfoBanners/>
    </section>
  </main>;
}
