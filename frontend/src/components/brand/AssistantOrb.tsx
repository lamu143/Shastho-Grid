export function AssistantOrb({ size = "launcher" }: { size?: "launcher" | "hero" }) {
  return (
    <span className={`sathi-orb sathi-orb--${size}`} aria-hidden="true">
      <span className="sathi-orb__aura" />
      <span className="sathi-orb__sphere">
        <span className="sathi-orb__horizon" />
        <span className="sathi-orb__reflection" />
      </span>
    </span>
  );
}
