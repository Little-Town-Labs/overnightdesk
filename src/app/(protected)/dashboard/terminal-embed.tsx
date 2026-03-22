"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

interface TerminalEmbedProps {
  wsUrl: string;
  ticket: string;
  onDisconnect?: () => void;
}

export function TerminalEmbed({ wsUrl, ticket, onDisconnect }: TerminalEmbedProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!terminalRef.current) return;

    let terminal: InstanceType<typeof import("@xterm/xterm").Terminal> | null = null;
    let ws: WebSocket | null = null;

    async function init() {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { AttachAddon } = await import("@xterm/addon-attach");

      terminal = new Terminal({
        theme: {
          background: "#09090b",
          foreground: "#fafafa",
          cursor: "#fafafa",
          selectionBackground: "#3f3f46",
        },
        fontSize: 14,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
        cursorBlink: true,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      if (terminalRef.current) {
        terminal.open(terminalRef.current);
        fitAddon.fit();
      }

      // Connect WebSocket
      const fullUrl = `${wsUrl}?ticket=${ticket}`;
      ws = new WebSocket(fullUrl);

      ws.onopen = () => {
        setLoading(false);
        const attachAddon = new AttachAddon(ws!);
        terminal!.loadAddon(attachAddon);
      };

      ws.onerror = () => {
        setError("Connection failed. Please try again.");
        setLoading(false);
      };

      ws.onclose = () => {
        setLoading(false);
        onDisconnect?.();
      };

      // Resize handler
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      if (terminalRef.current) {
        resizeObserver.observe(terminalRef.current);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }

    const cleanup = init();

    return () => {
      cleanup.then((fn) => fn?.());
      ws?.close();
      terminal?.dispose();
    };
  }, [wsUrl, ticket, onDisconnect]);

  if (error) {
    return (
      <div className="bg-zinc-950 border border-red-500/30 rounded-lg p-4 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 rounded-lg z-10">
          <p className="text-zinc-400 text-sm">Connecting to your instance...</p>
        </div>
      )}
      <div
        ref={terminalRef}
        className="bg-zinc-950 rounded-lg overflow-hidden"
        style={{ height: "350px" }}
      />
    </div>
  );
}
