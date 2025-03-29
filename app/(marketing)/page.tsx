import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="relative flex h-screen w-full items-center justify-center">
      <Link href={"/login"}>
        <p className="absolute right-0 top-0 mr-4 mt-4 underline">login</p>
      </Link>
      <div className="w-[90%] lg:w-[70%]">
        <p className="text-center text-[20px] lg:text-[30px] lg:tracking-widest">
          Your Beauty, Our Passion
        </p>
        <div className="mt-2 flex justify-center border-t-4 border-black">
          <h1 className="ml-6 text-center text-4xl font-medium uppercase tracking-[20px] lg:ml-12 lg:mt-12 lg:text-[100px] lg:tracking-[70px]">
            beautyfeel
          </h1>
        </div>
      </div>
    </main>
  );
}
