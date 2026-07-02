const BOT_EMOJI = ['🤖', '🦾', '⚙️', '🛰️', '🎯', '🧠', '🔧', '📡']

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function avatarFor(seller: string): { emoji: string; hue: number } {
  const h = hashSeed(seller)
  return { emoji: BOT_EMOJI[h % BOT_EMOJI.length], hue: h % 360 }
}

export function Avatar({ seller, size = 26 }: { seller: string; size?: number }) {
  const { emoji, hue } = avatarFor(seller)
  return (
    <span
      className="avatar"
      style={{
        width: size, height: size, lineHeight: `${size}px`,
        background: `hsl(${hue} 55% 20%)`, borderColor: `hsl(${hue} 55% 42%)`,
      }}
      title={seller}
      aria-hidden="true"
    >
      {emoji}
    </span>
  )
}
