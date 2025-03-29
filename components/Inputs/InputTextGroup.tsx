export default function InputGroup({
  label,
  name = label,
}: {
  label: string;
  name?: string;
}) {
  return (
    <div className="">
      <label htmlFor="">{label}</label>
      <input type="text" name={name} />
    </div>
  );
}
