'use client';

import { Camera, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { uploadAvatarAction } from '../actions';

interface Props {
  employeeId: string;
  fullName: string;
  avatarPath: string | null;
  /**
   * アバターを差し替えられるか（admin 以上）。
   *
   * false のときは押せるボタンとして描画しない。Storage ポリシーと
   * Service Layer の両方で弾いているので押しても失敗するだけだが、
   * 出来ない操作を出しておくのは案内として不親切。
   */
  canUpload: boolean;
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AvatarUpload({ employeeId, fullName, avatarPath, canUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
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

    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const result = await uploadAvatarAction(employeeId, formData);
      if (result.success) {
        setPreview(result.data.path);
        toast.success('アバターを更新しました');
      } else {
        setPreview(null);
        toast.error(result.error);
      }
    });
  }

  const displaySrc = preview ?? avatarPath;

  const face = displaySrc ? (
    <Image src={displaySrc} alt={fullName} fill className="object-cover" unoptimized />
  ) : (
    <span className="text-muted-foreground text-lg font-semibold">{initials}</span>
  );

  // 権限が無いときは見た目だけ。button にしないのは、押せない操作に
  // フォーカスが当たってスクリーンリーダーに読み上げられるのを避けるため。
  if (!canUpload) {
    return (
      <div className="bg-muted relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full">
        {face}
      </div>
    );
  }

  return (
    <button
      type="button"
      // 中身はアバター画像かイニシャルしかないため、名前を付けないと
      // **氏名のイニシャルがボタン名として拾われる**。「削除される太郎」なら
      // 「削除」という名前のボタンになり、支援技術にも e2e にも
      // 別のボタンと区別できない。
      aria-label="プロフィール写真を変更"
      className="group bg-muted relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full"
      onClick={() => inputRef.current?.click()}
      disabled={isPending}
    >
      {face}
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin text-white" />
        ) : (
          <Camera className="h-5 w-5 text-white" />
        )}
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
