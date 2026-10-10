import { avatarColour, initials } from '@/lib/client/format';

/** Initials on a steady colour: the same person always looks the same. */
export function Avatar({ name, seed, size = 32 }: { name: string; seed: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid flex-none place-items-center rounded-[10px] font-extrabold text-white"
      style={{ width: size, height: size, background: avatarColour(seed), fontSize: Math.round(size * 0.37) }}
    >
      {initials(name)}
    </span>
  );
}
