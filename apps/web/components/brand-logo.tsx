import Image from "next/image";
import Link from "next/link";

export function BrandLogo({
  priority = false,
  size = "default",
  transparent = false
}: {
  readonly priority?: boolean;
  readonly size?: "default" | "large" | "home";
  readonly transparent?: boolean;
}) {
  return (
    <Link className={`brand-logo brand-logo-${size}`} href="/" aria-label="Lingua Bloom">
      <Image
        src={transparent ? "/logo-transparent.png" : "/logo.png"}
        alt="Lingua Bloom"
        width={1454}
        height={810}
        priority={priority}
        sizes={size === "home" ? "320px" : size === "large" ? "200px" : "145px"}
      />
    </Link>
  );
}
