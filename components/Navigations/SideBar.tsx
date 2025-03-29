"use client";

import Image from "next/image";
import Separator from "../ui/Separator";
import SideBarButtons from "../Buttons/SideBarButtons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { House, LogOut, NotepadText, Banknote, Settings2 } from "lucide-react";

export default function SideBar() {
  const { accountID } = useParams();

  return (
    <>
      <nav className="absolute left-0 hidden h-screen flex-col items-center md:flex md:w-[25%] md:max-w-[350px]">
        <header className="relative my-4 flex items-center p-6 py-10">
          <Image
            width={75}
            height={75}
            className="mr-4"
            priority
            alt="beautyfeel-icon"
            src={"/btfeel-icon.png"}
          />
          <h1 className="font-bold uppercase lg:text-[24px] lg:tracking-widest">
            beautyfeel
          </h1>
          <Separator className="absolute bottom-0" />
        </header>

        <div className="flex w-full flex-col px-4">
          <SideBarButtons>
            <House size={20} className="mr-4" />
            <Link href={`/${accountID}`}>home</Link>
          </SideBarButtons>
          <SideBarButtons>
            <Banknote size={20} className="mr-4" />
            <Link href={`/${accountID}/cashier`}>cashier</Link>
          </SideBarButtons>
          <SideBarButtons>
            <NotepadText size={20} className="mr-4" />
            <Link href={`/${accountID}/work`}>work</Link>
          </SideBarButtons>
          <SideBarButtons>
            <Settings2 size={20} className="mr-4" />
            <Link href={`/${accountID}/services`}>services</Link>
          </SideBarButtons>
        </div>
        <div className="relative mt-auto flex h-[10%] w-full items-center justify-center">
          <Separator className="absolute top-0" />
          <SideBarButtons>
            <LogOut size={20} className="mr-4" />
            logout
          </SideBarButtons>
        </div>
      </nav>

      <nav className="absolute left-0 ml-2 flex h-screen w-[60px] flex-col items-center md:hidden">
        <header>
          <Image
            width={55}
            height={55}
            className="my-2"
            priority
            alt="beautyfeel-icon"
            src={"/btfeel-icon.png"}
          />
          <Separator />
        </header>
        <div className="flex w-full flex-col">
          <SideBarButtons>
            <Link href={`/${accountID}`}>
              <House size={25} />
            </Link>
          </SideBarButtons>
          <SideBarButtons>
            <Link href={`/${accountID}/cashier`}>
              <Banknote size={25} />
            </Link>
          </SideBarButtons>
          <SideBarButtons>
            <Link href={`/${accountID}/work`}>
              <NotepadText size={25} />
            </Link>
          </SideBarButtons>
          <SideBarButtons>
            <Link href={`/${accountID}/services`}>
              <Settings2 size={25} />
            </Link>
          </SideBarButtons>
        </div>

        <div className="relative mt-auto flex h-[10%] w-full items-center justify-center">
          <Separator className="absolute top-0" />
          <SideBarButtons>
            <LogOut size={20} className="" />
          </SideBarButtons>
        </div>
      </nav>
    </>
  );
}
