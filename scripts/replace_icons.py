#!/usr/bin/env python3
import re
from pathlib import Path

DOSSIER = Path("public/rpg_icons")
DRY_RUN = False  # mets True pour prévisualiser sans rien écrire

# Capture #fff ET #ffffff, insensible à la casse
motif = re.compile(r"#(?:ffffff|fff)\b", re.IGNORECASE)

modifies = 0
for svg in DOSSIER.rglob("*.svg"):
    texte = svg.read_text(encoding="utf-8")
    nouveau, n = motif.subn("currentColor", texte)
    if n:
        modifies += 1
        if not DRY_RUN:
            svg.write_text(nouveau, encoding="utf-8")
        print(f"{svg}  →  {n} remplacement(s)")

print(f"\n{'[DRY RUN] ' if DRY_RUN else ''}{modifies} fichier(s) concerné(s).")