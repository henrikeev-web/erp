"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Bell, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

interface Notice { id: string; title: string; body: string; kind: "POPUP" | "NOTICE"; level: "INFO" | "SUCCESS" | "WARNING"; startsAt: string; read: boolean }

const LEVEL = {
  INFO: { bar: "bg-blue-500", soft: "bg-blue-50 text-blue-800", Icon: Info },
  SUCCESS: { bar: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-800", Icon: CheckCircle2 },
  WARNING: { bar: "bg-amber-500", soft: "bg-amber-50 text-amber-800", Icon: TriangleAlert },
} as const;

/**
 * Avisos da matriz no painel da franquia: pop-up ao entrar (um por vez, até "Entendi", uma vez por usuário)
 * e sino com todos os avisos. Só é montado em franquias (a matriz é quem escreve).
 */
export default function AnnouncementsHost() {
  const [list, setList] = useState<Notice[]>([]);
  const [bell, setBell] = useState(false);
  const [viewing, setViewing] = useState<Notice | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(() => axios.get("/api/meus-avisos").then(({ data }) => setList(data)).catch(() => undefined), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  const markRead = async (n: Notice) => {
    setList((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    await axios.post(`/api/meus-avisos/${n.id}/lido`).catch(() => undefined);
  };

  // Pop-up: o mais recente ainda não lido e não dispensado nesta sessão
  const popup = viewing ?? list.find((n) => n.kind === "POPUP" && !n.read && !dismissed.has(n.id)) ?? null;
  const unread = list.filter((n) => !n.read).length;

  const close = () => {
    if (!popup) return;
    if (!popup.read) markRead(popup);
    setDismissed((d) => new Set(d).add(popup.id));
    setViewing(null);
  };

  return (
    <>
      <div className="fixed top-3 right-4 z-40">
        <button onClick={() => setBell((b) => !b)} aria-label="Avisos da matriz" className="relative w-10 h-10 rounded-full bg-white shadow-md border border-zinc-200 flex items-center justify-center hover:bg-zinc-50">
          <Bell className="w-5 h-5 text-zinc-600" />
          {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">{unread}</span>}
        </button>
        {bell && (
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-2xl shadow-xl border border-zinc-200">
            <div className="px-4 py-3 border-b border-zinc-100 text-sm font-semibold text-zinc-800">Avisos da matriz</div>
            {list.length === 0 ? <p className="px-4 py-6 text-sm text-zinc-400 text-center">Nenhum aviso</p> : list.map((n) => {
              const L = LEVEL[n.level];
              return (
                <button key={n.id} onClick={() => { setBell(false); setViewing(n); }} className="w-full text-left px-4 py-3 border-b border-zinc-50 last:border-0 hover:bg-zinc-50 flex gap-2.5">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-zinc-200" : L.bar}`} />
                  <span className="min-w-0"><span className={`block text-sm truncate ${n.read ? "text-zinc-600" : "font-semibold text-zinc-900"}`}>{n.title}</span><span className="block text-xs text-zinc-400 truncate">{n.body.replace(/\s+/g, " ")}</span></span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {popup && (() => {
        const L = LEVEL[popup.level];
        return (
          <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className={`h-1.5 ${L.bar}`} />
              <div className="p-6">
                <div className="flex items-start gap-3">
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${L.soft}`}><L.Icon className="w-5 h-5" /></span>
                  <h3 className="flex-1 text-lg font-bold text-zinc-900 leading-snug pt-1">{popup.title}</h3>
                  <button onClick={close} aria-label="Fechar" className="text-zinc-400 hover:text-zinc-700"><X className="w-5 h-5" /></button>
                </div>
                <p className="mt-3 text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">{popup.body}</p>
                <button onClick={close} className="mt-5 w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm">Entendi</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
