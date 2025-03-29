import axios from "axios";
import { ParamValue } from "next/dist/server/request/params";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getCustomer(query: string, accountID: ParamValue) {
  try {
    if (!query) return [];

    const response = await axios.get(`/api/${accountID}/cashier?name=${query}`);

    return response.data;
  } catch (error) {
    console.error("❌ Error fetching customers:", error);
    return [];
  }
}

export async function getServices(accountID: ParamValue) {
  try {
    const response = await axios.get(`/api/${accountID}`);
    console.log(response);
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching customers:", error);
  }
}

export function formatName(name: string) {
  return name
    .trim()
    .split(" ")
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
