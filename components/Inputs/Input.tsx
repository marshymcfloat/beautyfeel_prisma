"use client";

export default function Input<T extends string>({
  type = "text",
  name = "" as T,
  label,
  isError = false,
  errorMsg,
  value,
  fn,
}: {
  type?: string;
  name?: T;
  label: string;
  isError?: boolean;
  errorMsg?: string;
  value?: any;
  fn?: (name: T, value: string) => void;
}) {
  console.log(value);

  return (
    <div className="relative flex justify-center w-full mt-8">
      <input
        type={type}
        name={name}
        value={value}
        id={name}
        placeholder=" "
        onChange={(e) => fn?.(name, e.target.value)}
        className="shadow-custom w-[90%] outline-none peer h-[50px] px-2 rounded-md border-2 border-customDarkPink"
      />
      <label
        htmlFor={name}
        className="transition-all font-medium peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:tracking-widest duration-150 absolute left-10 top-1/2 -translate-y-1/2 peer-focus:tracking-widest peer-focus:top-[-10px]"
      >
        {label}
      </label>
      {isError && (
        <p className="absolute bottom-[-25px] left-10 text-red-600 font-bold animate-fadeOut">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
