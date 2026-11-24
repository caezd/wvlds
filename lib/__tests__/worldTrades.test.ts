import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  MAX_TRANSFER_ITEMS,
  canTradeWith,
  transferBlockContent,
  transferIsEmpty,
  worldHasTrades,
} from "@/lib/worldTrades";
import { parseChatBlock } from "@/lib/chat-blocks";

describe("worldHasTrades", () => {
  it("exige l'option Échanges, et de quoi échanger : la monnaie ou les objets", () => {
    expect(worldHasTrades({ enable_trades: true, enable_economy: true, enable_inventory: false })).toBe(true);
    expect(worldHasTrades({ enable_trades: true, enable_economy: false, enable_inventory: true })).toBe(true);
    expect(worldHasTrades({ enable_trades: true, enable_economy: false, enable_inventory: false })).toBe(false);
    expect(worldHasTrades({ enable_trades: false, enable_economy: true, enable_inventory: true })).toBe(false);
    expect(worldHasTrades({ enable_economy: true, enable_inventory: true })).toBe(false);
    expect(worldHasTrades(null)).toBe(false);
  });
});

describe("canTradeWith", () => {
  const brom = { id: "p1", user_id: "u1" };
  it("jamais avec soi-même", () => {
    expect(canTradeWith(brom, brom, true)).toBe(false);
  });
  it("un autre persona du même compte : seulement si le monde l'autorise", () => {
    const jumeau = { id: "p2", user_id: "u1" };
    expect(canTradeWith(brom, jumeau, false)).toBe(false);
    expect(canTradeWith(brom, jumeau, true)).toBe(true);
  });
  it("le persona d'un autre joueur, toujours", () => {
    expect(canTradeWith(brom, { id: "p3", user_id: "u2" }, false)).toBe(true);
  });
});

describe("transferIsEmpty", () => {
  it("vide sans montant ni objet", () => {
    expect(transferIsEmpty(null, [])).toBe(true);
    expect(transferIsEmpty(0, [])).toBe(true);
    expect(transferIsEmpty(5, [])).toBe(false);
    expect(transferIsEmpty(null, [{ id: "i1", quantity: 1 }])).toBe(false);
  });
});

describe("bloc de transfert", () => {
  it("le message ne porte que l'identifiant : le contenu est lu en base", () => {
    const content = transferBlockContent("t1");
    expect(JSON.parse(content)).toEqual({ _type: "transfer", id: "t1" });
    expect(parseChatBlock(content)).toEqual({ _type: "transfer", id: "t1" });
  });
  it("au plus une vingtaine d'objets par transfert", () => {
    expect(MAX_TRANSFER_ITEMS).toBe(20);
  });
});

describe("migration 251", () => {
  const sql = readFileSync(path.join(process.cwd(), "migrations/251_world_trades.sql"), "utf8");

  it("deux options coupées par défaut", () => {
    expect(sql).toMatch(/enable_trades\s+boolean\s+NOT NULL DEFAULT false/);
    expect(sql).toMatch(/trades_same_account\s+boolean\s+NOT NULL DEFAULT false/);
  });

  it("les transferts ne s'écrivent que par la RPC, et se lisent entre membres du monde", () => {
    expect(sql).toMatch(/ALTER TABLE public\.world_transfers ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FOR SELECT TO authenticated\s+USING \(public\.is_world_member\(world_id, \(SELECT auth\.uid\(\)\)\)\)/);
    expect(sql).not.toMatch(/ON public\.world_transfers\s+FOR (INSERT|UPDATE|DELETE)/);
  });

  it("les soldes passent par economy_apply, journalisés en `transfer`", () => {
    expect(sql).toMatch(/kind IN \('adjust', 'slots', 'purchase', 'sale', 'transfer'\)/);
    expect(sql).toMatch(/economy_apply\(\s*p_from, -p_amount, 'transfer'/);
    expect(sql).toMatch(/economy_apply\(\s*p_to, p_amount, 'transfer'/);
  });

  it("refuse le même compte sauf si le monde l'autorise", () => {
    expect(sql).toMatch(/NOT v_same_ok AND v_from\.user_id = v_to\.user_id/);
  });

  it("la RPC n'est ouverte qu'aux connectés", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.transfer_to_persona\(uuid, uuid, bigint, jsonb, uuid\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.transfer_to_persona\(uuid, uuid, bigint, jsonb, uuid\) TO authenticated;/);
  });
});
