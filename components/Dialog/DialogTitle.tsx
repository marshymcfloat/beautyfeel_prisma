export default function DialogTitle({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <h1 className="text-center text-2xl font-bold uppercase tracking-widest">
      {children}
    </h1>
  );
}
