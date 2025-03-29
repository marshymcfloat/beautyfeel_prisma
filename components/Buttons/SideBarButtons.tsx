export default function SideBarButtons({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <button className="mx-auto my-2 hidden w-[80%] min-w-[200px] max-w-[250px] items-center rounded-3xl bg-customWhiteBlue bg-opacity-35 px-4 py-1 text-start shadow-custom md:flex">
        {children}
      </button>

      <button className="mx-auto my-2 flex size-12 items-center justify-center rounded-full bg-customWhiteBlue bg-opacity-35 shadow-custom md:hidden">
        {children}
      </button>
    </>
  );
}
