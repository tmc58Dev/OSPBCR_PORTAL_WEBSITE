from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

render_dir = Path(__file__).resolve().parent / "rendered"
pages = sorted(
    render_dir.glob("final2-page-*.png"),
    key=lambda path: int(path.stem.split("-")[-1]),
)
output_dir = render_dir / "contacts-final2"
output_dir.mkdir(exist_ok=True)

per_sheet = 6
thumb_width = 680
gap = 24
label_height = 34

for sheet_index in range(0, len(pages), per_sheet):
    batch = pages[sheet_index:sheet_index + per_sheet]
    thumbs = []
    for path in batch:
        image = Image.open(path).convert("RGB")
        scale = thumb_width / image.width
        thumb = image.resize((thumb_width, int(image.height * scale)), Image.Resampling.LANCZOS)
        bordered = ImageOps.expand(thumb, border=2, fill="#586474")
        thumbs.append((path, bordered))

    cell_height = max(image.height for _, image in thumbs) + label_height
    canvas = Image.new(
        "RGB",
        (3 * thumb_width + 4 * gap + 12, 2 * cell_height + 3 * gap),
        "white",
    )
    draw = ImageDraw.Draw(canvas)
    for index, (path, image) in enumerate(thumbs):
        row, col = divmod(index, 3)
        x = gap + col * (thumb_width + gap)
        y = gap + row * (cell_height + gap)
        page_number = int(path.stem.split("-")[-1])
        draw.text((x, y), f"Page {page_number}", fill="#111827")
        canvas.paste(image, (x, y + label_height))

    first = int(batch[0].stem.split("-")[-1])
    last = int(batch[-1].stem.split("-")[-1])
    canvas.save(output_dir / f"pages-{first:03d}-{last:03d}.png", optimize=True)

print(f"{len(pages)} pages -> {len(list(output_dir.glob('*.png')))} contact sheets")
