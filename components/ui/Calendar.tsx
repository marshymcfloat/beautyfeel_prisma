export default function Calendar() {
  const today = new Date();
  const day = today.getDate().toString().padStart(2, "0"); // Ensure two digits (e.g., "08")
  const month = today.toLocaleString("en-US", { month: "long" }); // Get full month name

  return (
    <div className="relative flex size-28 flex-col items-center justify-center rounded-2xl bg-slate-100 bg-opacity-65 p-4 shadow-2xl lg:size-52">
      <p className="absolute top-0 mt-4 text-xl tracking-widest">{month}</p>
      <p className="text-[40px] font-bold lg:text-[100px]">{day}</p>
    </div>
  );
}
