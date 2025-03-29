"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { useDispatch } from "react-redux";
export default function DialogForm({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: (formData: FormData) => Promise<void>; // Accept async function with FormData
}) {
  const router = useRouter();

  const dispatch = useDispatch();

  return (
    <dialog
      open
      className="absolute left-1/2 right-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-customOffWhite p-6 md:min-w-[600px] lg:max-h-[80vh] lg:w-[30vw]"
    >
      <X
        onClick={() => {
          dispatch(cashierActions.reset());
          router.back();
        }}
        className="absolute right-4 top-4 cursor-pointer"
      />
      <form action={action}>{children}</form>
    </dialog>
  );
}
