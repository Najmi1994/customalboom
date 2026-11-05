import type { Metadata } from "next";
import TemplateAdmin from "./TemplateAdmin";
import "../kingkong.css";
import "./templates.css";

export const metadata: Metadata = { title: "Manage Templates | CustomAlboom.com", robots: { index: false, follow: false, nocache: true } };
export default function TemplatesPage() { return <TemplateAdmin/>; }
