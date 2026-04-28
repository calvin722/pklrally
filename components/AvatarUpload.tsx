"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Avatar from "./Avatar";

interface AvatarUploadProps {
  player: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    avatar_focal_x?: number | null;
    avatar_focal_y?: number | null;
  };
}

/**
 * Profile picture uploader with focal-point picker.
 *
 * Flow:
 *   1. User picks a file → preview shown with a focal-point dot at center
 *   2. User clicks anywhere on the preview to move the focal point
 *   3. User clicks Save → upload to Storage, persist URL + focal coords
 *
 * Requires the public "avatars" Supabase Storage bucket and migration 0009
 * for the storage policies.
 */
export default function AvatarUpload({ player }: AvatarUploadProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [savedUrl, setSavedUrl] = useState(player.avatar_url);
  const [savedFocalX, setSavedFocalX] = useState(player.avatar_focal_x ?? 50);
  const [savedFocalY, setSavedFocalY] = useState(player.avatar_focal_y ?? 50);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large — max 5 MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
    setFocalX(50);
    setFocalY(50);
  }

  function handlePreviewClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setFocalX(Math.max(0, Math.min(100, x)));
    setFocalY(Math.max(0, Math.min(100, y)));
  }

  async function handleConfirm() {
    if (!pendingFile) return;
    setError(null);
    setUploading(true);

    const supabase = createClient();
    const ext = (pendingFile.name.split(".").pop() ?? "jpg").toLowerCase();
    const path = `${player.id}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(path, pendingFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: pendingFile.type,
      });
    if (uploadErr) {
      setError(uploadErr.message);
      setUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    const { error: updateErr } = await supabase
      .from("players")
      .update({
        avatar_url: publicUrl,
        avatar_focal_x: Number(focalX.toFixed(2)),
        avatar_focal_y: Number(focalY.toFixed(2)),
      })
      .eq("id", player.id);

    if (updateErr) {
      setError(updateErr.message);
      setUploading(false);
      return;
    }

    setSavedUrl(publicUrl);
    setSavedFocalX(focalX);
    setSavedFocalY(focalY);
    setPendingFile(null);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(null);
    setUploading(false);
    router.refresh();
  }

  function handleCancel() {
    setPendingFile(null);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // PREVIEW MODE — user is choosing focal point on a freshly-picked image
  if (pendingPreview) {
    return (
      <div className="space-y-4">
        <p className="font-display text-display-xs uppercase font-semibold tracking-wide text-pickle">
          Tap your face to set the focal point
        </p>
        <div className="flex flex-wrap items-start gap-5">
          <div
            ref={previewRef}
            onClick={handlePreviewClick}
            className="relative h-72 w-72 cursor-crosshair overflow-hidden rounded-2xl border-2 border-pickle bg-black"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingPreview}
              alt="Preview"
              className="h-full w-full object-cover"
              style={{ objectPosition: `${focalX}% ${focalY}%` }}
            />
            {/* Crosshair indicator */}
            <div
              className="pointer-events-none absolute h-7 w-7 rounded-full border-2 border-bright bg-bright/30"
              style={{
                left: `${focalX}%`,
                top: `${focalY}%`,
                transform: "translate(-50%, -50%)",
              }}
              aria-hidden
            />
          </div>

          {/* Live preview at avatar size */}
          <div className="flex flex-col items-start gap-2">
            <p className="font-display text-display-xs uppercase font-semibold tracking-wide text-white/60">
              Preview
            </p>
            <Avatar
              player={{
                ...player,
                avatar_url: pendingPreview,
                avatar_focal_x: focalX,
                avatar_focal_y: focalY,
              }}
              size="xl"
            />
            <p className="mt-1 font-mono text-xs text-white/40">
              {Math.round(focalX)} %, {Math.round(focalY)} %
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={uploading}
            className="soft-stamp rounded-xl bg-pickle px-5 py-3 font-display text-display-xs font-extrabold uppercase tracking-wide text-black disabled:opacity-50"
          >
            {uploading ? "Saving..." : "Save photo"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={uploading}
            className="rounded-xl border-2 border-white/40 px-5 py-3 font-display text-display-xs uppercase font-semibold tracking-wide text-white/70 hover:border-pickle hover:text-pickle disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-sm text-bright">⚠ {error}</p>}
      </div>
    );
  }

  // CURRENT AVATAR + UPLOAD BUTTON — default state
  return (
    <div className="flex items-center gap-5">
      <Avatar
        player={{
          ...player,
          avatar_url: savedUrl,
          avatar_focal_x: savedFocalX,
          avatar_focal_y: savedFocalY,
        }}
        size="xl"
      />
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border-2 border-pickle px-4 py-2 font-display text-display-xs font-semibold uppercase tracking-wide text-pickle transition hover:bg-pickle hover:text-black"
        >
          {savedUrl ? "Change photo" : "Upload photo"}
        </button>
        <p className="mt-2 text-xs text-white/40">
          Max 5 MB. JPG / PNG / GIF / WebP all supported.
        </p>
        {error && <p className="mt-2 text-sm text-bright">⚠ {error}</p>}
      </div>
    </div>
  );
}
