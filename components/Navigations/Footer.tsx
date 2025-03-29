import { Facebook } from "lucide-react";
import Link from "next/link";
export default function Footer() {
  return (
    <footer className="bg-customBlack absolute bottom-0 flex min-h-[40px] w-screen items-center py-2">
      <div className="flex w-[200px] items-center justify-around">
        <div className="flex size-8 items-center justify-center rounded-full border-2 border-customDarkPink">
          <Link
            target="_blank"
            href={"https://www.facebook.com/beautyfeelSkin"}
          >
            <Facebook size={20} color="#c28583" />
          </Link>
        </div>
        <Link target="_blank" href={"https://www.facebook.com/beautyfeelSkin"}>
          <h1 className="text-lg font-medium uppercase tracking-widest text-customDarkPink">
            beautyfeel
          </h1>
        </Link>
      </div>
    </footer>
  );
}
