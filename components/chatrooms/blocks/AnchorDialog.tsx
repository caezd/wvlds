"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AnchorDialog({
  open,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSend: (content: string) => void;
}) {
  const t = useTranslations("chatrooms");
  const [label, setLabel] = useState("");

  function handleSend() {
    const trimmed = label.trim();
    if (!trimmed) return;
    onSend(JSON.stringify({ _type: "anchor", label: trimmed }));
    setLabel("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setLabel(""); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Anchor className="h-4 w-4" />
            {t("anchorTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <Label htmlFor="anchor-label">{t("anchorLabel")}</Label>
          <Input
            id="anchor-label"
            placeholder={t("anchorPlaceholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setLabel(""); onOpenChange(false); }}>
            {t("cancelEdit")}
          </Button>
          <Button onClick={handleSend} disabled={!label.trim()}>
            {t("callout.insert")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
