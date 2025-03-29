export default function DialogBackground({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="absolute z-20 w-screen h-screen bg-black bg-opacity-50">
      {children}
    </div>
  );
}
