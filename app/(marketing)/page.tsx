// app/(marketing)/page.tsx (or wherever your dashboard page is)

// No Link import needed here for the login button

export default function DashboardPage() {
  return (
    // Keep 'main' semantic, remove layout/positioning classes
    <main>
      {/* Login Link component is REMOVED from here */}

      <div className="w-full max-w-7xl px-4 text-center">
        {" "}
        {/* Ensure max-width if needed */}
        <p className="text-xl text-black lg:text-3xl lg:tracking-widest">
          {" "}
          {/* Ensure text color */}
          Your Beauty, Our Passion
        </p>
        <div className="mt-2 border-t-4 border-black">
          <h1 className="text-nowrap break-words text-4xl font-medium uppercase leading-tight tracking-[12px] text-black lg:text-8xl lg:tracking-[60px]">
            {" "}
            {/* Ensure text color */}
            beautyfeel
          </h1>
        </div>
      </div>
    </main>
  );
}
