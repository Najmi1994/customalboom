"use client";
import SupportPhoto from './SupportPhoto';

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CreditCard, Eye, EyeOff, ImagePlus, Link as LinkIcon, Loader2, LogOut, MapPin, MessageCircle, Pencil, Phone, Plus, Save, ShieldCheck, Store, Trash2, Upload, X } from "lucide-react";
import { DEFAULT_SUPPORT_SETTINGS, MALAYSIA_STATES, shopStatus, type AdminPrintShop, type ShopInput, type SupportAccount, type SupportField, type SupportSettings } from "../../src/print-shops/domain";

type ShopForm = {
  name: string;
  address: string;
  state: string;
  phone: string;
  link: string;
  displayFrom: string;
  displayTo: string;
  contactName: string;
  contactPhone: string;
};

type ShopPayload = { revision: number; shops: AdminPrintShop[]; shop?: AdminPrintShop };
type SettingsPayload = { revision: number; adminContactPhone: string; supportSettings: SupportSettings };
const EMPTY_FORM: ShopForm = { name: "", address: "", state: "", phone: "", link: "", displayFrom: "", displayTo: "", contactName: "", contactPhone: "" };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "Permintaan tidak berjaya.");
  return body as T;
}

function formFromShop(shop?: AdminPrintShop): ShopForm {
  if (!shop) return { ...EMPTY_FORM };
  return {
    name: shop.name,
    address: shop.address ?? "",
    state: shop.state ?? "",
    phone: shop.phone ?? "",
    link: shop.link ?? "",
    displayFrom: shop.displayFrom ?? "",
    displayTo: shop.displayTo ?? "",
    contactName: shop.contactName ?? "",
    contactPhone: shop.contactPhone ?? "",
  };
}

function shopInput(form: ShopForm): ShopInput {
  return {
    name: form.name,
    address: form.address || undefined,
    state: (form.state || undefined) as ShopInput["state"],
    phone: form.phone || undefined,
    link: form.link || undefined,
    displayFrom: form.displayFrom || undefined,
    displayTo: form.displayTo || undefined,
    contactName: form.contactName || undefined,
    contactPhone: form.contactPhone || undefined,
  };
}

export default function KingkongAdmin() {
  const [authState, setAuthState] = useState<"checking" | "out" | "in">("checking");
  const [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const [revision, setRevision] = useState(0), [shops, setShops] = useState<AdminPrintShop[]>([]);
  const [adminContactPhone, setAdminContactPhone] = useState("");
  const [supportSettings, setSupportSettings] = useState<SupportSettings>(() => structuredClone(DEFAULT_SUPPORT_SETTINGS));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<AdminPrintShop | "new" | null>(null), [form, setForm] = useState<ShopForm>(EMPTY_FORM);
  const [logoFile, setLogoFile] = useState<File | null>(null), [removeLogo, setRemoveLogo] = useState(false);

  const applyPayload = useCallback((payload: ShopPayload) => { setRevision(payload.revision); setShops(payload.shops); }, []);
  const loadShops = useCallback(async () => { const payload = await requestJson<ShopPayload>("/api/kingkong/shops", { cache: "no-store" }); applyPayload(payload); }, [applyPayload]);
  const loadSettings = useCallback(async () => { const payload = await requestJson<SettingsPayload>("/api/kingkong/settings", { cache: "no-store" }); setRevision(payload.revision); setAdminContactPhone(payload.adminContactPhone); setSupportSettings(payload.supportSettings); }, []);

  useEffect(() => {
    let active = true;
    requestJson<{ authenticated: boolean }>("/api/kingkong/session", { cache: "no-store" })
      .then(async result => { if (!active) return; if (!result.authenticated) return setAuthState("out"); setAuthState("in"); await Promise.all([loadShops(), loadSettings()]); })
      .catch(cause => { if (active) { setError(cause instanceof Error ? cause.message : "Backend tidak tersedia."); setAuthState("out"); } });
    return () => { active = false; };
  }, [loadSettings, loadShops]);

  useEffect(() => {
    if (!editing) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setEditing(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [editing, busy]);

  const counts = useMemo(() => shops.reduce((result, shop) => ({ ...result, [shopStatus(shop)]: result[shopStatus(shop)] + 1 }), { active: 0, upcoming: 0, expired: 0 }), [shops]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await requestJson("/api/kingkong/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      setPassword(""); setAuthState("in"); await Promise.all([loadShops(), loadSettings()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Login tidak berjaya."); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try { await requestJson("/api/kingkong/session", { method: "DELETE" }); setAuthState("out"); setShops([]); setRevision(0); setAdminContactPhone(""); setSupportSettings(structuredClone(DEFAULT_SUPPORT_SETTINGS)); setNotice(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Logout tidak berjaya."); }
    finally { setBusy(false); }
  }

  function openForm(shop?: AdminPrintShop) {
    setEditing(shop ?? "new"); setForm(formFromShop(shop)); setLogoFile(null); setRemoveLogo(false); setError(""); setNotice("");
  }

  async function saveShop(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const isNew = editing === "new";
      const target = isNew ? "/api/kingkong/shops" : `/api/kingkong/shops/${encodeURIComponent((editing as AdminPrintShop).id)}`;
      let payload = await requestJson<ShopPayload>(target, { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, shop: shopInput(form) }) });
      applyPayload(payload);
      const savedShop = payload.shop ?? payload.shops.find(shop => shop.id === (editing as AdminPrintShop).id);
      if (!savedShop) throw new Error("Kedai disimpan tetapi tidak dapat dimuat semula.");
      if (logoFile) {
        const data = new FormData(); data.set("revision", String(payload.revision)); data.set("logo", logoFile);
        payload = await requestJson<ShopPayload>(`/api/kingkong/shops/${encodeURIComponent(savedShop.id)}/logo`, { method: "PUT", body: data });
        applyPayload(payload);
      } else if (!isNew && removeLogo && (editing as AdminPrintShop).hasLogo) {
        payload = await requestJson<ShopPayload>(`/api/kingkong/shops/${encodeURIComponent(savedShop.id)}/logo`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: payload.revision }) });
        applyPayload(payload);
      }
      setEditing(null); setNotice(isNew ? "Kedai berjaya ditambah." : "Maklumat kedai dikemas kini.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kedai tidak dapat disimpan."); }
    finally { setBusy(false); }
  }

  async function deleteShop(shop: AdminPrintShop) {
    if (!window.confirm(`Padam “${shop.name}”? Tindakan ini tidak boleh dibatalkan.`)) return;
    setBusy(true); setError("");
    try {
      const payload = await requestJson<ShopPayload>(`/api/kingkong/shops/${encodeURIComponent(shop.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision }) });
      applyPayload(payload); setNotice("Kedai dipadam.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Kedai tidak dapat dipadam."); }
    finally { setBusy(false); }
  }

  async function moveShop(index: number, direction: -1 | 1) {
    const next = [...shops], target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true); setError("");
    try {
      const payload = await requestJson<ShopPayload>("/api/kingkong/shops/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, orderedIds: next.map(shop => shop.id) }) });
      applyPayload(payload); setNotice("Hierarchy paparan dikemas kini.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Susunan tidak dapat disimpan."); }
    finally { setBusy(false); }
  }

  async function saveAdminContact(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = await requestJson<SettingsPayload>("/api/kingkong/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, adminContactPhone }),
      });
      setRevision(payload.revision); setAdminContactPhone(payload.adminContactPhone); setSupportSettings(payload.supportSettings); setNotice("Nombor WhatsApp admin dikemas kini.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nombor WhatsApp admin tidak dapat disimpan."); }
    finally { setBusy(false); }
  }

  async function saveSupportSettings(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = await requestJson<SettingsPayload>("/api/kingkong/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, adminContactPhone, supportSettings }),
      });
      setRevision(payload.revision); setAdminContactPhone(payload.adminContactPhone); setSupportSettings(payload.supportSettings); setNotice("Tetapan popup kopi dikemas kini.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Tetapan popup kopi tidak dapat disimpan."); }
    finally { setBusy(false); }
  }

  function addSupportAccount() {
    const id = crypto.randomUUID(), fieldId = crypto.randomUUID();
    setSupportSettings(current => ({ ...current, accounts: [...current.accounts, { id, name: "", visible: true, fields: [{ id: fieldId, labelMs: "", labelEn: "", value: "", copy: true }] }] }));
  }

  function updateSupportAccount(id: string, update: (account: SupportAccount) => SupportAccount) {
    setSupportSettings(current => ({ ...current, accounts: current.accounts.map(account => account.id === id ? update(account) : account) }));
  }

  function removeSupportAccount(account: SupportAccount) {
    if (!window.confirm(`Padam “${account.name || "bank ini"}” daripada popup kopi?`)) return;
    setSupportSettings(current => ({ ...current, accounts: current.accounts.filter(item => item.id !== account.id) }));
  }

  function addSupportField(accountId: string) {
    updateSupportAccount(accountId, account => account.fields.length >= 12 ? account : { ...account, fields: [...account.fields, { id: crypto.randomUUID(), labelMs: "", labelEn: "", value: "", copy: false }] });
  }

  function updateSupportField(accountId: string, fieldId: string, patch: Partial<SupportField>) {
    updateSupportAccount(accountId, account => ({ ...account, fields: account.fields.map(field => field.id === fieldId ? { ...field, ...patch } : patch.copy ? { ...field, copy: false } : field) }));
  }

  function removeSupportField(accountId: string, fieldId: string) {
    updateSupportAccount(accountId, account => account.fields.length === 1 ? account : { ...account, fields: account.fields.filter(field => field.id !== fieldId) });
  }

  if (authState === "checking") return <main className="kk-shell kk-centered"><Loader2 className="kk-spin" size={28}/><p>Menyediakan panel kawalan…</p></main>;

  // eslint-disable-next-line @next/next/no-html-link-for-pages
  if (authState === "out") return <main className="kk-shell kk-login-shell"><a className="kk-back" href="/"><ArrowLeft size={15}/> Kembali ke editor</a><form className="kk-login-card" onSubmit={login}><span className="kk-brand-mark"><Store size={23}/></span><p className="kk-eyebrow">PRIVATE CONTROL</p><h1>Kingkong</h1><p>Log masuk untuk mengurus kedai cetak yang dipaparkan dalam CustomAlboom.com.</p>{error && <div className="kk-alert error" role="alert">{error}</div>}<label><span>Username</span><input autoFocus autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required/></label><label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required/></label><button className="kk-primary" disabled={busy}>{busy ? <Loader2 className="kk-spin" size={16}/> : <ShieldCheck size={16}/>} Log masuk</button><small>Protected VPS storage · style.asp</small></form></main>;

  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <main className="kk-shell"><header className="kk-header"><div><a href="/" className="kk-logo">CustomAlboom.com</a><span>Print shop control</span></div><nav className="kk-nav"><a className="active" href="/kingkong">Kedai Cetak</a><a href="/kingkong/templates">Manage Templates</a><a href="/kingkong/settings">Settings</a><button onClick={logout} disabled={busy}><LogOut size={15}/> Logout</button></nav></header><section className="kk-content"><div className="kk-hero"><div><p className="kk-eyebrow">STYLE.ASP · VPS STORAGE</p><h1>Kedai cetak</h1><p>Urus maklumat, jadual paparan dan hierarchy kad untuk popup editor.</p></div><button className="kk-primary" onClick={() => openForm()}><Plus size={17}/> Tambah kedai</button></div><div className="kk-stats"><span><strong>{shops.length}</strong> Jumlah</span><span><strong>{counts.active}</strong> Aktif</span><span><strong>{counts.upcoming}</strong> Akan datang</span><span><strong>{counts.expired}</strong> Tamat</span></div>{error && <div className="kk-alert error" role="alert">{error}<button onClick={() => { setError(""); void loadShops(); }}>Muat semula</button></div>}{notice && <div className="kk-alert success" role="status">{notice}<button aria-label="Tutup" onClick={() => setNotice("")}><X size={14}/></button></div>}{shops.length ? <div className="kk-shop-list">{shops.map((shop, index) => { const status = shopStatus(shop); return <article className="kk-shop-row" key={shop.id}>{shop.logoUrl ? <img src={shop.logoUrl} alt=""/> : <div className="kk-logo-placeholder"><Store size={22}/></div>}<div className="kk-shop-main"><div className="kk-shop-title"><span className={`kk-status ${status}`}>{status === "active" ? "Aktif" : status === "upcoming" ? "Akan datang" : "Tamat"}</span><h2>{shop.name}</h2></div><div className="kk-shop-meta">{shop.state && <span><MapPin size={13}/>{shop.state}</span>}{shop.phone && <span><Phone size={13}/>{shop.phone}</span>}{shop.link && <span><LinkIcon size={13}/>Pautan tersedia</span>}</div><small>{shop.displayFrom || shop.displayTo ? `${shop.displayFrom || "Tiada had"} → ${shop.displayTo || "Tiada had"}` : "Paparan tanpa had tarikh"}</small></div><div className="kk-order"><button title="Naikkan hierarchy" disabled={busy || index === 0} onClick={() => void moveShop(index, -1)}><ArrowUp size={15}/></button><strong>{index + 1}</strong><button title="Turunkan hierarchy" disabled={busy || index === shops.length - 1} onClick={() => void moveShop(index, 1)}><ArrowDown size={15}/></button></div><div className="kk-row-actions"><button onClick={() => openForm(shop)}><Pencil size={15}/> Edit</button><button className="kk-danger" onClick={() => void deleteShop(shop)}><Trash2 size={15}/> Padam</button></div></article>; })}</div> : <div className="kk-empty"><Store size={34}/><h2>Belum ada kedai.</h2><p>Tambah kedai pertama untuk mula mengisi popup dalam editor.</p><button className="kk-primary" onClick={() => openForm()}><Plus size={16}/> Tambah kedai</button></div>}</section>
    <SupportPhoto portrait={supportSettings.portrait} revision={revision} busy={busy} onBusy={setBusy} onSaved={(nextRevision, portrait) => { setRevision(nextRevision); setSupportSettings(current => ({ ...current, portrait })); }}/>
    <form className="kk-admin-contact" onSubmit={saveAdminContact}><div className="kk-admin-contact-copy"><span className="kk-contact-icon"><MessageCircle size={18}/></span><span><strong>Nombor WhatsApp admin</strong><small>Digunakan untuk butang “Hubungi kami” dalam popup kedai cetak.</small></span></div><label><span>Nombor telefon</span><input inputMode="tel" placeholder="Contoh: 0123456789" value={adminContactPhone} onChange={event => setAdminContactPhone(event.target.value)}/></label><button className="kk-primary" disabled={busy}><Save size={15}/> Simpan nombor</button></form>
    <form className="kk-support-settings" onSubmit={saveSupportSettings}><div className="kk-support-heading"><div><span className="kk-contact-icon"><CreditCard size={18}/></span><span><strong>Popup “Belanjalah saya kopi”</strong><small>Urus tajuk, mesej dwibahasa dan kaedah bayaran yang dipaparkan kepada pengguna.</small></span></div><button className="kk-primary" disabled={busy}><Save size={15}/> Simpan tetapan</button></div><div className="kk-support-language-grid"><section><h2>Melayu</h2><label><span>Tajuk</span><input value={supportSettings.titleMs} maxLength={160} onChange={event => setSupportSettings(current => ({ ...current, titleMs: event.target.value }))} required/></label><label><span>Mesej</span><textarea rows={6} value={supportSettings.messageMs} maxLength={4000} onChange={event => setSupportSettings(current => ({ ...current, messageMs: event.target.value }))} required/></label></section><section><h2>English</h2><label><span>Title</span><input value={supportSettings.titleEn} maxLength={160} onChange={event => setSupportSettings(current => ({ ...current, titleEn: event.target.value }))} required/></label><label><span>Message</span><textarea rows={6} value={supportSettings.messageEn} maxLength={4000} onChange={event => setSupportSettings(current => ({ ...current, messageEn: event.target.value }))} required/></label></section></div><div className="kk-support-accounts-heading"><div><strong>Bank dan kaedah bayaran</strong><small>Setiap kad boleh mempunyai beberapa label, tetapi hanya satu nilai boleh dijadikan butang salin.</small></div><button type="button" onClick={addSupportAccount} disabled={busy || supportSettings.accounts.length >= 20}><Plus size={15}/> Tambah bank</button></div><div className="kk-support-accounts">{supportSettings.accounts.length ? supportSettings.accounts.map((account, accountIndex) => <article className="kk-support-account" key={account.id}><header><span className="kk-support-account-number">{accountIndex + 1}</span><label className="kk-support-account-name"><span>Nama bank / payment method</span><input value={account.name} maxLength={100} placeholder="Contoh: Maybank" onChange={event => updateSupportAccount(account.id, current => ({ ...current, name: event.target.value }))} required/></label><label className="kk-support-visible">{account.visible ? <Eye size={15}/> : <EyeOff size={15}/>}<input type="checkbox" checked={account.visible} onChange={event => updateSupportAccount(account.id, current => ({ ...current, visible: event.target.checked }))}/> Show</label><button type="button" className="kk-danger" title="Padam bank" onClick={() => removeSupportAccount(account)}><Trash2 size={15}/> Padam</button></header><div className="kk-support-field-labels"><span>Label Melayu</span><span>English label</span><span>Nilai yang dipaparkan</span><span>Salin</span><i/></div><div className="kk-support-fields">{account.fields.map(field => <div className="kk-support-field" key={field.id}><input aria-label="Label Melayu" value={field.labelMs} maxLength={80} placeholder="Nama" onChange={event => updateSupportField(account.id, field.id, { labelMs: event.target.value })} required/><input aria-label="English label" value={field.labelEn} maxLength={80} placeholder="Name" onChange={event => updateSupportField(account.id, field.id, { labelEn: event.target.value })} required/><input aria-label="Nilai" value={field.value} maxLength={240} placeholder="Shamir Adnan" onChange={event => updateSupportField(account.id, field.id, { value: event.target.value })} required/><label className="kk-copy-choice" title="Paparkan butang salin untuk nilai ini"><input type="checkbox" checked={field.copy} onChange={event => updateSupportField(account.id, field.id, { copy: event.target.checked })}/><span>Copy</span></label><button type="button" title="Padam label" disabled={account.fields.length === 1} onClick={() => removeSupportField(account.id, field.id)}><X size={14}/></button></div>)}</div><button type="button" className="kk-add-field" disabled={account.fields.length >= 12} onClick={() => addSupportField(account.id)}><Plus size={14}/> Tambah label</button></article>) : <div className="kk-support-empty"><CreditCard size={25}/><span>Tiada bank dipaparkan. Mesej masih akan muncul tanpa kad bayaran.</span><button type="button" onClick={addSupportAccount}><Plus size={14}/> Tambah bank</button></div>}</div><div className="kk-support-save"><span>Perubahan hanya dipaparkan selepas disimpan.</span><button className="kk-primary" disabled={busy}><Save size={15}/> Simpan tetapan popup</button></div></form>
    {editing && <div className="kk-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setEditing(null); }}><form className="kk-modal" onSubmit={saveShop}><button type="button" className="kk-modal-close" aria-label="Tutup" onClick={() => setEditing(null)} disabled={busy}><X size={18}/></button><p className="kk-eyebrow">{editing === "new" ? "NEW PRINT SHOP" : "EDIT PRINT SHOP"}</p><h2>{editing === "new" ? "Tambah kedai cetak" : "Kemas kini kedai"}</h2><div className="kk-form-grid"><label className="kk-full"><span>Nama kedai *</span><input autoFocus value={form.name} maxLength={120} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} required/></label><label className="kk-full"><span>Alamat</span><textarea value={form.address} maxLength={500} rows={3} onChange={event => setForm(current => ({ ...current, address: event.target.value }))}/></label><label><span>Negeri</span><select value={form.state} onChange={event => setForm(current => ({ ...current, state: event.target.value }))}><option value="">Pilih negeri</option>{MALAYSIA_STATES.map(state => <option key={state}>{state}</option>)}</select></label><label><span>Nombor telefon</span><input inputMode="tel" value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))}/></label><label className="kk-full"><span>Link kedai</span><input type="url" placeholder="https://…" value={form.link} onChange={event => setForm(current => ({ ...current, link: event.target.value }))}/></label><label><span>Papar dari</span><input type="date" value={form.displayFrom} onChange={event => setForm(current => ({ ...current, displayFrom: event.target.value }))}/></label><label><span>Papar hingga</span><input type="date" value={form.displayTo} onChange={event => setForm(current => ({ ...current, displayTo: event.target.value }))}/></label><div className="kk-form-section kk-full"><strong>Contact person</strong><small>Kedua-dua medan perlu diisi bersama untuk mengaktifkan WhatsApp.</small></div><label><span>Nama contact</span><input value={form.contactName} maxLength={120} onChange={event => setForm(current => ({ ...current, contactName: event.target.value }))}/></label><label><span>Telefon contact</span><input inputMode="tel" value={form.contactPhone} onChange={event => setForm(current => ({ ...current, contactPhone: event.target.value }))}/></label><div className="kk-logo-field kk-full"><div><ImagePlus size={18}/><span><strong>Logo kedai</strong><small>PNG, JPEG atau WebP · maksimum 1 MB</small></span></div><label className="kk-upload"><Upload size={14}/>{logoFile ? logoFile.name : "Pilih logo"}<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => { setLogoFile(event.target.files?.[0] ?? null); setRemoveLogo(false); }}/></label>{editing !== "new" && editing.hasLogo && !logoFile && <label className="kk-remove-logo"><input type="checkbox" checked={removeLogo} onChange={event => setRemoveLogo(event.target.checked)}/> Padam logo sedia ada</label>}</div></div>{error && <div className="kk-alert error" role="alert">{error}</div>}<div className="kk-modal-actions"><button type="button" onClick={() => setEditing(null)} disabled={busy}>Batal</button><button className="kk-primary" disabled={busy || !form.name.trim()}>{busy ? <Loader2 className="kk-spin" size={16}/> : <Save size={16}/>} Simpan kedai</button></div></form></div>}
  </main>;
}
