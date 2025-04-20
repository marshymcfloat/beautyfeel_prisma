import { Facebook } from "lucide-react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="flex min-h-[40px] w-full flex-shrink-0 items-center bg-customBlack px-4 py-2 sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          target="_blank"
          href="https://www.facebook.com/beautyfeelSkin"
          aria-label="Beautyfeel Facebook Page"
          className="flex size-8 items-center justify-center rounded-full border-2 border-customDarkPink transition-opacity hover:opacity-80"
        >
          <Facebook size={20} color="#c28583" />
        </Link>

        <Link
          target="_blank"
          href="https://www.facebook.com/beautyfeelSkin"
          className="text-lg font-medium uppercase tracking-widest text-customDarkPink transition-opacity hover:opacity-80"
        >
          beautyfeel
        </Link>
      </div>
    </footer>
  );
}
