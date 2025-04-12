// app/(dashboard)/page.tsx (or your specific page route)
import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="relative flex h-screen flex-grow flex-col items-center justify-center p-4 pt-16 sm:pt-4">
      <Link href={"/login"} legacyBehavior>
        <a className="absolute right-4 top-4 text-sm underline sm:right-6 sm:top-6">
          login
        </a>
      </Link>

      <div className="w-full px-4 text-center lg:max-w-7xl">
        <p className="text-xl lg:text-3xl lg:tracking-widest">
          Your Beauty, Our Passion
        </p>
        <div className="mt-2 border-t-4 border-black">
          <h1 className="text-nowrap break-words text-4xl font-medium uppercase leading-tight tracking-[12px] lg:text-8xl lg:tracking-[60px]">
            beautyfeel
          </h1>
        </div>
      </div>
    </main>
  );
}
