"""Rebuild Christian's complete atlas from the four supplied sprite sheets."""

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "personagens" / "Christian"
FIGHTER_DIR = ROOT / "assets" / "fighters" / "christian"
CATALOG_JSON = ROOT / "assets" / "sprite-catalog.json"
ATLAS_WIDTH = 2048
ATLAS_PADDING = 4


def keyed_rgba(image):
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    border = np.stack((rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]))
    background = np.median(border, axis=0)
    green_dominance = rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    alpha = np.clip((180.0 - green_dominance) / 145.0, 0.0, 1.0)
    alpha[green_dominance <= 35.0] = 1.0
    alpha[green_dominance >= 180.0] = 0.0
    safe_alpha = np.maximum(alpha, 0.01)[:, :, None]
    cleaned = (rgb - background[None, None, :] * (1.0 - alpha[:, :, None])) / safe_alpha
    cleaned = np.clip(cleaned, 0, 255).astype(np.uint8)
    alpha8 = np.clip(alpha * 255.0 + 0.5, 0, 255).astype(np.uint8)
    alpha8[alpha8 < 8] = 0
    cleaned[alpha8 == 0] = 0
    return Image.fromarray(np.dstack((cleaned, alpha8)), "RGBA")


def connected_components(mask):
    """Return silhouette component bounds using row run-lengths."""
    parent = []
    stats = []

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left, right):
        left, right = find(left), find(right)
        if left != right:
            parent[right] = left

    previous = []
    height, width = mask.shape
    for y in range(height):
        row = mask[y]
        edges = np.flatnonzero(np.diff(np.pad(row.astype(np.int8), (1, 1))))
        current = []
        for start, end in zip(edges[::2], edges[1::2]):
            end -= 1
            index = len(parent)
            parent.append(index)
            stats.append([int(start), y, int(end), y, int(end - start + 1)])
            current.append((int(start), int(end), index))
        left_index = 0
        for start, end, index in current:
            while left_index < len(previous) and previous[left_index][1] < start - 1:
                left_index += 1
            test_index = left_index
            while test_index < len(previous) and previous[test_index][0] <= end + 1:
                union(index, previous[test_index][2])
                test_index += 1
        previous = current

    components = {}
    for index, stat in enumerate(stats):
        root = find(index)
        x0, y0, x1, y1, area = stat
        if root not in components:
            components[root] = [x0, y0, x1, y1, area, []]
        else:
            comp = components[root]
            comp[0] = min(comp[0], x0)
            comp[1] = min(comp[1], y0)
            comp[2] = max(comp[2], x1)
            comp[3] = max(comp[3], y1)
            comp[4] += area
        components[root][5].append((y0, x0, x1))
    return list(components.values())


def component_mask(component):
    x0, y0, x1, y1 = component[:4]
    local = np.zeros((y1 - y0 + 1, x1 - x0 + 1), dtype=bool)
    for y, start, end in component[5]:
        local[y - y0, start - x0:end - x0 + 1] = True
    return local


def make_frame(sheet_id, row, column, rgba, silhouette, bounds, row_bottom, cell_width):
    x0, y0, x1, y1 = bounds
    x0, y0 = max(0, x0 - 1), max(0, y0 - 1)
    x1, y1 = min(rgba.width - 1, x1 + 1), min(rgba.height - 1, y1 + 1)
    mask = silhouette[y0:y1 + 1, x0:x1 + 1]
    crop = np.asarray(rgba.crop((x0, y0, x1 + 1, y1 + 1))).copy()
    crop[:, :, 3] = np.where(mask, crop[:, :, 3], 0).astype(np.uint8)
    crop[crop[:, :, 3] == 0, :3] = 0
    image = Image.fromarray(crop, "RGBA")
    bbox = image.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"Sheet {sheet_id}, row {row}, column {column}: empty frame")
    left, top, right, bottom = bbox
    image = image.crop(bbox)
    rect = {"x": x0 + left, "y": y0 + top, "width": right - left, "height": bottom - top}
    frame_id = f"s{sheet_id}-r{row:02d}-c{column:02d}"
    role = "body"
    if sheet_id == 4 and row in (3, 4):
        role = "impact" if row == 4 and column == 3 else "projectile"
    source_pivot_x = (column - 0.5) * cell_width
    record = {
        "id": frame_id,
        "sourceSheet": sheet_id,
        "sourceRow": row,
        "sourceColumn": column,
        "sourceRect": rect,
        "pivot": {"x": source_pivot_x - rect["x"], "y": row_bottom - rect["y"]},
        "role": role,
        "width": image.width,
        "height": image.height,
        "opaquePixels": int(np.count_nonzero(np.asarray(image.getchannel("A")) > 8)),
    }
    return record, image


def extract_sheet_frames(sheet_id, source):
    source_image = Image.open(source).convert("RGB")
    rgba = keyed_rgba(source_image)
    pixels = np.asarray(rgba)
    silhouette = pixels[:, :, 3] > 8
    rows = 6 if sheet_id < 4 else 4
    cell_width = source_image.width / 4.0
    cell_height = source_image.height / rows
    components = [comp for comp in connected_components(silhouette) if comp[4] > 3000]
    by_row = {}
    for comp in components:
        x0, y0, x1, y1, _area = comp[:5]
        row = int(round((((y0 + y1) / 2.0) / cell_height) - 0.5)) + 1
        if row < 1 or row > rows:
            continue
        by_row.setdefault(row, []).append(comp)

    frames = []
    for row in range(1, rows + 1):
        row_components = by_row.get(row, [])
        row_bottom = max(comp[3] for comp in row_components)
        row_frames = {}
        for component in row_components:
            x0, y0, x1, y1, _area = component[:5]
            # Some adjacent poses touch at their hands or legs. Split just those
            # merged silhouettes at the nominal column boundaries.
            local = component_mask(component)
            if x1 - x0 + 1 > cell_width * 1.7:
                global_x = np.arange(x0, x1 + 1)
                boundaries = np.floor(np.arange(5) * cell_width).astype(int)
                if sheet_id == 2 and row in (4, 5):
                    # The low sweeps touch across the center gridline; offset
                    # the cut a few pixels so the two boots stay with their poses.
                    boundaries[2] = min(source_image.width - 1, boundaries[2] + 16)
                owners = np.searchsorted(boundaries[1:], global_x, side="right") + 1
                for column in np.unique(owners):
                    piece = local & (owners[None, :] == column)
                    if np.count_nonzero(piece) < 3000:
                        continue
                    ys, xs = np.nonzero(piece)
                    xmin, ymin, xmax, ymax = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
                    bounds = (x0 + xmin, y0 + ymin, x0 + xmax, y0 + ymax)
                    row_frames[int(column)] = (piece[ymin:ymax + 1, xmin:xmax + 1], bounds)
            else:
                column = int(np.clip(round((((x0 + x1) / 2.0) / cell_width) - 0.5) + 1, 1, 4))
                row_frames[column] = (local, (x0, y0, x1, y1))

        if sorted(row_frames) != [1, 2, 3, 4]:
            raise ValueError(f"Sheet {sheet_id}, row {row}: expected columns 1-4, found {sorted(row_frames)}")

        # Reconstruct each component mask in the sheet's coordinate space.
        for column in range(1, 5):
            piece, (x0, y0, x1, y1) = row_frames[column]
            mask = np.zeros((source_image.height, source_image.width), dtype=bool)
            mask[y0:y1 + 1, x0:x1 + 1] = piece
            comp_bounds = (x0, y0, x1, y1)
            frames.append(make_frame(sheet_id, row, column, rgba, mask, comp_bounds, row_bottom, cell_width))
    return frames, source_image.size


def pack_atlas(frames):
    placements = {}
    x = ATLAS_PADDING
    y = ATLAS_PADDING
    row_height = 0
    ordered = sorted(frames, key=lambda item: (-item[1].height, -item[1].width, item[0]["id"]))
    for record, image in ordered:
        if image.width + 2 * ATLAS_PADDING > ATLAS_WIDTH:
            raise ValueError(f"Frame wider than atlas: {record['id']}")
        if x + image.width + ATLAS_PADDING > ATLAS_WIDTH:
            y += row_height + ATLAS_PADDING
            x = ATLAS_PADDING
            row_height = 0
        placements[record["id"]] = (x, y)
        x += image.width + ATLAS_PADDING
        row_height = max(row_height, image.height)
    height = int(math.ceil((y + row_height + ATLAS_PADDING) / 64.0) * 64)
    atlas = Image.new("RGBA", (ATLAS_WIDTH, height), (0, 0, 0, 0))
    frame_records = {}
    images = {record["id"]: image for record, image in frames}
    for record, image in frames:
        px, py = placements[record["id"]]
        atlas.alpha_composite(image, (px, py))
        record["atlasRect"] = {"x": px, "y": py, "width": image.width, "height": image.height}
        frame_records[record["id"]] = record
    return atlas, frame_records


def frame_ids(sheet, row, columns=range(1, 5)):
    return [f"s{sheet}-r{row:02d}-c{column:02d}" for column in columns]


def save_portraits():
    FIGHTER_DIR.joinpath("portraits").mkdir(parents=True, exist_ok=True)
    portrait = Image.open(SOURCE_DIR / "portait" / "1.png").convert("RGB")
    portrait.resize((600, 600), Image.Resampling.LANCZOS).save(
        FIGHTER_DIR / "portraits" / "portrait.webp", "WEBP", quality=94, method=6
    )
    full_body = keyed_rgba(Image.open(SOURCE_DIR / "bg_portait" / "1.png"))
    bbox = full_body.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("Christian's full-body portrait is empty after chroma key")
    full_body = full_body.crop(bbox)
    full_body.thumbnail((600, 900), Image.Resampling.LANCZOS)
    FIGHTER_DIR.joinpath("portraits", "large.png").parent.mkdir(parents=True, exist_ok=True)
    full_body.save(FIGHTER_DIR / "portraits" / "large.png", optimize=True)
    small = full_body.copy()
    small.thumbnail((205, 480), Image.Resampling.LANCZOS)
    small.save(FIGHTER_DIR / "portraits" / "small.webp", "WEBP", quality=95, method=6)


def main():
    all_frames = []
    source_sheets = {}
    for sheet_id in range(1, 5):
        source = SOURCE_DIR / "sprites" / f"{sheet_id}.png"
        sheet_frames, (width, height) = extract_sheet_frames(sheet_id, source)
        all_frames.extend(sheet_frames)
        source_sheets[str(sheet_id)] = {
            "source": f"personagens/Christian/sprites/{sheet_id}.png",
            "width": width,
            "height": height,
            "frameCount": len(sheet_frames),
            "frames": [record["id"] for record, _image in sheet_frames],
        }

    atlas, frame_records = pack_atlas(all_frames)
    animations = {
        "idle": frame_ids(1, 1),
        "walk": frame_ids(1, 2),
        "crouch": frame_ids(1, 3),
        "guardHigh": frame_ids(3, 1),
        "guardLow": frame_ids(3, 2),
        "hurt": frame_ids(3, 3),
        "fall": frame_ids(3, 5),
        "getup": frame_ids(3, 6),
        "victory": frame_ids(4, 2, (2, 3, 4)),
        "jump": frame_ids(1, 5, (2, 3)),
        "light": frame_ids(2, 1),
        "uppercut": frame_ids(2, 2),
        "kick": frame_ids(2, 3),
        "low": frame_ids(2, 4),
        "crouchAttack": frame_ids(2, 5),
        "sweep": frame_ids(2, 5),
        "airAttack": frame_ids(2, 6),
        "specialBody": frame_ids(4, 1),
    }
    metadata = {
        "character": "Christian",
        "slug": "christian",
        "atlas": "atlas.png",
        "atlasSize": {"width": atlas.width, "height": atlas.height},
        "frameCount": len(frame_records),
        "animations": animations,
        "frames": frame_records,
        "sourceSheets": source_sheets,
    }
    atlas.save(FIGHTER_DIR / "atlas.png", optimize=True)
    (FIGHTER_DIR / "atlas.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    catalog = json.loads(CATALOG_JSON.read_text(encoding="utf-8-sig"))
    catalog["Christian"]["frameCount"] = len(frame_records)
    catalog["Christian"]["animations"] = animations
    CATALOG_JSON.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    save_portraits()
    print(f"Christian reconstruído do zero: {len(frame_records)} quadros em {atlas.width}×{atlas.height}.")


if __name__ == "__main__":
    main()
