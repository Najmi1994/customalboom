import type { Metadata } from "next";
import KingkongSettings from "./KingkongSettings";
import "../kingkong.css";
import "./settings.css";

export const metadata: Metadata = {
  title: "Settings | CustomAlboom.com",
  robots: { index: false, follow: false, nocache: true },
};

export default function KingkongSettingsPage() {
  return <KingkongSettings />;
}
