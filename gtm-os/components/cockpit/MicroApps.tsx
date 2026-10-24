"use client";

import { LayoutGrid, ArrowUpRight, Clapperboard, QrCode, LineChart } from "lucide-react";
import { Panel, Row } from "./Panel";
import { useNavigate } from "@/lib/motion/nav";

type App = { name: string; desc: string; icon: React.ReactNode; href: string };

const APPS: App[] = [
  { name: "Content Studio", desc: "ideas, scripts, crew and library", icon: <Clapperboard size={15} />, href: "/studio/" },
  { name: "QR & tracked URLs", desc: "build and register every offline link", icon: <QrCode size={15} />, href: "/qr/" },
  { name: "Marketing cost target", desc: "all-in cost against the 28% target", icon: <LineChart size={15} />, href: "/reports/workbench/?board=board-efficiency-target" },
];

export function MicroApps() {
  const navigate = useNavigate();
  return (
    <Panel icon={<LayoutGrid size={13} />} title="Tools">
      {APPS.map((a) => (
        <Row
          key={a.name}
          onClick={() => navigate(a.href)}
          left={<span className="self-center text-muted-foreground">{a.icon}</span>}
          primary={
            <span>
              <span className="font-semibold">{a.name}</span>
              <span className="ml-2 hidden text-[11px] text-muted-foreground xl:inline">{a.desc}</span>
            </span>
          }
          right={<ArrowUpRight size={13} className="self-center text-muted-foreground" />}
        />
      ))}
    </Panel>
  );
}
