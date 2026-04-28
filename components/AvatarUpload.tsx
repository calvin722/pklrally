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
  };
}

/**
 * Profile picture uploader. Requires a public Supabase Storage bucket
 * named "avatars" with policies allowing authenticated users to upload
 * to their own folder. See migrations/0009_avatars_storage.sql for setup.
 */
export default function AvatarUpload({ player }: AvatarUploadProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [currentUrl, setCurrentUrl] = useState(player.avatar_url);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
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
    setUploading(true);

    const supabase = createClient();
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const path = `${player.id}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
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
      .update({ avatar_url: publicUrl })
      .eq("id", player.id);

    if (updateErr) {
      setError(updateErr.message);
      setUploading(false);
      return;
    }

    setCurrentUrl(publicUrl);
    setUploading(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-5">
      <Avatar
        player={{ ...player, avatar_url: currentUrl }}
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
          disabled={uploading}
          className="rounded-lg border-2 border-pickle px-4 py-2 font-display text-display-xs font-semibold uppercase tracking-wide text-pickle transition hover:bg-pickle hover:text-black disabled:opacity-50"
        >
          {uploading
            ? "Uploading..."
            : currentUrl
              ? "Change photo"
              : "Upload photo"}
        </button>
        <p className="mt-2 text-xs text-white/40">
          Max 5 MB. JPG / PNG / GIF / WebP all supported.
        </p>
        {error && (
          <p className="mt-2 text-sm text-bright">⚠ {error}</p>
        )}
      </div>
    </div>
  );
}
