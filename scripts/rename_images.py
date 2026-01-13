from __future__ import annotations

import argparse
import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Set, Tuple

RAW_PATTERN = re.compile(r"^(?P<id>\d+)#(?P<hex>[0-9A-Fa-f]{6})i_")
HEX_ANYWHERE = re.compile(r"(?i)(?<![0-9a-f])[0-9a-f]{6}(?![0-9a-f])")


@dataclass(frozen=True)
class Op:
    src: Path
    dst: Path


def parse_raw_stem(stem: str) -> Tuple[str, str] | None:
    """
    Ex: "5489744#565656i_QxJttTbzPRqICvtW" -> ("5489744", "565656")
    """
    m = RAW_PATTERN.match(stem)
    if not m:
        return None
    return m.group("id"), m.group("hex").upper()


def iter_target_dirs(root: Path, include_root: bool) -> List[Path]:
    dirs: List[Path] = []
    if include_root:
        dirs.append(root)
    for p in root.iterdir():
        if p.is_dir():
            dirs.append(p)
    return dirs


def detect_existing_index_style(folder: str, d: Path) -> Tuple[int, int]:
    """
    Cherche des fichiers déjà renommés du style:
      folder_01_565656.png
      folder_2_FFFFFF.webp
      folder_03_ABCDEF_dup02.png
    Retourne:
      (max_index, width_detected)
    width_detected = longueur max du token index trouvé ("01" => 2, "2" => 1)
    """
    # On matche sur le stem (sans extension) pour tolérer différentes extensions
    # stem: folder_<idx>_<hex>[_dupNN]
    pat = re.compile(
        rf"^{re.escape(folder)}_(?P<idx>\d+)_"
        r"(?P<hex>[0-9A-Fa-f]{6})(?:_dup\d+)?$"
    )

    max_idx = 0
    max_len = 0

    for f in d.iterdir():
        if not f.is_file():
            continue
        m = pat.match(f.stem)
        if not m:
            continue
        idx_str = m.group("idx")
        try:
            idx = int(idx_str)
        except ValueError:
            continue
        if idx > max_idx:
            max_idx = idx
        if len(idx_str) > max_len:
            max_len = len(idx_str)

    return max_idx, max_len


def safe_unique_target(
    proposed: Path, used: Set[Path], moving_sources: Set[Path]
) -> Path:
    """
    Assure une cible unique:
    - pas déjà utilisée
    - ne pointe pas vers un fichier existant non-déplacé
    """
    if proposed not in used and (not proposed.exists() or proposed in moving_sources):
        used.add(proposed)
        return proposed

    base = proposed.with_suffix("")  # sans extension
    ext = proposed.suffix
    n = 2
    while True:
        cand = Path(f"{base}_dup{n:02d}{ext}")
        if cand not in used and (not cand.exists() or cand in moving_sources):
            used.add(cand)
            return cand
        n += 1


def plan_ops_for_dir(
    d: Path,
    force_ext: str | None,
    default_ext: str,
    verbose: bool,
) -> Tuple[List[Op], Dict[str, Set[str]], Set[str]]:
    folder = d.name
    files = [p for p in d.iterdir() if p.is_file()]

    # 1) détecter index existant (sur fichiers déjà renommés)
    existing_max, existing_width = detect_existing_index_style(folder, d)

    # 2) collecter fichiers "raw" à renommer (ID#HEXi_...)
    parsed: List[Tuple[Path, str, str]] = []
    seen_ids: Set[str] = set()
    colors_by_id: Dict[str, Set[str]] = {}

    for f in files:
        got = parse_raw_stem(f.stem)
        if not got:
            continue
        _id, color = got
        parsed.append((f, _id, color))
        seen_ids.add(_id)
        colors_by_id.setdefault(_id, set()).add(color)

    if not parsed:
        # Même si rien à renommer, on peut quand même collecter les couleurs du dossier
        all_colors_in_folder: Set[str] = set()
        for f in files:
            for hx in HEX_ANYWHERE.findall(f.name):
                all_colors_in_folder.add(hx.upper())
        return [], {}, all_colors_in_folder

    # 3) index stable par ID (tri numérique) + offset (existing_max)
    ids_sorted = sorted(seen_ids, key=lambda x: int(x))

    # largeur: si des fichiers existent déjà, on conserve leur largeur (01 => width=2)
    # sinon, largeur minimale 2 (01, 02, ...)
    if existing_max > 0 and existing_width > 0:
        width = existing_width
    else:
        width = max(2, len(str(len(ids_sorted))))

    start_index = existing_max + 1
    id_to_index = {id_: start_index + i for i, id_ in enumerate(ids_sorted)}

    # 4) planifier renommages
    used_targets: Set[Path] = set()
    moving_sources = {f for (f, _, _) in parsed}  # seulement ceux qu'on va déplacer
    ops: List[Op] = []
    all_colors_in_folder: Set[str] = set()

    # ajoute aussi les couleurs présentes dans d'autres fichiers déjà renommés
    for f in files:
        for hx in HEX_ANYWHERE.findall(f.name):
            all_colors_in_folder.add(hx.upper())

    for f, _id, color in parsed:
        all_colors_in_folder.add(color)

        idx = id_to_index[_id]
        idx_str = f"{idx:0{width}d}" if width > 1 else str(idx)

        out_ext = (
            force_ext or (f.suffix.lstrip(".") if f.suffix else default_ext)
        ).lower()
        target_base = f"{folder}_{idx_str}_{color}"
        proposed = d / f"{target_base}.{out_ext}"

        dst = safe_unique_target(proposed, used_targets, moving_sources)

        if verbose:
            print(f"[PLAN] {f.name} -> {dst.name}")

        if f.resolve() != dst.resolve():
            ops.append(Op(src=f, dst=dst))

    return ops, colors_by_id, all_colors_in_folder


def execute_ops(ops: List[Op], dry_run: bool, verbose: bool) -> None:
    if not ops:
        return

    # Phase 1: src -> tmp (même dossier)
    tmp_map: List[Tuple[Path, Path]] = []
    for op in ops:
        tmp = op.src.with_name(f".__renametmp__{uuid.uuid4().hex}{op.src.suffix or ''}")
        while tmp.exists():
            tmp = op.src.with_name(
                f".__renametmp__{uuid.uuid4().hex}{op.src.suffix or ''}"
            )
        tmp_map.append((tmp, op.dst))

        if dry_run:
            print(f"[DRY] MOVE  {op.src} -> {tmp}")
        else:
            if verbose:
                print(f"[MOVE]  {op.src.name} -> {tmp.name}")
            op.src.rename(tmp)

    # Phase 2: tmp -> dst
    for tmp, dst in tmp_map:
        if dry_run:
            print(f"[DRY] RENAME {tmp} -> {dst}")
        else:
            if verbose:
                print(f"[RENAME] {tmp.name} -> {dst.name}")
            if dst.exists():
                raise FileExistsError(f"Cible existe déjà (refus d'écraser): {dst}")
            tmp.rename(dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Dossier racine contenant les sous-dossiers d'images",
    )
    ap.add_argument(
        "--out",
        default="colors.json",
        help="Fichier JSON de sortie (défaut: colors.json)",
    )
    ap.add_argument(
        "--dry-run", action="store_true", help="Simulation (ne renomme rien)"
    )
    ap.add_argument("--verbose", action="store_true", help="Logs détaillés")
    ap.add_argument("--force-ext", default=None, help="Force l'extension (ex: png)")
    ap.add_argument(
        "--default-ext",
        default="png",
        help="Ext par défaut si aucune extension détectée (défaut: png)",
    )
    ap.add_argument(
        "--include-root",
        action="store_true",
        help="Traite aussi le dossier root lui-même",
    )
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Root introuvable ou invalide: {root}")

    out_path = Path(args.out).resolve()
    force_ext = args.force_ext.lstrip(".") if args.force_ext else None
    default_ext = args.default_ext.lstrip(".") if args.default_ext else "png"

    data = {
        "folders": {},
        "all_colors": [],
    }
    global_colors: Set[str] = set()
    all_ops: List[Op] = []

    for d in iter_target_dirs(root, args.include_root):
        ops, colors_by_id, all_colors_in_folder = plan_ops_for_dir(
            d=d,
            force_ext=force_ext,
            default_ext=default_ext,
            verbose=args.verbose,
        )

        # Toujours enregistrer les couleurs du dossier si trouvées
        if all_colors_in_folder:
            folder_name = d.name
            data["folders"].setdefault(folder_name, {})
            data["folders"][folder_name]["all_colors"] = sorted(all_colors_in_folder)
            global_colors |= all_colors_in_folder

        # ids => seulement si on a des fichiers raw à renommer
        if colors_by_id:
            folder_name = d.name
            data["folders"].setdefault(folder_name, {})
            data["folders"][folder_name]["ids"] = {
                id_: sorted(list(colors))
                for id_, colors in sorted(colors_by_id.items(), key=lambda x: int(x[0]))
            }

        all_ops.extend(ops)

    print(
        f"\n--- {'DRY RUN' if args.dry_run else 'EXECUTION'}: {len(all_ops)} renommages planifiés ---"
    )
    execute_ops(all_ops, dry_run=args.dry_run, verbose=args.verbose)

    data["all_colors"] = sorted(global_colors)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"\nJSON écrit: {out_path}")
    print(f"Couleurs totales: {len(data['all_colors'])}")


if __name__ == "__main__":
    main()
