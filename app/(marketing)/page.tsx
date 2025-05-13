import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    console.log(`Session found for user ${session.user.id}, redirecting...`);
    redirect(`/${session.user.id}`);
  }
  return (
    <main>
      <div className="w-full max-w-7xl px-4 text-center">
        <p className="text-xl text-black lg:text-3xl lg:tracking-widest">
          Your Beauty, Our Passion
        </p>
        <div className="mt-2 border-t-4 border-black">
          <h1 className="ml-3 text-nowrap break-words text-3xl font-medium uppercase leading-tight tracking-[12px] text-black lg:ml-8 lg:text-8xl lg:tracking-[60px]">
            beautyfeel
          </h1>
        </div>
      </div>
    </main>
  );
}
