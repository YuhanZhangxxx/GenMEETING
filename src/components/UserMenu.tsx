"use client";

import { signOut } from "next-auth/react";
import Image from "next/image";

interface Props {
  user: { name?: string | null; email?: string | null; image?: string | null };
}

export default function UserMenu({ user }: Props) {
  return (
    <div className="flex items-center gap-2">
      {user.image && (
        <Image
          src={user.image}
          alt={user.name ?? "User"}
          width={28}
          height={28}
          className="rounded-full"
        />
      )}
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="text-xs text-slate-500 hover:text-slate-800 font-medium"
      >
        Sign out
      </button>
    </div>
  );
}
