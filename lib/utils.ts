import axios from "axios";
import { ParamValue } from "next/dist/server/request/params";
// REMOVE PrismaClient from here - it belongs on the backend server!
// import { PrismaClient } from "@prisma/client";

// REMOVE this - it belongs on the backend server!
// const prisma = new PrismaClient();

// Get the backend URL from environment variables
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL; // Use the one you set in Vercel

export async function getCustomer(query: string, accountID: ParamValue) {
  try {
    // Ensure the backend URL is configured
    if (!BACKEND_URL) {
      throw new Error(
        "Backend URL is not configured in environment variables.",
      );
    }
    if (!query) return [];

    // Construct the FULL URL using the environment variable
    const url = `${BACKEND_URL}/api/${accountID}/cashier?name=${query}`;
    console.log(`Fetching customers from: ${url}`); // Good for debugging

    const response = await axios.get(url);

    return response.data;
  } catch (error) {
    // Log the specific error from Axios if available
    if (axios.isAxiosError(error)) {
      console.error(
        "❌ Axios error fetching customers:",
        error.message,
        error.response?.data,
      );
    } else {
      console.error("❌ Error fetching customers:", error);
    }
    return [];
  }
}

export async function getServices(accountID: ParamValue) {
  try {
    // Ensure the backend URL is configured
    if (!BACKEND_URL) {
      throw new Error(
        "Backend URL is not configured in environment variables.",
      );
    }

    // Construct the FULL URL using the environment variable
    const url = `${BACKEND_URL}/api/${accountID}`;
    console.log(`Fetching services from: ${url}`); // Good for debugging

    const response = await axios.get(url);
    console.log(response); // Keep this if you need to debug the raw response
    return response.data;
  } catch (error) {
    // Log the specific error from Axios if available
    if (axios.isAxiosError(error)) {
      console.error(
        "❌ Axios error fetching services:",
        error.message,
        error.response?.data,
      );
    } else {
      console.error("❌ Error fetching services:", error);
    }
    return undefined;
  }
}

export function formatName(name: string) {
  return name
    .trim()
    .split(" ")
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
