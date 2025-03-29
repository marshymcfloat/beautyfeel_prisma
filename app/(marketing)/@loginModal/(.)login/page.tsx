"use client";

import { X } from "lucide-react";
import { ChangeEvent, FormEvent, useState } from "react";
import Button from "@/components/Buttons/Button";
import { loggingIn } from "@/lib/ServerAction";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [inputs, setInputs] = useState({
    username: "",
    password: "",
  });

  function handleInputChange(
    identifier: string,
    e: ChangeEvent<HTMLInputElement>,
  ) {
    setInputs((prev) => ({
      ...prev,
      [identifier]: e.target.value,
    }));
  }

  function handleLoggingIn() {
    if (inputs.username.trim() !== "" && inputs.password.trim() !== "") {
      const formData = new FormData();

      formData.append("username", inputs.username);
      formData.append("password", inputs.password);

      loggingIn(formData).then((response) => {
        if (response.success) {
          router.push(`/${response.accountID}`);
        }
      });
    }
  }

  return (
    <div className="absolute z-10 flex h-screen w-screen items-center justify-center bg-black bg-opacity-35">
      <dialog
        open
        className="relative w-[90%] rounded-md border-2 border-customDarkPink bg-customOffWhite p-4 lg:w-[500px]"
      >
        <X
          className="absolute right-2 top-2 cursor-pointer"
          onClick={() => router.push("/")}
        />
        <form>
          <h1 className="text-center text-xl font-medium uppercase tracking-widest">
            login
          </h1>

          <div className="relative my-10 flex flex-col">
            <input
              type="text"
              className="peer mx-auto h-[50px] w-[90%] rounded-md border-2 border-customDarkPink px-2 shadow-custom outline-none"
              placeholder=" "
              name="username"
              required
              value={inputs.username}
              onChange={(e) => handleInputChange("username", e)}
            />
            <label className="absolute left-10 top-1/2 -translate-y-1/2 font-medium transition-all duration-150 peer-focus:top-[-10px] peer-focus:tracking-widest peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:tracking-widest">
              username
            </label>
          </div>

          <div className="relative my-10 flex flex-col">
            <input
              type="password"
              className="peer mx-auto h-[50px] w-[90%] rounded-md border-2 border-customDarkPink px-2 shadow-custom outline-none"
              placeholder=" "
              value={inputs.password}
              name="password"
              required
              onChange={(e) => handleInputChange("password", e)}
            />
            <label className="absolute left-10 top-1/2 -translate-y-1/2 font-medium transition-all duration-150 peer-focus:top-[-10px] peer-focus:tracking-widest peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:tracking-widest">
              password
            </label>
          </div>

          <div className="flex justify-center pb-4">
            <Button onClick={handleLoggingIn}>login</Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
