import Galaxy from "./galaxy/Galaxy";

export function GalaxyBackground() {
  return (
    <div className="galaxy-bg-layer" aria-hidden="true">
      <Galaxy
        mouseRepulsion
        mouseInteraction
        density={1}
        glowIntensity={0.3}
        saturation={0}
        hueShift={140}
        twinkleIntensity={0.3}
        rotationSpeed={0.1}
        repulsionStrength={2}
        autoCenterRepulsion={0}
        starSpeed={0.5}
        speed={1}
      />
    </div>
  );
}
