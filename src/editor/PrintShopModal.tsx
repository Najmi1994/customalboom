import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, MapPin, MessageCircle, Phone, Store } from "lucide-react";
import type { PublicPrintShop } from "../print-shops/domain";
import Modal from "./Modal";

export default function PrintShopModal({ onClose }: { onClose: () => void }) {
  const [shops, setShops] = useState<PublicPrintShop[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [adminWhatsappUrl, setAdminWhatsappUrl] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/print-shops", { cache: "no-store" });
      const result = await response.json() as { shops?: PublicPrintShop[]; adminWhatsappUrl?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Senarai kedai tidak dapat dimuatkan.");
      setShops(result.shops ?? []);
      setAdminWhatsappUrl(result.adminWhatsappUrl ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Senarai kedai tidak dapat dimuatkan.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <Modal title="Pilih kedai cetak untuk album anda." eyebrow="PRINT PARTNERS" onClose={onClose} wide className="print-shop-modal">
    <p className="modal-description">Kedai yang sedang menerima tempahan dipaparkan mengikut pilihan CustomAlboom.com.</p>
    {loading ? <div className="print-shop-state"><Loader2 className="spin" size={25}/><p>Mencari kedai yang tersedia…</p></div> : error ? <div className="print-shop-state error"><Store size={29}/><p>{error}</p><button onClick={() => void load()}>Cuba lagi</button></div> : shops.length ? <div className="print-shop-grid">{shops.map(shop => <article className={`print-shop-card${shop.logoUrl ? ' has-logo' : ''}`} key={shop.id}>{shop.logoUrl && <div className="print-shop-logo"><img src={shop.logoUrl} alt={`Logo ${shop.name}`}/></div>}<div className="print-shop-card-body"><h3>{shop.name}</h3><div className="print-shop-meta">{shop.address && <span className="print-shop-address">{shop.address}</span>}{shop.state && <span className="print-shop-detail"><MapPin size={13}/><span>{shop.state}</span></span>}{shop.phone && <a className="print-shop-detail" href={`tel:${shop.phone}`}><Phone size={13}/><span>{shop.phone}</span></a>}{shop.link && <a className="print-shop-link" href={shop.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={13}/> Link kedai</a>}</div></div>{shop.whatsappUrl && <a className="print-shop-whatsapp" href={shop.whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={14}/> WhatsApp</a>}</article>)}</div> : <div className="print-shop-state"><Store size={31}/><h3>Belum ada kedai aktif.</h3><p>Senarai akan muncul di sini apabila kedai tersedia dalam tempoh paparannya.</p></div>}
    <div className="print-shop-admin-cta"><strong>Nak papar kedai cetak anda di sini? Klik WhatsApp Kami</strong>{adminWhatsappUrl && <a href={adminWhatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={14}/> WhatsApp kami</a>}</div>
  </Modal>;
}
