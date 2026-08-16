'use client';

import { Camera } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

interface Props {
  employeeId: string;
  fullName: string;
  avatarPath: string | null;
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AvatarUpload({ fullName, avatarPath }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const initials = getInitials(fullName);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('ファイルサイズは2MB以下にしてください');
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);

    // TODO: アバターアップロード Server Action 実装後に接続
    toast.success('アバターを選択しました（アップロードは未実装）');
  }

  const displaySrc = preview ?? avatarPath;

  return (
    <button
      type="button"
      className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"
      onClick={() => inputRef.current?.click()}
    >
      {displaySrc ? (
        <Image
          src={displaySrc}
          alt={fullName}
          fill
          className="object-cover"
          unoptimized
        />
      ) : (
        <span className="text-lg font-semibold text-muted-foreground">{initials}</span>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        <Camera className="h-5 w-5 text-white" />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </button>
  );
}
