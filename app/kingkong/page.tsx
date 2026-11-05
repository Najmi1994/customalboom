import type { Metadata } from "next";
import KingkongAdmin from "./KingkongAdmin";
import "./kingkong.css";
import "./support-settings.css";

export const metadata: Metadata = {
  title: "Print Shop Control | CustomAlboom.com",
  robots: { index: false, follow: false, nocache: true },
};

export default function KingkongPage() {
  return <KingkongAdmin />;
}
