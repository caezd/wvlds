import { cn } from "@/lib/utils";

export function PresenceDot({
  state,
  className,
}: {
  state: "online" | "away" | "offline";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full",
        state === "online" ? "bg-[#58F4A8]" : state === "away" ? "bg-orange-400" : "bg-muted-foreground/40",
        className,
      )}
    />
  );
}
