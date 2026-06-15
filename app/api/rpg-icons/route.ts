import { readdirSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  const dir = join(process.cwd(), "public", "rpg_icons");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".svg"))
    .sort();
  return NextResponse.json(files);
}
