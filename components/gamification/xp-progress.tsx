// XPProgress.tsx (exemple React)
import { Flame } from "lucide-react";
import { levelInfo } from "@/lib/xp";
type Props = { xp: number; coins: number; streak: number; className?: string };

export function XPProgress({ xp, coins, streak, className }: Props) {
    const { level, progress } = levelInfo(xp);

    return (
        <div className={className}>
            <div className="text-sm mb-1">
                Niveau {level} • {xp} XP • {coins} 🪙 • <Flame /> {streak}
            </div>
            <div className="h-2 w-full bg-zinc-200 rounded-full overflow-hidden">
                <div
                    className="h-full bg-zinc-900"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}
