/**
 * Avatar component — renders the player's profile image if uploaded,
 * otherwise falls back to a colored circle with the first letter of their name.
 *
 * Used everywhere a player needs visual identity (MatchCard, AuthButton,
 * profile header, vouch list, leaderboard, etc.).
 */
interface AvatarPlayer {
  id?: string;
  display_name: string;
  avatar_url?: string | null;
  is_guest?: boolean;
}

interface AvatarProps {
  player: AvatarPlayer;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-7 w-7 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-display-lg",
  xl: "h-24 w-24 text-display-xl",
};

export default function Avatar({
  player,
  size = "sm",
  className = "",
}: AvatarProps) {
  const initial = (player.display_name?.[0] ?? "?").toUpperCase();
  const ringColor = player.is_guest ? "border-bright" : "border-pickle";
  const textColor = player.is_guest ? "text-bright" : "text-pickle";

  if (player.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={player.avatar_url}
        alt={player.display_name}
        className={`shrink-0 rounded-full border-2 object-cover ${ringColor} ${SIZE_CLASSES[size]} ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border-2 bg-black font-mono font-bold ${ringColor} ${textColor} ${SIZE_CLASSES[size]} ${className}`}
      aria-hidden
    >
      {initial}
    </span>
  );
}
