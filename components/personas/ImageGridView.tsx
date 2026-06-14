"use client";

import { useState } from "react";
import { ImageLightbox } from "@/components/chatrooms/ImageLightbox";
import { supabaseThumb } from "@/lib/storage";

type GridImage = { id: string; url: string; caption?: string };

function Thumb({
  img,
  className,
  onClick,
}: {
  img: GridImage;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`overflow-hidden focus:outline-none ${className ?? ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={supabaseThumb(img.url, 600) ?? img.url}
        onError={(e) => { e.currentTarget.src = img.url; e.currentTarget.onerror = null; }}
        alt={img.caption ?? ""}
        className="h-full w-full object-cover transition-opacity hover:opacity-90"
        loading="lazy"
        draggable={false}
      />
    </button>
  );
}

export function ImageGridView({ images }: { images: GridImage[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const n = images.length;
  if (!n) return null;

  const items = images.map((img) => ({ url: img.url, name: img.caption ?? "Image" }));
  const open = (i: number) => setLightboxIndex(i);

  let grid: React.ReactNode;

  if (n === 1) {
    grid = (
      <div className="overflow-hidden rounded-md max-w-xs">
        <Thumb img={images[0]}className="block w-full max-h-72" onClick={() => open(0)} />
      </div>
    );
  } else if (n === 2) {
    grid = (
      <div className="grid grid-cols-2 gap-0.5 rounded-md overflow-hidden h-52">
        {images.map((img, i) => (
          <Thumb key={img.id} img={img}className="w-full h-full" onClick={() => open(i)} />
        ))}
      </div>
    );
  } else if (n === 3) {
    grid = (
      <div className="grid gap-0.5 rounded-md overflow-hidden h-52" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <Thumb img={images[0]}className="row-span-2 w-full h-full" onClick={() => open(0)} />
        <Thumb img={images[1]}className="w-full h-full" onClick={() => open(1)} />
        <Thumb img={images[2]}className="w-full h-full" onClick={() => open(2)} />
      </div>
    );
  } else if (n === 4) {
    grid = (
      <div className="grid grid-cols-2 gap-0.5 rounded-md overflow-hidden">
        {images.map((img, i) => (
          <Thumb key={img.id} img={img}className="aspect-square w-full" onClick={() => open(i)} />
        ))}
      </div>
    );
  } else if (n === 5) {
    grid = (
      <div className="flex flex-col gap-0.5 rounded-md overflow-hidden">
        <div className="grid grid-cols-2 gap-0.5 h-44">
          {images.slice(0, 2).map((img, i) => (
            <Thumb key={img.id} img={img}className="w-full h-full" onClick={() => open(i)} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-0.5 h-32">
          {images.slice(2, 5).map((img, i) => (
            <Thumb key={img.id} img={img}className="w-full h-full" onClick={() => open(i + 2)} />
          ))}
        </div>
      </div>
    );
  } else {
    // 6+ : grille 3 colonnes
    grid = (
      <div className="grid grid-cols-3 gap-0.5 rounded-md overflow-hidden">
        {images.map((img, i) => (
          <Thumb key={img.id} img={img}className="aspect-square w-full" onClick={() => open(i)} />
        ))}
      </div>
    );
  }

  return (
    <>
      {grid}
      {lightboxIndex !== null && (
        <ImageLightbox
          items={items}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
