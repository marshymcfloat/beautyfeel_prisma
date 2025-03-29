import Calendar from "@/components/ui/Calendar";

export default async function Home() {
  return (
    <main className="flex h-screen w-screen items-end">
      <div className="ml-auto h-[98vh] w-[80%] rounded-tl-3xl bg-customLightBlue bg-opacity-30 shadow-PageShadow">
        <div className="">
          <Calendar />
        </div>
        <div className=""></div>
      </div>
    </main>
  );
}
