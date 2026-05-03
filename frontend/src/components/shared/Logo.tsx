import Link from "next/link";
import Image from "next/image";

/**
 * Shared Logo component used across the application.
 * Uses the official qs-logo.png brand asset (mark only — top 78% crop removes
 * the embedded "QUICK AI SHORTS" wordmark from the PNG so it doesn't conflict
 * with Navbar layout).  We achieve the crop purely via CSS overflow:hidden
 * without any server-side image processing.
 */
export default function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center group flex-shrink-0"
      aria-label="QuickAI Shorts – Home"
    >
      {/* Crop wrapper — hides the bottom ~22% of the PNG (the wordmark text).
          Adjust the height ratio here if the logo aspect changes. */}
      <div
        className="relative overflow-hidden"
        style={{ width: 36, height: 36 }}
      >
        <Image
          src="/qs-logo.png"
          alt="QuickAI Shorts"
          width={36}
          height={46}          /* taller than wrapper → bottom text clips off */
          priority
          className="object-cover object-top transition-transform duration-300 group-hover:scale-110"
          style={{ imageRendering: "auto" }}
        />
      </div>
      {/* Separate wordmark text — keeps Navbar layout consistent */}
      <span
        className="ml-2.5 font-black tracking-tight leading-none text-[15px] select-none"
        style={{ letterSpacing: "-0.02em" }}
      >
        Quick{" "}
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
          }}
        >
          AI
        </span>{" "}
        Shorts
      </span>
    </Link>
  );
}
