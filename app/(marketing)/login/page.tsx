import Button from "@/components/Buttons/Button";
import InputGroup from "@/components/Inputs/InputTextGroup";

export default function LoginPage() {
  return (
    <div className="absolute z-10 flex h-screen w-screen items-center justify-center bg-black bg-opacity-35">
      <dialog
        open
        className="rounded-md border-2 border-customDarkPink bg-customOffWhite p-4 lg:w-[500px]"
      >
        <h1 className="text-center text-xl uppercase">main login</h1>

        <div className="relative my-10 flex flex-col">
          <input
            type="text"
            className="peer mx-auto h-[50px] w-[90%] rounded-md border-2 border-customDarkPink px-2 shadow-custom outline-none"
            placeholder=" "
          />
          <label
            htmlFor=""
            className="absolute left-10 top-1/2 -translate-y-1/2 font-medium transition-all duration-150 peer-focus:top-[-10px] peer-focus:tracking-widest peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:tracking-widest"
          >
            username
          </label>
        </div>
        <div className="relative my-10 flex flex-col">
          <input
            type="password"
            className="peer mx-auto h-[50px] w-[90%] rounded-md border-2 border-customDarkPink px-2 shadow-custom outline-none"
            placeholder=" "
          />
          <label
            htmlFor=""
            className="absolute left-10 top-1/2 -translate-y-1/2 font-medium transition-all duration-150 peer-focus:top-[-10px] peer-focus:tracking-widest peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:tracking-widest"
          >
            password
          </label>
        </div>
        <div className="flex justify-center">
          <Button>login</Button>
        </div>
      </dialog>
    </div>
  );
}
