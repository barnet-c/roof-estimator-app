// Drag-and-drop zone for 1-3 roof photos. Reads files to base64 data URLs for
// instant thumbnails and for the SSRF-safe backend upload.
import { useRef, useState } from "react";
import { Upload, X, Plus } from "lucide-react";
import { cn } from "../lib/utils.js";

const MAX_PHOTOS = 3;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PhotoDropzone({ photos, onChange }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  async function addFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    const next = await Promise.all(files.slice(0, room).map(readAsDataUrl));
    onChange([...photos, ...next]);
  }

  function removeAt(i) {
    onChange(photos.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all",
            dragging
              ? "border-primary bg-accent scale-[1.01]"
              : "border-input hover:border-primary/50 hover:bg-secondary/50",
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
            <Upload className="h-6 w-6" />
          </div>
          <div className="font-semibold text-foreground">Drop roof photos here</div>
          <div className="text-sm text-muted-foreground">
            or click to browse — up to {MAX_PHOTOS} images
          </div>
          <div className="text-xs text-muted-foreground">
            JPG, PNG • Clear shots of the roof surface work best
          </div>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((p, i) => (
            <div
              key={i}
              className="group relative aspect-square overflow-hidden rounded-xl border border-border"
            >
              <img src={p.dataUrl} alt={p.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove photo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-input text-muted-foreground hover:border-primary/50 hover:bg-secondary/50"
            >
              <Plus className="h-6 w-6" />
              <span className="text-xs font-medium">Add more</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
